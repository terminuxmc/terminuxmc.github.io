// Skill Tree page. Data: data/tree.json, made by Tools/SiteData/build_tree.py from the very data pack the game loads.
// Drawn on a canvas the way Pufferfish's Skills 0.19.2 draws its screen:
//   background: the category texture tiled at full brightness;
//   connections: a 3 px black stroke under a 1 px white line (GUI pixels), the same in every state;
//   frames: advancement sprites, size round(13 * size) * 2; "obtained" only when taken; locked and excluded nodes
//           tinted to 25% brightness;
//   icons: 16 * size, centered, never tinted;
//   coordinates: the data pack's x, y in GUI pixels, y down.
// A build planner sits on top: take and refund nodes, see the totals, share the build as a link.

(() => {
  const TMC = window.TMC;
  const S = { LOCKED: 0, AVAILABLE: 1, UNLOCKED: 2, EXCLUDED: 3 };
  const MC_COLORS = {
    black: "#000000", dark_blue: "#0000AA", dark_green: "#00AA00", dark_aqua: "#00AAAA", dark_red: "#AA0000",
    dark_purple: "#AA00AA", gold: "#FFAA00", gray: "#AAAAAA", dark_gray: "#555555", blue: "#5555FF",
    green: "#55FF55", aqua: "#55FFFF", red: "#FF5555", light_purple: "#FF55FF", yellow: "#FFFF55", white: "#FFFFFF",
  };
  const mcColor = (c) => (!c ? MC_COLORS.gray : c.startsWith("#") ? c : MC_COLORS[c] || MC_COLORS.gray);

  const plans = {}; // category id -> Set of taken node ids, kept while the site is open
  let current = null; // category id shown last

  // ---------- Images ----------

  const images = {};
  function image(src) {
    if (!images[src]) {
      const img = new Image();
      images[src] = { img, ready: false, tinted: null };
      img.onload = () => {
        images[src].ready = true;
        if (TMC._treeRedraw) TMC._treeRedraw();
      };
      img.src = src;
    }
    return images[src];
  }

  /** The sprite at 25% brightness, as Pufferfish's COLOR_GRAY (0.25, 0.25, 0.25, 1) multiplies it. */
  function tinted(entry) {
    if (entry.tinted || !entry.ready) return entry.tinted;
    const c = document.createElement("canvas");
    c.width = entry.img.naturalWidth;
    c.height = entry.img.naturalHeight;
    const g = c.getContext("2d");
    g.drawImage(entry.img, 0, 0);
    const data = g.getImageData(0, 0, c.width, c.height);
    for (let i = 0; i < data.data.length; i += 4) {
      data.data[i] *= 0.25;
      data.data[i + 1] *= 0.25;
      data.data[i + 2] *= 0.25;
    }
    g.putImageData(data, 0, 0);
    entry.tinted = c;
    return c;
  }

  // ---------- Tree model ----------

  /** Same rule as SkillTree.masteryOf in the mod: "sub_fire_flame_devil" -> "flame_devil". */
  function masteryOf(subId) {
    const start = subId.indexOf("_", 4);
    const name = (start < 0 ? "" : subId.substring(start + 1)).replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
    return name || "none";
  }
  const archetypeOf = (subId) => {
    const end = subId.indexOf("_", 4);
    return end < 0 ? "" : subId.substring(4, end);
  };

  function buildModel(cat) {
    if (cat._model) return cat._model;
    const nodes = new Map();
    cat.nodes.forEach((n, i) => nodes.set(n.id, { ...n, index: i, adj: [] }));
    for (const [a, b] of cat.edges) {
      const na = nodes.get(a);
      const nb = nodes.get(b);
      if (!na || !nb) continue;
      na.adj.push(b);
      nb.adj.push(a);
    }
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const n of nodes.values()) {
      minX = Math.min(minX, n.x);
      minY = Math.min(minY, n.y);
      maxX = Math.max(maxX, n.x);
      maxY = Math.max(maxY, n.y);
    }
    // Spatial grid for hit tests
    const CELL = 64;
    const grid = new Map();
    for (const n of nodes.values()) {
      const key = Math.floor(n.x / CELL) + "," + Math.floor(n.y / CELL);
      if (!grid.has(key)) grid.set(key, []);
      grid.get(key).push(n);
    }
    const roots = [...nodes.values()].filter((n) => n.root).map((n) => n.id);
    cat._model = { nodes, bounds: { minX, minY, maxX, maxY }, grid, CELL, roots };
    return cat._model;
  }

  function planOf(cat) {
    if (!plans[cat.id]) {
      plans[cat.id] = new Set();
      // Mastery trees: the root is free and taken from the start
      if (!cat.main) buildModel(cat).roots.forEach((r) => plans[cat.id].add(r));
    }
    return plans[cat.id];
  }

  /** The mod's SkillGate: one archetype, one subtype, and a subtype only with its own archetype. */
  function gate(id, state, taken) {
    if (state !== S.AVAILABLE || !(id.startsWith("arch_") || id.startsWith("sub_"))) return state;
    if (id.startsWith("arch_")) {
      for (const other of taken) if (other.startsWith("arch_") && other !== id) return S.EXCLUDED;
      return state;
    }
    const own = "arch_" + archetypeOf(id);
    let hasOwn = false;
    let hasOther = false;
    for (const other of taken) {
      if (other.startsWith("sub_") && other !== id) return S.EXCLUDED;
      if (other.startsWith("arch_")) {
        if (other === own) hasOwn = true;
        else hasOther = true;
      }
    }
    if (!hasOwn) return hasOther ? S.EXCLUDED : S.LOCKED;
    return state;
  }

  function stateOf(cat, id) {
    const model = buildModel(cat);
    const taken = planOf(cat);
    if (taken.has(id)) return S.UNLOCKED;
    const n = model.nodes.get(id);
    let state;
    if (n.root) {
      state = cat.exclusiveRoot && model.roots.some((r) => r !== id && taken.has(r)) ? S.EXCLUDED : S.AVAILABLE;
    } else {
      state = n.adj.some((a) => taken.has(a)) ? S.AVAILABLE : S.LOCKED;
    }
    return cat.main ? gate(id, state, taken) : state;
  }

  /** Removes a node and everything no longer connected to a taken root; a subtype goes with its archetype. */
  function refund(cat, id) {
    const model = buildModel(cat);
    const taken = planOf(cat);
    if (!cat.main && model.nodes.get(id).root) return; // a mastery root stays
    taken.delete(id);
    const keep = new Set();
    const queue = model.roots.filter((r) => taken.has(r));
    queue.forEach((r) => keep.add(r));
    while (queue.length) {
      const cur = queue.pop();
      for (const a of model.nodes.get(cur).adj) {
        if (taken.has(a) && !keep.has(a)) {
          keep.add(a);
          queue.push(a);
        }
      }
    }
    for (const t of [...taken]) if (!keep.has(t)) taken.delete(t);
    for (const t of [...taken]) {
      if (t.startsWith("sub_") && !taken.has("arch_" + archetypeOf(t))) taken.delete(t);
    }
  }

  function take(cat, id) {
    if (stateOf(cat, id) === S.AVAILABLE) planOf(cat).add(id);
  }

  function pointsSpent(cat) {
    const model = buildModel(cat);
    let sum = 0;
    for (const id of planOf(cat)) {
      const def = cat.defs[model.nodes.get(id).d];
      sum += def && def.c !== undefined ? def.c : 1;
    }
    return sum;
  }

  // ---------- Share links: node indices as delta varints in base64url ----------

  function encodePlan(cat) {
    const model = buildModel(cat);
    const idx = [...planOf(cat)].map((id) => model.nodes.get(id).index).sort((a, b) => a - b);
    const bytes = [];
    let prev = -1;
    for (const i of idx) {
      let d = i - prev - 1;
      prev = i;
      do {
        let b = d & 0x7f;
        d >>>= 7;
        if (d) b |= 0x80;
        bytes.push(b);
      } while (d);
    }
    let bin = "";
    bytes.forEach((b) => (bin += String.fromCharCode(b)));
    return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }

  function decodePlan(cat, text) {
    try {
      const bin = atob(text.replace(/-/g, "+").replace(/_/g, "/"));
      const set = new Set();
      let prev = -1;
      for (let p = 0; p < bin.length; ) {
        let d = 0;
        let shift = 0;
        let b;
        do {
          b = bin.charCodeAt(p++);
          d |= (b & 0x7f) << shift;
          shift += 7;
        } while (b & 0x80 && p < bin.length);
        prev = prev + d + 1;
        if (cat.nodes[prev]) set.add(cat.nodes[prev].id);
      }
      if (!cat.main) buildModel(cat).roots.forEach((r) => set.add(r));
      return set;
    } catch {
      return null;
    }
  }

  // ---------- Totals ----------

  function fmtSigned(v) {
    const r = Math.round(v * 1000) / 1000;
    return (r > 0 ? "+" : r < 0 ? "−" : "") + Math.abs(r).toLocaleString("en-US", { maximumFractionDigits: 3 });
  }

  /** Everything the taken nodes give: attribute sums by label, and the mastery effects. */
  function totals(data, cat) {
    const model = buildModel(cat);
    const sums = new Map();
    const effects = [];
    for (const id of planOf(cat)) {
      const def = cat.defs[model.nodes.get(id).d];
      if (!def) continue;
      for (const r of def.r) sums.set(r.a, (sums.get(r.a) || 0) + r.v);
      if (def.g && def.g.length) {
        effects.push({ title: def.t, text: def.d.filter(([, c]) => c === "gold").map(([t]) => t).join(" ") });
      }
    }
    const rows = [...sums.entries()]
      .map(([key, v]) => {
        const label = data.labels[key] || { name: key.split("|")[0], pct: false };
        return { name: label.name, value: fmtSigned(label.pct ? v * 100 : v) + (label.pct ? "%" : "") };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
    return { rows, effects };
  }

  function totalsHtml(data, cat) {
    const { rows, effects } = totals(data, cat);
    const stats = rows.length
      ? rows.map((r) => `<div class="tt-row"><span>${TMC.esc(r.name)}</span><b>${TMC.esc(r.value)}</b></div>`).join("")
      : `<p class="small-note">Click glowing nodes on the tree to plan a build; what they give adds up here.</p>`;
    const eff = effects.length
      ? `<p class="eyebrow">Effects</p>${effects
          .map((e) => `<div class="tt-effect"><b>${TMC.esc(e.title)}</b><span>${TMC.esc(e.text)}</span></div>`)
          .join("")}`
      : "";
    return `<p class="eyebrow">Gained from this tree</p><div class="tt-rows">${stats}</div>${eff}`;
  }

  // Exposed for tests
  TMC._tree = { S, buildModel, planOf, stateOf, take, refund, pointsSpent, encodePlan, decodePlan, totals, masteryOf, plans };

  // ---------- Page ----------

  TMC.PAGES.tree = async (el, args) => {
    el.innerHTML = `<div class="page-head"><h1>Skill Tree</h1></div>`;
    let data;
    try {
      data = await TMC.loadJson("data/tree.json");
    } catch {
      el.innerHTML = `<div class="page-head"><h1>Skill Tree</h1></div><section class="placeholder"><p>Could not load the skill tree.</p></section>`;
      TMC.animateIn(el);
      return;
    }
    const cats = new Map(data.categories.map((c) => [c.id, c]));
    const main = data.categories.find((c) => c.main) || data.categories[0];

    // A shared build: #tree/<category>/<encoded>
    let catId = current && cats.has(current) ? current : main.id;
    if (args && args[0] && cats.has(args[0])) {
      catId = args[0];
      if (args[1]) {
        const set = decodePlan(cats.get(catId), args[1]);
        if (set) plans[catId] = set;
      }
    }

    // Mastery trees grouped by archetype, from the main tree's subtype and archetype nodes
    const groups = new Map();
    for (const n of main.nodes) {
      if (!n.id.startsWith("sub_")) continue;
      const mid = masteryOf(n.id);
      if (!cats.has(mid)) continue;
      const arch = main.nodes.find((x) => x.id === "arch_" + archetypeOf(n.id));
      const archTitle = arch ? main.defs[arch.d].t : archetypeOf(n.id);
      if (!groups.has(archTitle)) groups.set(archTitle, []);
      groups.get(archTitle).push(cats.get(mid));
    }
    const options =
      `<option value="${main.id}">Main tree</option>` +
      [...groups.entries()]
        .map(
          ([arch, list]) =>
            `<optgroup label="${TMC.esc(arch)} masteries">${list
              .map((c) => `<option value="${c.id}">${TMC.esc(c.title)}</option>`)
              .join("")}</optgroup>`
        )
        .join("");

    el.innerHTML = `
      <div class="page-head"><h1>Skill Tree</h1><span class="count tree-points"></span></div>
      <div class="tree-bar">
        <select class="tree-select" aria-label="Tree">${options}</select>
        <div class="tree-tools">
          <button type="button" class="icon-btn" data-act="out" aria-label="Zoom out">−</button>
          <button type="button" class="icon-btn" data-act="in" aria-label="Zoom in">+</button>
          <button type="button" class="btn" data-act="center">Center</button>
          <button type="button" class="btn" data-act="reset">Reset</button>
          <button type="button" class="btn btn-gold" data-act="copy">Copy link</button>
        </div>
      </div>
      <div class="tree-layout">
        <div class="tree-wrap">
          <canvas class="tree-canvas" aria-label="Skill tree. Drag to move, scroll to zoom, click a node to take or refund it."></canvas>
          <div class="mc-tooltip" hidden></div>
          <div class="tree-jump" hidden></div>
          <p class="tree-hint">Drag to move · Scroll or pinch to zoom · Click a node to take or refund it</p>
        </div>
        <aside class="tree-side"></aside>
      </div>`;
    TMC.animateIn(el);

    const select = el.querySelector(".tree-select");
    const wrap = el.querySelector(".tree-wrap");
    const canvas = el.querySelector(".tree-canvas");
    const tip = el.querySelector(".mc-tooltip");
    const side = el.querySelector(".tree-side");
    const pointsBox = el.querySelector(".tree-points");
    const jump = el.querySelector(".tree-jump");
    const ctx = canvas.getContext("2d");
    const frames = {};
    for (const [k, src] of Object.entries(data.frames)) frames[k] = image(src);

    const view = { x: 0, y: 0, scale: 2 };
    let cat = cats.get(catId);
    let hover = null;
    let queued = false;

    const shareHash = () => `#tree/${cat.id}/${encodePlan(cat)}`;

    function centerView() {
      const b = buildModel(cat).bounds;
      if (cat.main) {
        // The game opens on the two starts in the middle of the tree
        view.x = 0;
        view.y = 0;
        view.scale = 2;
      } else {
        view.x = (b.minX + b.maxX) / 2;
        view.y = (b.minY + b.maxY) / 2;
        const w = canvas.clientWidth || 800;
        const h = canvas.clientHeight || 600;
        view.scale = Math.max(0.5, Math.min(3, Math.min(w / (b.maxX - b.minX + 120), h / (b.maxY - b.minY + 120))));
      }
      redraw();
    }

    function refreshPanel() {
      current = cat.id;
      pointsBox.textContent = `${pointsSpent(cat)} points spent`;
      side.innerHTML = totalsHtml(data, cat);
      // A taken subtype on the main tree: offer its mastery tree
      const sub = cat.main ? [...planOf(cat)].find((id) => id.startsWith("sub_")) : null;
      const mid = sub && masteryOf(sub);
      if (mid && cats.has(mid)) {
        jump.hidden = false;
        jump.innerHTML = `<button type="button" class="btn btn-gold" data-mastery="${mid}">Open the ${TMC.esc(cats.get(mid).title)} mastery</button>`;
      } else jump.hidden = true;
      // The address always holds the build, so a reload or a copied address restores it
      history.replaceState(null, "", shareHash());
    }

    function redraw() {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => {
        queued = false;
        draw();
      });
    }
    TMC._treeRedraw = redraw;

    const ro = new ResizeObserver(() => {
      if (!canvas.isConnected) return ro.disconnect();
      const dpr = window.devicePixelRatio || 1;
      const w = Math.max(1, Math.round(canvas.clientWidth * dpr));
      const h = Math.max(1, Math.round(canvas.clientHeight * dpr));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      redraw();
    });
    ro.observe(canvas);

    const toWorld = (px, py) => ({
      x: view.x + (px - canvas.clientWidth / 2) / view.scale,
      y: view.y + (py - canvas.clientHeight / 2) / view.scale,
    });

    function draw() {
      if (!canvas.isConnected) return;
      const dpr = window.devicePixelRatio || 1;
      const W = canvas.width;
      const H = canvas.height;
      const k = view.scale * dpr;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, W, H);
      ctx.setTransform(k, 0, 0, k, W / 2 - view.x * k, H / 2 - view.y * k);
      ctx.imageSmoothingEnabled = false;

      const tl = toWorld(0, 0);
      const br = toWorld(canvas.clientWidth, canvas.clientHeight);
      const model = buildModel(cat);

      // Background, tiled from the tree's top left corner, at full brightness
      const bg = image(cat.bg.src);
      if (bg.ready) {
        const tw = cat.bg.w;
        const th = cat.bg.h;
        const bx = model.bounds.minX;
        const by = model.bounds.minY;
        const sx = bx + Math.floor((tl.x - bx) / tw) * tw;
        const sy = by + Math.floor((tl.y - by) / th) * th;
        for (let y = sy; y < br.y; y += th) for (let x = sx; x < br.x; x += tw) ctx.drawImage(bg.img, x, y, tw + 0.02, th + 0.02);
      }

      const margin = 40;

      // Connections: a black stroke 3 wide under a white line 1 wide
      const segs = [];
      for (const [a, b] of cat.edges) {
        const na = model.nodes.get(a);
        const nb = model.nodes.get(b);
        if (!na || !nb) continue;
        if (Math.max(na.x, nb.x) < tl.x - margin || Math.min(na.x, nb.x) > br.x + margin) continue;
        if (Math.max(na.y, nb.y) < tl.y - margin || Math.min(na.y, nb.y) > br.y + margin) continue;
        segs.push(na, nb);
      }
      ctx.lineCap = "butt";
      for (const [width, color] of [[3, "#000"], [1, "#fff"]]) {
        ctx.beginPath();
        for (let i = 0; i < segs.length; i += 2) {
          ctx.moveTo(segs[i].x, segs[i].y);
          ctx.lineTo(segs[i + 1].x, segs[i + 1].y);
        }
        ctx.lineWidth = width;
        ctx.strokeStyle = color;
        ctx.stroke();
      }

      // Frames, then icons on top
      for (const n of model.nodes.values()) {
        if (n.x < tl.x - margin || n.x > br.x + margin || n.y < tl.y - margin || n.y > br.y + margin) continue;
        const def = cat.defs[n.d];
        if (!def) continue;
        const state = stateOf(cat, n.id);
        const fs = Math.round(13 * def.s) * 2;
        const frame = frames[`${def.f}_${state === S.UNLOCKED ? "obtained" : "unobtained"}`];
        if (frame && frame.ready) {
          const src = state === S.LOCKED || state === S.EXCLUDED ? tinted(frame) : frame.img;
          if (src) ctx.drawImage(src, n.x - fs / 2, n.y - fs / 2, fs, fs);
        }
        if (def.i) {
          const icon = image(def.i);
          if (icon.ready) {
            const is = 16 * def.s;
            ctx.drawImage(icon.img, n.x - is / 2, n.y - is / 2, is, is);
          }
        }
      }
    }

    function nodeAt(px, py) {
      const w = toWorld(px, py);
      const model = buildModel(cat);
      const cx = Math.floor(w.x / model.CELL);
      const cy = Math.floor(w.y / model.CELL);
      let best = null;
      for (let gx = cx - 1; gx <= cx + 1; gx++) {
        for (let gy = cy - 1; gy <= cy + 1; gy++) {
          for (const n of model.grid.get(gx + "," + gy) || []) {
            const def = cat.defs[n.d];
            const half = (def ? Math.round(13 * def.s) * 2 : 26) / 2;
            if (Math.abs(w.x - n.x) <= half && Math.abs(w.y - n.y) <= half) best = n;
          }
        }
      }
      return best;
    }

    function showTip(n, px, py) {
      if (!n) {
        tip.hidden = true;
        return;
      }
      const def = cat.defs[n.d];
      if (!def) return;
      if (hover !== n || tip.hidden) {
        tip.innerHTML =
          `<div class="mc-title">${TMC.esc(def.t)}</div>` +
          def.d.map(([t, c]) => `<div style="color:${mcColor(c)}">${TMC.esc(t)}</div>`).join("");
      }
      tip.hidden = false;
      const r = wrap.getBoundingClientRect();
      let x = px + 16;
      let y = py - 10;
      if (x + tip.offsetWidth > r.width - 8) x = px - tip.offsetWidth - 16;
      if (y + tip.offsetHeight > r.height - 8) y = r.height - tip.offsetHeight - 8;
      tip.style.transform = `translate(${Math.max(4, x)}px, ${Math.max(4, y)}px)`;
    }

    // ---- Pointer: drag, pinch, click ----

    const pointers = new Map();
    let moved = 0;
    let pinch = null;

    function zoomAt(px, py, factor) {
      const before = toWorld(px, py);
      view.scale = Math.max(0.25, Math.min(6, view.scale * factor));
      const after = toWorld(px, py);
      view.x += before.x - after.x;
      view.y += before.y - after.y;
      redraw();
    }

    canvas.addEventListener("pointerdown", (e) => {
      canvas.setPointerCapture(e.pointerId);
      pointers.set(e.pointerId, { x: e.offsetX, y: e.offsetY });
      if (pointers.size === 1) moved = 0;
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, scale: view.scale };
      }
      if (e.pointerType !== "mouse") tip.hidden = true;
    });
    canvas.addEventListener("pointermove", (e) => {
      const p = pointers.get(e.pointerId);
      if (!p) {
        if (e.pointerType === "mouse") {
          const n = nodeAt(e.offsetX, e.offsetY);
          showTip(n, e.offsetX, e.offsetY);
          hover = n;
          canvas.style.cursor = n ? "pointer" : "grab";
        }
        return;
      }
      const dx = e.offsetX - p.x;
      const dy = e.offsetY - p.y;
      p.x = e.offsetX;
      p.y = e.offsetY;
      if (pointers.size === 2 && pinch) {
        const [a, b] = [...pointers.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        zoomAt((a.x + b.x) / 2, (a.y + b.y) / 2, (pinch.scale * d) / pinch.d / view.scale);
        moved += 10;
        return;
      }
      moved += Math.abs(dx) + Math.abs(dy);
      if (moved > 6) {
        tip.hidden = true;
        canvas.style.cursor = "grabbing";
      }
      view.x -= dx / view.scale;
      view.y -= dy / view.scale;
      redraw();
    });
    const endPointer = (e) => {
      const p = pointers.get(e.pointerId);
      pointers.delete(e.pointerId);
      if (pointers.size < 2) pinch = null;
      canvas.style.cursor = "grab";
      if (!p || moved > 6 || e.type === "pointercancel" || pointers.size > 0) return;
      const n = nodeAt(e.offsetX, e.offsetY);
      if (!n) {
        tip.hidden = true;
        return;
      }
      const state = stateOf(cat, n.id);
      if (state === S.UNLOCKED) refund(cat, n.id);
      else if (state === S.AVAILABLE) take(cat, n.id);
      // On touch a tap also shows the node's tooltip, since there is no hover
      if (e.pointerType !== "mouse") showTip(n, e.offsetX, e.offsetY);
      if (state === S.UNLOCKED || state === S.AVAILABLE) {
        refreshPanel();
        redraw();
      }
    };
    canvas.addEventListener("pointerup", endPointer);
    canvas.addEventListener("pointercancel", endPointer);
    canvas.addEventListener("pointerleave", (e) => {
      if (e.pointerType === "mouse" && !pointers.size) {
        tip.hidden = true;
        hover = null;
      }
    });
    canvas.addEventListener(
      "wheel",
      (e) => {
        e.preventDefault();
        tip.hidden = true;
        zoomAt(e.offsetX, e.offsetY, Math.exp(-e.deltaY * 0.0015));
      },
      { passive: false }
    );

    // ---- Controls ----

    el.querySelector(".tree-tools").addEventListener("click", async (e) => {
      const b = e.target.closest("[data-act]");
      if (!b) return;
      const act = b.dataset.act;
      if (act === "in") zoomAt(canvas.clientWidth / 2, canvas.clientHeight / 2, 1.25);
      if (act === "out") zoomAt(canvas.clientWidth / 2, canvas.clientHeight / 2, 0.8);
      if (act === "center") centerView();
      if (act === "reset") {
        delete plans[cat.id];
        planOf(cat);
        refreshPanel();
        redraw();
      }
      if (act === "copy") {
        const url = location.origin + location.pathname + shareHash();
        try {
          await navigator.clipboard.writeText(url);
          b.textContent = "Copied";
        } catch {
          b.textContent = "Copy failed";
        }
        setTimeout(() => (b.textContent = "Copy link"), 1600);
      }
    });

    function switchTo(id) {
      cat = cats.get(id);
      select.value = id;
      hover = null;
      tip.hidden = true;
      wrap.classList.remove("swap-in");
      void wrap.offsetWidth;
      wrap.classList.add("swap-in");
      refreshPanel();
      centerView();
    }
    select.addEventListener("change", () => switchTo(select.value));
    jump.addEventListener("click", (e) => {
      const b = e.target.closest("[data-mastery]");
      if (b) switchTo(b.dataset.mastery);
    });

    select.value = cat.id;
    refreshPanel();
    centerView();
  };
})();
