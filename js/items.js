// Weapons, Armor and Tools. Data: data/items.json, from the game's "/terminux export" via Tools/SiteData/import_items.py.
// Only the plain items with their default stats: no reforge affixes, no recipes.
// A searchable, sortable list with kind filters; the main stats sit on the row, a click slides an item card open.
// Axes are tools and weapons, so they show on both pages (alsoWeapon).

(() => {
  const TMC = window.TMC;
  const PAGES = {
    weapons: { title: "Weapons", noun: "weapons", match: (i) => i.category === "weapon" || i.alsoWeapon },
    armor: { title: "Armor", noun: "pieces", match: (i) => i.category === "armor" },
    tools: { title: "Tools", noun: "tools", match: (i) => i.category === "tool" },
  };
  const SORTS = {
    weapons: [["name", "Name"], ["damage", "Damage"], ["speed", "Attack speed"], ["dps", "DPS"], ["durability", "Durability"], ["reach", "Reach"]],
    tools: [["name", "Name"], ["damage", "Damage"], ["speed", "Attack speed"], ["durability", "Durability"]],
    armor: [["name", "Name"], ["defence", "Defence"], ["toughness", "Toughness"], ["kb", "Knockback resistance"], ["durability", "Durability"]],
  };
  const states = {};

  const chevron =
    '<svg class="chev" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M3 6l5 5 5-5" fill="none" stroke="currentColor" stroke-width="2"/></svg>';

  const isAttr = (a, name) => a.id === "minecraft:generic." + name || a.id === "minecraft:" + name;

  /** Sum of the plain additions to an attribute in the given slots. */
  function added(item, name, slots) {
    return item.attributes
      .filter((a) => isAttr(a, name) && a.operation === "add_value" && slots.includes(a.slot))
      .reduce((s, a) => s + a.amount, 0);
  }

  const HAND = ["mainhand", "hand", "any"];
  const wornSlots = (item) => (item.kind === "Shield" ? ["offhand", "hand", "any"] : [item.slot, "armor", "any", "body"]);

  /** Every number the page shows or sorts by; null when the item has no such stat. */
  function statsOf(item) {
    if (item._stats) return item._stats;
    const s = {};
    if (item.category === "armor") {
      const slots = wornSlots(item);
      s.defence = added(item, "armor", slots) || null;
      s.toughness = added(item, "armor_toughness", slots) || null;
      s.kb = added(item, "knockback_resistance", slots) || null;
    } else {
      const hasDamage = item.attributes.some((a) => isAttr(a, "attack_damage"));
      const hasSpeed = item.attributes.some((a) => isAttr(a, "attack_speed"));
      s.damage = hasDamage ? 1 + added(item, "attack_damage", HAND) : null;
      s.speed = hasSpeed ? 4 + added(item, "attack_speed", HAND) : null;
      s.dps = s.damage !== null && s.speed !== null ? s.damage * s.speed : null;
      s.reach = item.betterCombat && item.betterCombat.rangeBonus ? item.betterCombat.rangeBonus : null;
    }
    s.durability = item.durability > 0 ? item.durability : null;
    s.enchant = item.enchantability > 0 ? item.enchantability : null;
    item._stats = s;
    return s;
  }

  const MAIN = ["attack_damage", "attack_speed", "armor", "armor_toughness", "knockback_resistance"];

  function formatModifier(a) {
    const pct = a.operation !== "add_value";
    const v = pct ? a.amount * 100 : a.amount;
    return `${v > 0 ? "+" : ""}${TMC.num(v)}${pct ? "%" : ""}`;
  }

  function otherStats(item) {
    return item.attributes.filter((a) => !MAIN.some((m) => isAttr(a, m)) || (a.operation !== "add_value" && !a.base));
  }

  const SLOT_NAMES = { head: "Head", chest: "Chest", legs: "Legs", feet: "Feet", body: "Body", offhand: "Off hand", mainhand: "Main hand" };

  /** One stat block: label, value and a bar against the best item on the page. */
  function block(label, value, max, opts = {}) {
    const has = value !== null && value !== undefined;
    const pct = has && max > 0 && !opts.noBar ? Math.max(4, Math.min(100, (100 * value) / max)) : 0;
    const text = has ? (opts.text || TMC.num(value)) : "–";
    return `
      <div class="ic-stat${opts.lead ? " lead" : ""}${has ? "" : " none"}">
        <span class="ic-label">${TMC.esc(label)}</span>
        <span class="ic-value">${TMC.esc(text)}</span>
        ${pct ? `<span class="ic-bar" aria-hidden="true"><span style="--w:${pct.toFixed(1)}%"></span></span>` : ""}
      </div>`;
  }

  function detailHtml(item, max) {
    const s = statsOf(item);
    const blocks = [];
    if (item.category === "armor") {
      blocks.push(block("Defence", s.defence, max.defence, { lead: true }));
      blocks.push(block("Toughness", s.toughness, max.toughness));
      blocks.push(block("Knockback resistance", s.kb, max.kb, { text: s.kb !== null ? TMC.num(s.kb * 10) : null }));
    } else {
      blocks.push(block("Damage", s.damage, max.damage, { lead: true }));
      blocks.push(block("Attack speed", s.speed, max.speed));
      blocks.push(block("DPS", s.dps, max.dps));
    }
    blocks.push(block("Durability", s.durability, max.durability));
    if (s.enchant !== null) blocks.push(block("Enchantability", s.enchant, max.enchant));
    if (item.category !== "armor" && item.betterCombat) {
      blocks.push(block("Hands", 1, 0, { text: item.betterCombat.twoHanded ? "Two-handed" : "One-handed", noBar: true }));
      if (s.reach !== null) blocks.push(block("Reach", s.reach, max.reach, { text: (s.reach > 0 ? "+" : "") + TMC.num(s.reach) }));
    }
    const others = otherStats(item);
    const slot = item.category === "armor" ? SLOT_NAMES[item.slot] || item.slot : null;
    return `
      <div class="detail item-detail">
        <div class="ic-hero">
          <span class="ic-icon"><img src="${item.icon}" alt="" width="64" height="64"></span>
          <div class="ic-head">
            <h3 class="ic-name">${TMC.esc(item.name)}</h3>
            <div class="ic-tags">
              <span class="ic-tag kind">${TMC.esc(item.kind)}</span>
              ${slot ? `<span class="ic-tag">${TMC.esc(slot)}</span>` : ""}
              <span class="ic-tag mod">${TMC.esc(item.modName)}</span>
            </div>
          </div>
        </div>
        <div class="ic-stats">${blocks.join("")}</div>
        ${
          others.length
            ? `<div class="ic-others">
                 <p class="eyebrow">Other stats</p>
                 <div class="attr-list">
                   ${others.map((a) => `<div class="attr-row"><span>${TMC.esc(a.name)}</span><b>${formatModifier(a)}</b></div>`).join("")}
                 </div>
               </div>`
            : ""
        }
      </div>`;
  }

  function pillsFor(item) {
    const s = statsOf(item);
    const pairs =
      item.category === "armor"
        ? [["Defence", s.defence], ["Toughness", s.toughness]]
        : [["Damage", s.damage], ["Speed", s.speed]];
    return pairs
      .filter(([, v]) => v !== null)
      .map(([n, v]) => `<span class="pill"><span>${TMC.esc(n)}</span> <b>${TMC.num(v)}</b></span>`)
      .join("");
  }

  function rowHtml(item, i, state, max) {
    const open = state.open === item.id;
    return `
      <div class="row${open ? " open" : ""}" data-id="${TMC.esc(item.id)}" style="--i:${Math.min(i, 14)}">
        <button type="button" class="row-head" aria-expanded="${open}">
          <img src="${item.icon}" alt="" width="40" height="40" loading="lazy">
          <span class="row-main">
            <span class="row-name">${TMC.esc(item.name)}</span>
            <span class="row-desc">${TMC.esc(item.kind)} · ${TMC.esc(item.modName)}</span>
          </span>
          <span class="pills">${pillsFor(item)}</span>
          ${chevron}
        </button>
        <div class="row-body"><div>${open ? detailHtml(item, max) : ""}</div></div>
      </div>`;
  }

  /** Best value of each stat on the page, for the bars. */
  function maxima(items) {
    const max = {};
    for (const it of items) {
      const s = statsOf(it);
      for (const [k, v] of Object.entries(s)) if (v !== null && v > (max[k] || 0)) max[k] = v;
    }
    return max;
  }

  function sorter(key, dir) {
    if (key === "name") return (a, b) => dir * a.name.localeCompare(b.name);
    return (a, b) => {
      const va = statsOf(a)[key];
      const vb = statsOf(b)[key];
      if (va === null && vb === null) return a.name.localeCompare(b.name);
      if (va === null) return 1; // items without the stat sort last, either direction
      if (vb === null) return -1;
      return dir * (va - vb) || a.name.localeCompare(b.name);
    };
  }

  const ARROW_DOWN = '<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 2v11M3.5 8.5 8 13l4.5-4.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  function page(id) {
    const cfg = PAGES[id];
    return async (el) => {
      const state = (states[id] = states[id] || { query: "", kind: "", open: null, sort: "name", dir: 1 });
      el.innerHTML = `<div class="page-head"><h1>${cfg.title}</h1></div>`;
      let data = null;
      try {
        data = await TMC.loadJson("data/items.json");
      } catch {}
      if (!data) {
        el.innerHTML = `
          <div class="page-head"><h1>${cfg.title}</h1></div>
          <section class="placeholder">
            <p class="eyebrow">No data yet</p>
            <p>This page fills in from the game itself. In game, type <code>/terminux export</code>; it writes the pack's weapons, armor and tools with their icons. Then run the site data importer.</p>
          </section>`;
        TMC.animateIn(el);
        return;
      }
      const all = data.items.filter(cfg.match);
      const sortOptions = SORTS[id].map(([k, n]) => `<option value="${k}"${state.sort === k ? " selected" : ""}>${n}</option>`).join("");
      el.innerHTML = `
        <div class="page-head"><h1>${cfg.title}</h1><span class="count"></span></div>
        <div class="filters">
          <label class="search">
            <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" stroke-width="2"/><path d="M16.5 16.5L21 21" stroke="currentColor" stroke-width="2"/></svg>
            <input type="search" placeholder="Search ${cfg.noun}" aria-label="Search ${cfg.noun}" value="${TMC.esc(state.query)}">
          </label>
          <div class="sort-box">
            <label class="sort-select"><span>Sort by</span>
              <select aria-label="Sort by">${sortOptions}</select>
            </label>
            <button type="button" class="icon-btn sort-dir" aria-label="${state.dir > 0 ? "Ascending, switch to descending" : "Descending, switch to ascending"}" data-dir="${state.dir}">${ARROW_DOWN}</button>
          </div>
        </div>
        <div class="chips-row"></div>
        <div class="list"></div>`;
      TMC.animateIn(el);
      const list = el.querySelector(".list");
      const count = el.querySelector(".count");
      const chipsRow = el.querySelector(".chips-row");
      const dirBtn = el.querySelector(".sort-dir");
      let max = {};

      const render = (entrance) => {
        const enabled = all.filter((i) => TMC.modOn(i.mod));
        max = maxima(enabled);
        const kinds = new Map();
        enabled.forEach((i) => kinds.set(i.kind, (kinds.get(i.kind) || 0) + 1));
        if (state.kind && !kinds.has(state.kind)) state.kind = "";
        const sortedKinds = [...kinds.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
        chipsRow.innerHTML = [`<button type="button" class="chip" data-kind="" aria-pressed="${!state.kind}">All</button>`]
          .concat(sortedKinds.map(([k, n]) => `<button type="button" class="chip" data-kind="${TMC.esc(k)}" aria-pressed="${state.kind === k}">${TMC.esc(k)} <span class="chip-n">${n}</span></button>`))
          .join("");
        const q = state.query.trim().toLowerCase();
        const shown = enabled
          .filter((i) => (!state.kind || i.kind === state.kind) && (!q || (i.name + " " + i.modName + " " + i.kind).toLowerCase().includes(q)))
          .sort(sorter(state.sort, state.dir));
        count.textContent = shown.length === enabled.length ? `${enabled.length} ${cfg.noun}` : `${shown.length} of ${enabled.length} ${cfg.noun}`;
        list.innerHTML = shown.length ? shown.map((i, n) => rowHtml(i, n, state, max)).join("") : `<p class="empty">Nothing matches this search.</p>`;
        list.querySelectorAll(".row").forEach((r) => r.classList.add(entrance));
      };

      el.querySelector(".search input").addEventListener("input", (e) => {
        state.query = e.target.value;
        render("enter-fast");
      });
      el.querySelector(".sort-select select").addEventListener("change", (e) => {
        state.sort = e.target.value;
        // Numbers read best high first; names A to Z
        state.dir = state.sort === "name" ? 1 : -1;
        dirBtn.dataset.dir = String(state.dir);
        dirBtn.setAttribute("aria-label", state.dir > 0 ? "Ascending, switch to descending" : "Descending, switch to ascending");
        render("enter-fast");
      });
      dirBtn.addEventListener("click", () => {
        state.dir = -state.dir;
        dirBtn.dataset.dir = String(state.dir);
        dirBtn.setAttribute("aria-label", state.dir > 0 ? "Ascending, switch to descending" : "Descending, switch to ascending");
        render("enter-fast");
      });
      chipsRow.addEventListener("click", (e) => {
        const chip = e.target.closest(".chip");
        if (!chip) return;
        state.kind = chip.dataset.kind;
        render("enter-fast");
      });
      list.addEventListener("click", (e) => {
        const head = e.target.closest(".row-head");
        if (!head) return;
        const row = head.closest(".row");
        const item = all.find((i) => i.id === row.dataset.id);
        const wasOpen = state.open === item.id;
        list.querySelectorAll(".row.open").forEach((r) => {
          r.classList.remove("open");
          r.querySelector(".row-head").setAttribute("aria-expanded", "false");
        });
        state.open = wasOpen ? null : item.id;
        if (!wasOpen) {
          row.querySelector(".row-body > div").innerHTML = detailHtml(item, max);
          requestAnimationFrame(() =>
            requestAnimationFrame(() => {
              row.classList.add("open");
              head.setAttribute("aria-expanded", "true");
            })
          );
        }
      });
      TMC.onModsChange = () => render("enter-fast");
      render("enter-fast");
    };
  }

  for (const id of Object.keys(PAGES)) TMC.PAGES[id] = page(id);
})();
