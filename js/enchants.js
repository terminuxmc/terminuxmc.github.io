// Enchantments. Data: data/enchantments.json, from the game and mod jars via Tools/SiteData/build_enchants.py.
// Max levels are the pack's (Apothic Enchanting config). A searchable list with category chips and treasure/curse
// toggles; a click slides the card open, where level buttons switch the damage values.
// Damage enchantments do not add flat damage in this pack: Terminux turns them into a separate multiplier.

(() => {
  const TMC = window.TMC;
  const state = { query: "", chip: "", flags: new Set(), open: null, level: {} };
  const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"];
  const roman = (n) => ROMAN[n - 1] || String(n);
  const RARITY = (w) => (w >= 10 ? "Common" : w >= 5 ? "Uncommon" : w >= 2 ? "Rare" : "Very rare");
  const SLOT = { mainhand: "Main hand", offhand: "Off hand", hand: "Hands", armor: "Armor", head: "Head", chest: "Chest", legs: "Legs", feet: "Feet", any: "Any", body: "Body" };
  const FLAGS = [
    ["treasure", "Treasure"],
    ["curse", "Curses"],
  ];
  const BOOK = "img/enchanted_book.png";

  const chevron =
    '<svg class="chev" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M3 6l5 5 5-5" fill="none" stroke="currentColor" stroke-width="2"/></svg>';

  function row(label, value, cls = "") {
    return `<div class="ic-stat${cls ? " " + cls : ""}"><span class="ic-label">${TMC.esc(label)}</span><span class="ic-bar" aria-hidden="true"></span><span class="ic-value">${value}</span></div>`;
  }

  function damageRows(e, lvl) {
    if (!e.damage) return "";
    const m = e.damage.multiplier[lvl - 1];
    const label = e.damage.conditional ? "Damage to its targets" : "Damage";
    return row(label, `×${TMC.num(m)}`, "lead");
  }

  function statsHtml(e, lvl) {
    const rows = [];
    rows.push(damageRows(e, lvl));
    rows.push(row("Max level", TMC.esc(roman(e.maxLevel)) + (e.maxLevel !== e.vanillaMax ? ` <span class="en-dim">(was ${roman(e.vanillaMax)})</span>` : "")));
    if (e.lootMax && e.lootMax < e.maxLevel) rows.push(row("Max level from loot", TMC.esc(roman(e.lootMax))));
    if (e.appliesTo.length) rows.push(row("Applies to", TMC.esc(e.appliesTo.join(", "))));
    if (e.slots.length) rows.push(row("Works in", TMC.esc(e.slots.map((s) => SLOT[s] || s).join(", "))));
    if (e.weight) rows.push(row("Rarity", `${RARITY(e.weight)} <span class="en-dim">(${e.weight})</span>`));
    if (e.anvilCost) rows.push(row("Anvil cost", TMC.esc(String(e.anvilCost))));
    if (e.sources.length) rows.push(row("Found in", TMC.esc(e.sources.join(", "))));
    return rows.join("");
  }

  function detailHtml(e) {
    const lvl = Math.min(state.level[e.id] || e.maxLevel, e.maxLevel);
    const tags = [`<span class="ic-tag mod">${TMC.esc(e.modName)}</span>`];
    if (e.curse) tags.unshift('<span class="ic-tag unique">Curse</span>');
    else if (e.treasure) tags.unshift('<span class="ic-tag kind">Treasure</span>');
    const levels =
      e.damage && e.maxLevel > 1
        ? `<div class="gm-purity" role="group" aria-label="Level">${Array.from({ length: e.maxLevel }, (_, i) => i + 1)
            .map((l) => `<button type="button" class="gm-pbtn en-lvl" data-level="${l}" aria-pressed="${l === lvl}">${roman(l)}</button>`)
            .join("")}</div>`
        : "";
    const excl = e.exclusive.length
      ? `<div class="en-excl"><span class="en-excl-label">Incompatible with</span><div class="en-excl-list">${e.exclusive
          .map((x) => `<button type="button" class="chip en-jump" data-id="${TMC.esc(x.id)}">${TMC.esc(x.name)}</button>`)
          .join("")}</div></div>`
      : "";
    return `
      <div class="detail item-detail">
        <div class="ic-hero">
          <span class="ic-icon"><img src="${BOOK}" alt="" width="64" height="64"></span>
          <div class="ic-head">
            <h3 class="ic-name">${TMC.esc(e.name)}</h3>
            <div class="ic-tags">${tags.join("")}</div>
          </div>
        </div>
        ${e.description ? `<div class="ic-ability"><p>${TMC.esc(e.description)}</p></div>` : ""}
        ${levels}
        <div class="ic-stats en-stats">${statsHtml(e, lvl)}</div>
        ${excl}
      </div>`;
  }

  function rowHtml(e, i) {
    const open = state.open === e.id;
    const desc = [e.modName].concat(e.appliesTo.slice(0, 1));
    return `
      <div class="row${open ? " open" : ""}${e.curse ? " en-curse" : ""}" data-id="${TMC.esc(e.id)}" style="--i:${Math.min(i, 14)}">
        <button type="button" class="row-head" aria-expanded="${open}">
          <img src="${BOOK}" alt="" width="40" height="40" loading="lazy">
          <span class="row-main">
            <span class="row-name">${TMC.esc(e.name)}</span>
            <span class="row-desc">${TMC.esc(desc.join(" · "))}</span>
          </span>
          <span class="pills"><span class="pill"><span>Max</span> <b>${roman(e.maxLevel)}</b></span></span>
          ${chevron}
        </button>
        <div class="row-body"><div>${open ? detailHtml(e) : ""}</div></div>
      </div>`;
  }

  TMC.PAGES.enchantments = async (el) => {
    el.innerHTML = '<div class="page-head"><h1>Enchantments</h1></div>';
    let data = null;
    try {
      data = await TMC.loadJson("data/enchantments.json");
    } catch {}
    if (!data) {
      el.innerHTML = '<div class="page-head"><h1>Enchantments</h1></div><section class="placeholder"><p class="eyebrow">No data yet</p></section>';
      TMC.animateIn(el);
      return;
    }
    const all = data.enchantments;
    el.innerHTML = `
      <div class="page-head"><h1>Enchantments</h1><span class="count"></span></div>
      <div class="filters">
        <label class="search">
          <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" stroke-width="2"/><path d="M16.5 16.5L21 21" stroke="currentColor" stroke-width="2"/></svg>
          <input type="search" placeholder="Search enchantments" aria-label="Search enchantments" value="${TMC.esc(state.query)}">
        </label>
      </div>
      <div class="chips-row gm-groups"></div>
      <div class="list"></div>`;
    TMC.animateIn(el);
    const list = el.querySelector(".list");
    const count = el.querySelector(".count");
    const chipsRow = el.querySelector(".chips-row");

    const render = () => {
      const enabled = all.filter((e) => TMC.modOn(e.mod));
      const n = (c) => enabled.filter((e) => e.chips.includes(c)).length;
      const cats = data.chips.filter((c) => n(c));
      if (state.chip && !cats.includes(state.chip)) state.chip = "";
      chipsRow.innerHTML = [`<button type="button" class="chip" data-chip="" aria-pressed="${!state.chip}">All</button>`]
        .concat(cats.map((c) => `<button type="button" class="chip" data-chip="${TMC.esc(c)}" aria-pressed="${state.chip === c}">${TMC.esc(c)} <span class="chip-n">${n(c)}</span></button>`))
        .concat(['<span class="en-sep" aria-hidden="true"></span>'])
        .concat(FLAGS.map(([k, label]) => `<button type="button" class="chip" data-flag="${k}" aria-pressed="${state.flags.has(k)}">${label} <span class="chip-n">${enabled.filter((e) => e[k]).length}</span></button>`))
        .join("");
      const q = state.query.trim().toLowerCase();
      const shown = enabled.filter(
        (e) =>
          (!state.chip || e.chips.includes(state.chip)) &&
          [...state.flags].every((f) => e[f]) &&
          (!q || (e.name + " " + e.modName + " " + e.description + " " + e.appliesTo.join(" ")).toLowerCase().includes(q))
      );
      count.textContent = shown.length === enabled.length ? `${enabled.length} enchantments` : `${shown.length} of ${enabled.length} enchantments`;
      list.innerHTML = shown.length ? shown.map((e, i) => rowHtml(e, i)).join("") : '<p class="empty">Nothing matches these filters.</p>';
      list.querySelectorAll(".row").forEach((r) => r.classList.add("enter-fast"));
    };

    const openRow = (row) => {
      const e = all.find((x) => x.id === row.dataset.id);
      const head = row.querySelector(".row-head");
      const wasOpen = state.open === e.id;
      list.querySelectorAll(".row.open").forEach((r) => {
        r.classList.remove("open");
        r.querySelector(".row-head").setAttribute("aria-expanded", "false");
      });
      state.open = wasOpen ? null : e.id;
      if (!wasOpen) {
        row.querySelector(".row-body > div").innerHTML = detailHtml(e);
        requestAnimationFrame(() =>
          requestAnimationFrame(() => {
            row.classList.add("open");
            head.setAttribute("aria-expanded", "true");
          })
        );
      }
    };

    el.querySelector(".search input").addEventListener("input", (ev) => {
      state.query = ev.target.value;
      render();
    });
    chipsRow.addEventListener("click", (ev) => {
      const chip = ev.target.closest(".chip");
      if (!chip) return;
      if (chip.dataset.flag) {
        const f = chip.dataset.flag;
        if (state.flags.has(f)) state.flags.delete(f);
        else state.flags.add(f);
      } else state.chip = chip.dataset.chip;
      render();
    });
    list.addEventListener("click", (ev) => {
      const lvlBtn = ev.target.closest(".en-lvl");
      if (lvlBtn) {
        const row = lvlBtn.closest(".row");
        const e = all.find((x) => x.id === row.dataset.id);
        state.level[e.id] = Number(lvlBtn.dataset.level);
        row.querySelectorAll(".en-lvl").forEach((b) => b.setAttribute("aria-pressed", String(b === lvlBtn)));
        row.querySelector(".en-stats").innerHTML = statsHtml(e, state.level[e.id]);
        row.querySelectorAll(".en-stats .ic-stat").forEach((s) => (s.style.opacity = "1", s.style.transform = "none"));
        return;
      }
      const jump = ev.target.closest(".en-jump");
      if (jump) {
        state.query = "";
        state.chip = "";
        state.flags.clear();
        el.querySelector(".search input").value = "";
        state.open = null;
        render();
        const target = list.querySelector(`.row[data-id="${CSS.escape(jump.dataset.id)}"]`);
        if (target) {
          openRow(target);
          target.scrollIntoView({ behavior: "smooth", block: "start" });
        }
        return;
      }
      const head = ev.target.closest(".row-head");
      if (head) openRow(head.closest(".row"));
    });
    TMC.onModsChange = render;
    render();
  };
})();
