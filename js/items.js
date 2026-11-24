// Weapons, Armor and Tools. Data: data/items.json, from the game's "/terminux export" via Tools/SiteData/import_items.py.
// Only the plain items with their default stats: no reforge affixes, no recipes.
// A searchable list with kind filters; the main stats sit on the row, a click slides the rest open.

(() => {
  const TMC = window.TMC;
  const PAGES = {
    weapons: { title: "Weapons", category: "weapon", noun: "weapons" },
    armor: { title: "Armor", category: "armor", noun: "pieces" },
    tools: { title: "Tools", category: "tool", noun: "tools" },
  };
  const states = {};

  const chevron =
    '<svg class="chev" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M3 6l5 5 5-5" fill="none" stroke="currentColor" stroke-width="2"/></svg>';

  const isAttr = (a, name) => a.id === "minecraft:generic." + name || a.id === "minecraft:" + name;

  /** Sum of the plain additions to an attribute in the item's own slot. */
  function added(item, name, slots) {
    return item.attributes
      .filter((a) => isAttr(a, name) && a.operation === "add_value" && slots.includes(a.slot))
      .reduce((s, a) => s + a.amount, 0);
  }

  const HAND = ["mainhand", "hand", "any"];
  const armorSlots = (item) => [item.slot, "armor", "any", "body"];

  /** The stats a player reads first, as the game's tooltip shows them. */
  function mainStats(item) {
    if (item.category === "armor") {
      const slots = item.kind === "Shield" ? ["offhand", "hand", "any"] : armorSlots(item);
      return [
        ["Defence", added(item, "armor", slots)],
        ["Toughness", added(item, "armor_toughness", slots)],
        ["Knockback resistance", added(item, "knockback_resistance", slots)],
      ].filter(([, v]) => v);
    }
    const hasDamage = item.attributes.some((a) => isAttr(a, "attack_damage"));
    const stats = [];
    if (hasDamage) stats.push(["Damage", 1 + added(item, "attack_damage", HAND)]);
    if (item.attributes.some((a) => isAttr(a, "attack_speed"))) stats.push(["Speed", 4 + added(item, "attack_speed", HAND)]);
    return stats;
  }

  const MAIN = ["attack_damage", "attack_speed", "armor", "armor_toughness", "knockback_resistance"];

  function formatModifier(a) {
    const pct = a.operation !== "add_value";
    const v = pct ? a.amount * 100 : a.amount;
    const sign = v > 0 ? "+" : "";
    return `${sign}${TMC.num(v)}${pct ? "%" : ""}`;
  }

  function otherStats(item) {
    return item.attributes.filter((a) => !MAIN.some((m) => isAttr(a, m)) || (a.operation !== "add_value" && !a.base));
  }

  function detailHtml(item) {
    const cards = [];
    for (const [name, v] of mainStats(item)) cards.push([name, TMC.num(v)]);
    if (item.durability > 0) cards.push(["Durability", TMC.num(item.durability)]);
    if (item.enchantability > 0) cards.push(["Enchantability", TMC.num(item.enchantability)]);
    if (item.betterCombat) {
      cards.push(["Hands", item.betterCombat.twoHanded ? "Two-handed" : "One-handed"]);
      if (item.betterCombat.rangeBonus) cards.push(["Reach", (item.betterCombat.rangeBonus > 0 ? "+" : "") + TMC.num(item.betterCombat.rangeBonus)]);
    }
    const others = otherStats(item);
    return `
      <div class="detail">
        <div class="stat-cards">
          ${cards.map(([n, v]) => `<div class="stat-card"><span>${TMC.esc(n)}</span><b>${TMC.esc(v)}</b></div>`).join("")}
        </div>
        ${
          others.length
            ? `<div class="detail-col">
                 <p class="eyebrow">Other stats</p>
                 <div class="attr-list">
                   ${others.map((a) => `<div class="attr-row"><span>${TMC.esc(a.name)}</span><b>${formatModifier(a)}</b></div>`).join("")}
                 </div>
               </div>`
            : ""
        }
        <p class="small-note">${TMC.esc(item.modName)} · ${TMC.esc(item.id)}</p>
      </div>`;
  }

  function rowHtml(item, i, state) {
    const open = state.open === item.id;
    const stats = mainStats(item)
      .slice(0, 2)
      .map(([n, v]) => `<span class="pill"><span>${TMC.esc(n)}</span> <b>${TMC.num(v)}</b></span>`)
      .join("");
    return `
      <div class="row${open ? " open" : ""}" data-id="${TMC.esc(item.id)}" style="--i:${Math.min(i, 14)}">
        <button type="button" class="row-head" aria-expanded="${open}">
          <img src="${item.icon}" alt="" width="40" height="40" loading="lazy">
          <span class="row-main">
            <span class="row-name">${TMC.esc(item.name)}</span>
            <span class="row-desc">${TMC.esc(item.kind)} · ${TMC.esc(item.modName)}</span>
          </span>
          <span class="pills">${stats}</span>
          ${chevron}
        </button>
        <div class="row-body"><div>${open ? detailHtml(item) : ""}</div></div>
      </div>`;
  }

  function page(id) {
    const cfg = PAGES[id];
    return async (el) => {
      const state = (states[id] = states[id] || { query: "", kind: "", open: null });
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
      const all = data.items.filter((i) => i.category === cfg.category);
      el.innerHTML = `
        <div class="page-head"><h1>${cfg.title}</h1><span class="count"></span></div>
        <div class="filters">
          <label class="search">
            <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" stroke-width="2"/><path d="M16.5 16.5L21 21" stroke="currentColor" stroke-width="2"/></svg>
            <input type="search" placeholder="Search ${cfg.noun}" aria-label="Search ${cfg.noun}" value="${TMC.esc(state.query)}">
          </label>
        </div>
        <div class="chips-row"></div>
        <div class="list"></div>`;
      TMC.animateIn(el);
      const list = el.querySelector(".list");
      const count = el.querySelector(".count");
      const chipsRow = el.querySelector(".chips-row");

      const render = (entrance) => {
        const enabled = all.filter((i) => TMC.modOn(i.mod));
        const kinds = new Map();
        enabled.forEach((i) => kinds.set(i.kind, (kinds.get(i.kind) || 0) + 1));
        if (state.kind && !kinds.has(state.kind)) state.kind = "";
        const sortedKinds = [...kinds.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
        chipsRow.innerHTML = [`<button type="button" class="chip" data-kind="" aria-pressed="${!state.kind}">All</button>`]
          .concat(sortedKinds.map(([k, n]) => `<button type="button" class="chip" data-kind="${TMC.esc(k)}" aria-pressed="${state.kind === k}">${TMC.esc(k)} <span class="chip-n">${n}</span></button>`))
          .join("");
        const q = state.query.trim().toLowerCase();
        const shown = enabled.filter((i) => (!state.kind || i.kind === state.kind) && (!q || (i.name + " " + i.modName + " " + i.kind).toLowerCase().includes(q)));
        count.textContent = shown.length === enabled.length ? `${enabled.length} ${cfg.noun}` : `${shown.length} of ${enabled.length} ${cfg.noun}`;
        list.innerHTML = shown.length ? shown.map((i, n) => rowHtml(i, n, state)).join("") : `<p class="empty">Nothing matches this search.</p>`;
        list.querySelectorAll(".row").forEach((r) => r.classList.add(entrance));
      };

      el.querySelector(".search input").addEventListener("input", (e) => {
        state.query = e.target.value;
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
          row.querySelector(".row-body > div").innerHTML = detailHtml(item);
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
