// Profile: the characters the game sends (players/{mcUuid}/worlds/{worldId}, see ProfileSync in the mod).
// auth.js draws the page head and the linked Minecraft accounts, then calls TMC.renderProfile with Firestore helpers.
// One card per world: header, skill trees (read-only, the main tree and the chosen mastery), stats gained from the
// trees, all stats (basic first, the rest grouped), equipment, relic slots (empty and belt-added ones too), the
// spellbook's spells, inventory relics and tools.

(() => {
  const TMC = window.TMC;
  const esc = TMC.esc;
  const TIERS = ["Haven", "Frontier", "Ascent", "Summit", "Pinnacle"];
  const SLOT_NAMES = { head: "Head", chest: "Chest", legs: "Legs", feet: "Feet", mainhand: "Main hand", offhand: "Off hand", lastWeapon: "Last weapon" };
  const MC = { gray: "#AAAAAA", gold: "#FFAA00", white: "#FFFFFF", green: "#55FF55", aqua: "#55FFFF", red: "#FF5555", yellow: "#FFFF55", dark_gray: "#555555", light_purple: "#FF55FF", blue: "#5555FF" };
  const mcColor = (c) => (!c ? MC.gray : c.startsWith("#") ? c : MC[c] || MC.gray);
  const RARITY_COLORS = { common: "#9a9a9a", uncommon: "#33ff33", rare: "#5555ff", epic: "#bb00bb", mythic: "#ed7014" };

  // ---------- Icons: items, relics and tree icons the site already has ----------

  let iconsReady = null;
  function loadIcons() {
    if (iconsReady) return iconsReady;
    iconsReady = (async () => {
      const map = new Map();
      const spells = new Map();
      try {
        (await TMC.loadJson("data/items.json")).items.forEach((i) => map.set(i.id, i.icon));
      } catch {}
      try {
        (await TMC.loadJson("data/relics.json")).relics.forEach((r) => map.set(`${r.namespace}:${r.id}`, r.icon));
      } catch {}
      try {
        const s = await TMC.loadJson("data/spells.json");
        s.spells.forEach((sp) => spells.set(sp.id, sp));
      } catch {}
      return { map, spells };
    })();
    return iconsReady;
  }

  const fmtTime = (ms) => {
    if (!ms) return "";
    const d = Date.now() - ms;
    if (d < 60_000) return "just now";
    if (d < 3_600_000) return `${Math.round(d / 60_000)} min ago`;
    if (d < 86_400_000) return `${Math.round(d / 3_600_000)} h ago`;
    return new Date(ms).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  };

  // ---------- Stats ----------

  const FLAT = new Set([
    "minecraft:generic.max_health", "minecraft:generic.armor", "minecraft:generic.armor_toughness", "minecraft:generic.attack_damage",
    "minecraft:generic.attack_speed", "minecraft:generic.movement_speed", "minecraft:generic.luck", "minecraft:generic.attack_knockback",
    "minecraft:generic.max_absorption", "minecraft:generic.step_height", "minecraft:generic.scale", "minecraft:generic.gravity",
    "minecraft:generic.safe_fall_distance", "minecraft:generic.fall_damage_multiplier", "minecraft:generic.jump_strength",
    "minecraft:player.block_interaction_range", "minecraft:player.entity_interaction_range", "minecraft:player.block_break_speed",
    "irons_spellbooks:max_mana", "apothic_attributes:armor_pierce", "apothic_attributes:prot_pierce", "terminux:magic_resist",
    "terminux:magic_penetration", "minecraft:generic.follow_range", "minecraft:generic.oxygen_bonus", "minecraft:generic.burning_time",
  ]);
  function fmtStat(s) {
    const n = (v, d = 2) => (Math.round(v * 10 ** d) / 10 ** d).toLocaleString("en-US", { maximumFractionDigits: d });
    if (FLAT.has(s.id)) return n(s.value);
    if (s.base === 1 && /irons_spellbooks|terminux:.*_spell_power|_magic_resist/.test(s.id)) return `${n(s.value * 100, 1)}%`;
    if (Math.abs(s.value) <= 10) return `${n(s.value * 100, 1)}%`;
    return n(s.value);
  }
  const GROUPS = [
    ["Offense", /attack|crit|pierce|shred|penetration|execute|rage|backstab|combo|cleave|arrow|projectile|weapon|multishot|ricochet|draw|range_damage|roll_strike|current_hp/],
    ["Magic", /spell|mana|cast|cooldown|summon|magic_pen|magic_shred|heresy|healing_power/],
    ["Defense", /armor|toughness|health|knockback_res|resist|dodge|reduction|protection|absorption|last_stand|reflection|status/],
    ["Sustain", /life_steal|healing|overheal|regen/],
  ];
  const groupOf = (id) => (GROUPS.find(([, re]) => re.test(id)) || ["Other"])[0];

  function statsHtml(stats) {
    const basic = stats.filter((s) => s.basic);
    const rest = stats.filter((s) => !s.basic && s.value !== s.base);
    const row = (s) => `<div class="pf-stat"><span>${esc(s.name)}</span><b>${esc(fmtStat(s))}</b></div>`;
    const groups = new Map();
    for (const s of rest) {
      const g = groupOf(s.id);
      if (!groups.has(g)) groups.set(g, []);
      groups.get(g).push(s);
    }
    const order = ["Offense", "Magic", "Defense", "Sustain", "Other"];
    const detail = order
      .filter((g) => groups.has(g))
      .map((g) => `<div class="pf-group"><p class="eyebrow">${g}</p>${groups.get(g).sort((a, b) => a.name.localeCompare(b.name)).map(row).join("")}</div>`)
      .join("");
    return `
      <div class="pf-stats">${basic.sort((a, b) => a.name.localeCompare(b.name)).map(row).join("")}</div>
      ${detail ? `<details class="pf-more"><summary>All stats</summary><div class="pf-groups">${detail}</div></details>` : ""}`;
  }

  // ---------- Items ----------

  function itemHtml(it, icons, extraClass = "") {
    if (!it) return `<div class="pf-item empty ${extraClass}"></div>`;
    const icon = icons.map.get(it.id);
    const color = it.rarity ? RARITY_COLORS[it.rarity] : it.color;
    const letter = esc((it.name || "?").charAt(0));
    return `
      <button type="button" class="pf-item ${extraClass}" data-item='${esc(JSON.stringify(it))}' aria-label="${esc(it.name)}">
        ${icon ? `<img src="${icon}" alt="" width="40" height="40" loading="lazy">` : `<span class="pf-letter">${letter}</span>`}
        ${it.count > 1 ? `<span class="pf-count">${it.count}</span>` : ""}
        ${it.relicLevel !== undefined ? `<span class="pf-lvl" style="--c:${color || "var(--gold)"}">${it.relicLevel}</span>` : ""}
      </button>`;
  }

  function tipHtml(it) {
    const color = it.rarity ? RARITY_COLORS[it.rarity] : it.color || "#ffffff";
    const lines = [];
    if (it.rarity) lines.push(`<div class="pf-tip-sub" style="color:${color}">${esc(it.rarity.charAt(0).toUpperCase() + it.rarity.slice(1))} relic · level ${it.relicLevel ?? 0}</div>`);
    for (const l of it.tooltip || []) lines.push(l ? `<div>${esc(l)}</div>` : `<div class="pf-gap"></div>`);
    if (it.maxDurability) lines.push(`<div class="pf-tip-sub">Durability ${it.durability} / ${it.maxDurability}</div>`);
    return `<div class="pf-tip-name" style="color:${color}">${esc(it.name)}</div>${lines.join("")}`;
  }

  function equipmentHtml(snap, icons) {
    const eq = snap.equipment || {};
    const slot = (key) => `<div class="pf-slot"><span class="pf-slot-name">${SLOT_NAMES[key]}</span>${itemHtml(eq[key], icons)}</div>`;
    const relicSlots = (snap.relicSlots || [])
      .map((s) => {
        const items = s.items.map((it, i) => itemHtml(it, icons, i >= s.size - s.bonus ? "bonus" : "")).join("");
        return `<div class="pf-relic-type"><span class="pf-slot-name">${esc(s.type.replace(/_/g, " "))} <em>${s.used}/${s.size}</em></span><div class="pf-row">${items}</div></div>`;
      })
      .join("");
    const list = (title, arr) =>
      arr && arr.length ? `<div class="pf-block"><p class="eyebrow">${title}</p><div class="pf-row wrap">${arr.map((it) => itemHtml(it, icons)).join("")}</div></div>` : "";
    let spells = "";
    if (snap.spellbook) {
      const sp = (snap.spellbook.spells || [])
        .map((s) => {
          const meta = icons.spells.get(s.id);
          return `<div class="pf-spell" title="${esc(meta ? meta.name : s.id)}" style="--sc:${(meta && meta.schoolColor) || "var(--border-strong)"}">
            ${meta && meta.icon ? `<img src="${meta.icon}" alt="" width="36" height="36" loading="lazy">` : `<span class="pf-letter">${esc(s.id.split(":")[1].charAt(0))}</span>`}
            <span class="pf-spell-name">${esc(meta ? meta.name : s.id.split(":")[1])}</span><b>${s.level}</b></div>`;
        })
        .join("");
      spells = `<div class="pf-block"><p class="eyebrow">Spellbook</p><div class="pf-book">${itemHtml(snap.spellbook.item, icons)}<div class="pf-spells">${sp}</div></div></div>`;
    }
    return `
      <div class="pf-equip">
        <div class="pf-block"><p class="eyebrow">Armor</p><div class="pf-col">${["head", "chest", "legs", "feet"].map(slot).join("")}</div></div>
        <div class="pf-block"><p class="eyebrow">Hands</p><div class="pf-col">${["mainhand", "offhand", "lastWeapon"].map(slot).join("")}</div></div>
        ${relicSlots ? `<div class="pf-block pf-relics"><p class="eyebrow">Relic slots</p>${relicSlots}</div>` : ""}
      </div>
      ${spells}
      ${list("Relics in the inventory", snap.inventoryRelics)}
      ${list("Tools", snap.tools)}`;
  }

  // ---------- Skill trees: read-only canvas, same art as the Skill Tree page ----------

  const imgCache = {};
  function img(src, onload) {
    if (!imgCache[src]) {
      const e = { img: new Image(), ready: false, cbs: [] };
      e.img.onload = () => {
        e.ready = true;
        e.cbs.forEach((f) => f());
      };
      e.img.src = src;
      imgCache[src] = e;
    }
    const e = imgCache[src];
    if (!e.ready && onload) e.cbs.push(onload);
    return e;
  }
  const tintCache = new Map();
  function dark(e) {
    if (!e.ready) return null;
    if (tintCache.has(e)) return tintCache.get(e);
    const c = document.createElement("canvas");
    c.width = e.img.width;
    c.height = e.img.height;
    const x = c.getContext("2d");
    x.drawImage(e.img, 0, 0);
    x.globalCompositeOperation = "source-atop";
    x.fillStyle = "rgba(0,0,0,0.75)";
    x.fillRect(0, 0, c.width, c.height);
    tintCache.set(e, c);
    return c;
  }

  function treeTotals(data, cat, taken) {
    const sums = new Map();
    const effects = [];
    const byId = new Map(cat.nodes.map((n) => [n.id, n]));
    for (const id of taken) {
      const n = byId.get(id);
      const def = n && cat.defs[n.d];
      if (!def) continue;
      for (const r of def.r || []) sums.set(r.a, (sums.get(r.a) || 0) + r.v);
      if (def.g && def.g.length) effects.push({ title: def.t, text: def.d.filter(([, c]) => c === "gold").map(([t]) => t).join(" ") });
    }
    const sign = (v) => {
      const r = Math.round(v * 1000) / 1000;
      return (r > 0 ? "+" : r < 0 ? "−" : "") + Math.abs(r).toLocaleString("en-US", { maximumFractionDigits: 3 });
    };
    const rows = [...sums.entries()]
      .map(([k, v]) => {
        const l = data.labels[k] || { name: k.split("|")[0], pct: false };
        return { name: l.name, value: sign(l.pct ? v * 100 : v) + (l.pct ? "%" : "") };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
    return { rows, effects };
  }

  function mountTree(box, data, cat, taken) {
    const canvas = box.querySelector("canvas");
    const tip = box.querySelector(".mc-tooltip");
    const ctx = canvas.getContext("2d");
    const nodes = cat.nodes;
    const byId = new Map(nodes.map((n) => [n.id, n]));
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    const focus = nodes.filter((n) => taken.has(n.id));
    for (const n of focus.length ? focus : nodes) {
      minX = Math.min(minX, n.x);
      minY = Math.min(minY, n.y);
      maxX = Math.max(maxX, n.x);
      maxY = Math.max(maxY, n.y);
    }
    const view = { x: (minX + maxX) / 2, y: (minY + maxY) / 2, scale: 1 };
    const fit = () => {
      const w = canvas.clientWidth || 600;
      const h = canvas.clientHeight || 400;
      view.scale = Math.max(0.7, Math.min(2.5, Math.min(w / (maxX - minX + 160), h / (maxY - minY + 160))));
    };
    const frames = {};
    for (const [k, src] of Object.entries(data.frames)) frames[k] = img(src, () => redraw());
    let queued = false;
    const redraw = () => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => {
        queued = false;
        draw();
      });
    };
    function draw() {
      if (!canvas.isConnected) return;
      const dpr = window.devicePixelRatio || 1;
      const W = Math.max(1, Math.round(canvas.clientWidth * dpr));
      const H = Math.max(1, Math.round(canvas.clientHeight * dpr));
      if (canvas.width !== W || canvas.height !== H) {
        canvas.width = W;
        canvas.height = H;
      }
      const k = view.scale * dpr;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, W, H);
      ctx.setTransform(k, 0, 0, k, W / 2 - view.x * k, H / 2 - view.y * k);
      ctx.imageSmoothingEnabled = false;
      const bg = img(cat.bg.src, redraw);
      const tl = { x: view.x - W / 2 / k, y: view.y - H / 2 / k };
      const br = { x: view.x + W / 2 / k, y: view.y + H / 2 / k };
      if (bg.ready) {
        const tw = cat.bg.w, th = cat.bg.h;
        const sx = Math.floor(tl.x / tw) * tw, sy = Math.floor(tl.y / th) * th;
        for (let y = sy; y < br.y; y += th) for (let x = sx; x < br.x; x += tw) ctx.drawImage(bg.img, x, y, tw + 0.02, th + 0.02);
      }
      for (const [width, color] of [[3, "#000"], [1, "#fff"]]) {
        ctx.beginPath();
        for (const [a, b] of cat.edges) {
          const na = byId.get(a), nb = byId.get(b);
          if (!na || !nb) continue;
          ctx.moveTo(na.x, na.y);
          ctx.lineTo(nb.x, nb.y);
        }
        ctx.lineWidth = width;
        ctx.strokeStyle = color;
        ctx.stroke();
      }
      for (const n of nodes) {
        if (n.x < tl.x - 40 || n.x > br.x + 40 || n.y < tl.y - 40 || n.y > br.y + 40) continue;
        const def = cat.defs[n.d];
        if (!def) continue;
        const on = taken.has(n.id);
        const fs = Math.round(13 * def.s) * 2;
        const fr = frames[`${def.f}_${on ? "obtained" : "unobtained"}`];
        if (fr && fr.ready) {
          const src = on ? fr.img : dark(fr);
          if (src) ctx.drawImage(src, n.x - fs / 2, n.y - fs / 2, fs, fs);
        }
        if (def.i) {
          const ic = img(def.i, redraw);
          if (ic.ready) {
            const is = 16 * def.s;
            ctx.drawImage(ic.img, n.x - is / 2, n.y - is / 2, is, is);
          }
        }
      }
    }
    const toWorld = (px, py) => ({ x: view.x + (px - canvas.clientWidth / 2) / view.scale, y: view.y + (py - canvas.clientHeight / 2) / view.scale });
    const nodeAt = (px, py) => {
      const w = toWorld(px, py);
      let best = null;
      for (const n of nodes) {
        const def = cat.defs[n.d];
        const half = (def ? Math.round(13 * def.s) * 2 : 26) / 2;
        if (Math.abs(w.x - n.x) <= half && Math.abs(w.y - n.y) <= half) best = n;
      }
      return best;
    };
    let drag = null;
    canvas.addEventListener("pointerdown", (e) => {
      drag = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y };
      canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener("pointermove", (e) => {
      const r = canvas.getBoundingClientRect();
      if (drag) {
        view.x = drag.vx - (e.clientX - drag.x) / view.scale;
        view.y = drag.vy - (e.clientY - drag.y) / view.scale;
        tip.hidden = true;
        redraw();
        return;
      }
      const n = nodeAt(e.clientX - r.left, e.clientY - r.top);
      if (!n) {
        tip.hidden = true;
        return;
      }
      const def = cat.defs[n.d];
      tip.innerHTML = `<div class="mc-title">${esc(def.t)}</div>` + (def.d || []).map(([t, c]) => `<div style="color:${mcColor(c)}">${esc(t)}</div>`).join("");
      tip.hidden = false;
      const x = Math.min(e.clientX - r.left + 14, r.width - tip.offsetWidth - 6);
      const y = Math.min(e.clientY - r.top + 14, r.height - tip.offsetHeight - 6);
      tip.style.transform = `translate(${Math.max(6, x)}px, ${Math.max(6, y)}px)`;
    });
    const end = () => (drag = null);
    canvas.addEventListener("pointerup", end);
    canvas.addEventListener("pointercancel", end);
    canvas.addEventListener("pointerleave", () => (tip.hidden = true));
    canvas.addEventListener(
      "wheel",
      (e) => {
        e.preventDefault();
        view.scale = Math.max(0.25, Math.min(4, view.scale * (e.deltaY < 0 ? 1.15 : 1 / 1.15)));
        redraw();
      },
      { passive: false }
    );
    const ro = new ResizeObserver(() => {
      if (!canvas.isConnected) return ro.disconnect();
      redraw();
    });
    ro.observe(canvas);
    fit();
    redraw();
  }

  async function treesHtml(snap) {
    const skills = snap.skills;
    if (!skills || !skills.categories || !skills.categories.length) return { html: "", mount: () => {} };
    let data;
    try {
      data = await TMC.loadJson("data/tree.json");
    } catch {
      return { html: "", mount: () => {} };
    }
    const cats = new Map(data.categories.map((c) => [c.id, c]));
    const shown = skills.categories.filter((c) => cats.has(c.id) && (c.id === "terminux" || c.id === skills.mastery || c.unlocked.length > 1));
    if (!shown.length) return { html: "", mount: () => {} };
    shown.sort((a, b) => (a.id === "terminux" ? -1 : b.id === "terminux" ? 1 : 0));
    const tabs = shown.map((c, i) => `<button type="button" class="chip" data-tree="${esc(c.id)}" aria-pressed="${i === 0}">${esc(cats.get(c.id).main ? "Main tree" : cats.get(c.id).title)}</button>`).join("");
    const html = `
      <div class="pf-trees">
        <div class="chips-row">${tabs}</div>
        <div class="pf-tree-layout">
          <div class="pf-tree"><canvas aria-label="Skill tree"></canvas><div class="mc-tooltip" hidden></div></div>
          <aside class="pf-tree-side"></aside>
        </div>
      </div>`;
    const mount = (root) => {
      const box = root.querySelector(".pf-tree");
      const side = root.querySelector(".pf-tree-side");
      const show = (id) => {
        const c = shown.find((x) => x.id === id);
        const cat = cats.get(id);
        const taken = new Set(c.unlocked);
        const fresh = box.querySelector("canvas").cloneNode(false);
        box.querySelector("canvas").replaceWith(fresh);
        mountTree(box, data, cat, taken);
        const { rows, effects } = treeTotals(data, cat, taken);
        side.innerHTML =
          `<p class="eyebrow">Gained from this tree</p><div class="tt-rows">${rows.map((r) => `<div class="tt-row"><span>${esc(r.name)}</span><b>${esc(r.value)}</b></div>`).join("")}</div>` +
          (effects.length ? `<p class="eyebrow">Effects</p>${effects.map((e) => `<div class="tt-effect"><b>${esc(e.title)}</b><span>${esc(e.text)}</span></div>`).join("")}` : "") +
          `<a class="btn pf-planner" href="#tree/${esc(id)}" data-tree-id="${esc(id)}">Open in the planner</a>`;
        // The planner reads the build from #tree/<category>/<encoded>; every tree shown here is preloaded as its plan,
        // so switching between the main and the mastery tree in the planner keeps both.
        side.querySelector(".pf-planner").addEventListener("click", (e) => {
          const T = TMC._tree;
          if (!T || !T.plans || !T.encodePlan) return;
          e.preventDefault();
          shown.forEach((x) => {
            if (!cats.has(x.id)) return;
            const model = T.buildModel(cats.get(x.id));
            T.plans[x.id] = new Set(x.unlocked.filter((n) => model.nodes.has(n)));
          });
          location.hash = `#tree/${id}/${T.encodePlan(cats.get(id))}`;
        });
        root.querySelectorAll("[data-tree]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.tree === id)));
      };
      root.querySelectorAll("[data-tree]").forEach((b) => b.addEventListener("click", () => show(b.dataset.tree)));
      show(shown[0].id);
    };
    return { html, mount };
  }

  // ---------- One world ----------

  async function renderWorld(box, snap, updatedAt) {
    const icons = await loadIcons();
    const skills = snap.skills || {};
    const tier = typeof snap.tier === "number" ? TIERS[snap.tier] : null;
    const trees = await treesHtml(snap);
    box.innerHTML = `
      <div class="pf-head">
        <span class="mc-head" aria-hidden="true">${esc(((snap.player && snap.player.name) || "?").charAt(0).toUpperCase())}</span>
        <div class="pf-head-main">
          <h2>${esc((snap.player && snap.player.name) || "")}</h2>
          <div class="pf-tags">
            ${skills.level !== undefined ? `<span class="ic-tag kind">Level ${skills.level}</span>` : ""}
            ${tier ? `<span class="ic-tag">Tier ${snap.tier + 1} · ${tier}</span>` : ""}
            ${skills.mastery ? `<span class="ic-tag mod">${esc(skills.mastery.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()))}</span>` : ""}
            <span class="pf-sync">${esc(fmtTime(updatedAt || snap.time))}</span>
          </div>
        </div>
      </div>
      ${trees.html ? `<section class="pf-section"><h3>Skill trees</h3>${trees.html}</section>` : ""}
      <section class="pf-section"><h3>Stats</h3>${statsHtml(snap.stats || [])}</section>
      <section class="pf-section"><h3>Equipment</h3>${equipmentHtml(snap, icons)}</section>`;
    trees.mount(box);
    TMC.animateIn(box);
  }

  // ---------- Entry from auth.js ----------

  TMC.renderProfile = async (container, { links, fb }) => {
    const worlds = [];
    for (const l of links) {
      try {
        const snap = await fb.getDocs(fb.collection(fb.db, "players", l.uuid, "worlds"));
        snap.docs.forEach((d) => worlds.push({ link: l, id: d.id, ...d.data() }));
      } catch {}
    }
    if (!worlds.length) return;
    worlds.sort((a, b) => (b.updatedAt ? b.updatedAt.toMillis() : 0) - (a.updatedAt ? a.updatedAt.toMillis() : 0));
    container.insertAdjacentHTML(
      "beforeend",
      `<section class="pf">
        <div class="pf-worlds-bar">
          <div class="chips-row pf-worlds">${worlds.map((w, i) => `<button type="button" class="chip" data-world="${i}" aria-pressed="${i === 0}">${esc(w.worldName || "World")}${links.length > 1 ? ` · ${esc(w.link.mcName)}` : ""}</button>`).join("")}</div>
          <button type="button" class="btn pf-remove" data-remove-world>Remove world</button>
        </div>
        <div class="pf-world"></div>
      </section>`
    );
    const root = container.querySelector(".pf");
    const box = root.querySelector(".pf-world");
    const remove = root.querySelector("[data-remove-world]");
    let current = 0;
    let armTimer = 0;
    const disarm = () => {
      clearTimeout(armTimer);
      remove.classList.remove("armed");
      remove.textContent = "Remove world";
    };
    // Removes the shown world's record; the game writes it again the next time that world is played.
    const removeWorld = async () => {
      if (!remove.classList.contains("armed")) {
        remove.classList.add("armed");
        remove.textContent = "Confirm remove";
        armTimer = setTimeout(disarm, 4000);
        return;
      }
      clearTimeout(armTimer);
      const w = worlds[current];
      remove.disabled = true;
      remove.textContent = "Removing…";
      try {
        await fb.deleteDoc(fb.doc(fb.db, "players", w.link.uuid, "worlds", w.id));
        TMC.route(true);
      } catch (err) {
        remove.disabled = false;
        disarm();
        alert(err && err.code === "permission-denied" ? "Not allowed to remove this world." : "Could not remove this world.");
      }
    };
    const show = async (i) => {
      current = i;
      disarm();
      const w = worlds[i];
      let snap;
      try {
        snap = JSON.parse(w.data);
      } catch {
        box.innerHTML = `<p class="empty">This world's data could not be read.</p>`;
        return;
      }
      box.classList.add("swap");
      await renderWorld(box, snap, w.updatedAt ? w.updatedAt.toMillis() : 0);
      box.classList.remove("swap");
      root.querySelectorAll("[data-world]").forEach((b) => b.setAttribute("aria-pressed", String(Number(b.dataset.world) === i)));
    };
    root.addEventListener("click", (e) => {
      if (e.target.closest("[data-remove-world]")) return removeWorld();
      const wb = e.target.closest("[data-world]");
      if (wb) return show(Number(wb.dataset.world));
      const item = e.target.closest(".pf-item[data-item]");
      const pop = root.querySelector(".pf-pop") || root.appendChild(Object.assign(document.createElement("div"), { className: "pf-pop mc-tooltip" }));
      if (!item) {
        pop.hidden = true;
        return;
      }
      const it = JSON.parse(item.dataset.item);
      pop.innerHTML = tipHtml(it);
      pop.hidden = false;
      const r = item.getBoundingClientRect();
      const pr = root.getBoundingClientRect();
      const x = Math.min(r.left - pr.left, pr.width - pop.offsetWidth - 4);
      pop.style.transform = `translate(${Math.max(0, x)}px, ${r.bottom - pr.top + 6}px)`;
    });
    await show(0);
  };
})();
