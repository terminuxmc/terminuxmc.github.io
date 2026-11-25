// Spells. Data: data/spells.json, from the game's "/terminux export" via Tools/SiteData/import_spells.py.
// Every enabled Iron's Spellbooks spell (Iron's own, add-ons, Terminux schools). Values are for a caster with base
// stats. A searchable list with school and rarity chips; a click slides the card open, where level buttons switch
// mana, cast time, rarity and the spell's own lines.

(() => {
  const TMC = window.TMC;
  const state = { query: "", school: "", rarity: "", open: null, level: {} };
  const RARITIES = ["common", "uncommon", "rare", "epic", "legendary"];
  const RARITY_CLASS = { common: "r1", uncommon: "r2", rare: "r3", epic: "r4", legendary: "r5" };
  const CAST = { instant: "Instant", long: "Cast", continuous: "Channelled", charge: "Charged", none: "–" };
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  const roman = (n) => ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"][n - 1] || String(n);

  const chevron =
    '<svg class="chev" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M3 6l5 5 5-5" fill="none" stroke="currentColor" stroke-width="2"/></svg>';

  const row = (label, value, cls = "") =>
    `<div class="ic-stat${cls ? " " + cls : ""}"><span class="ic-label">${TMC.esc(label)}</span><span class="ic-bar" aria-hidden="true"></span><span class="ic-value">${value}</span></div>`;

  const secs = (s) => (s > 0 ? `${TMC.num(s)} s` : "–");
  const levelOf = (s, lvl) => s.levels.find((l) => l.level === lvl) || s.levels[s.levels.length - 1];
  const rarityRange = (s) => {
    const a = s.levels[0].rarity;
    const b = s.levels[s.levels.length - 1].rarity;
    return a === b ? cap(a) : `${cap(a)} – ${cap(b)}`;
  };

  /** "Damage: 12.5" style lines become label / value rows; anything else is a plain row. */
  function infoRows(lines) {
    return lines
      .map((line) => {
        const m = line.match(/^(.+?):\s*(.+)$/);
        return m ? row(m[1], TMC.esc(m[2])) : `<div class="ic-stat sp-line"><span class="ic-label">${TMC.esc(line)}</span></div>`;
      })
      .join("");
  }

  function statsHtml(s, lvl) {
    const l = levelOf(s, lvl);
    const rows = [];
    rows.push(row("Rarity", `<span class="sp-rarity ${RARITY_CLASS[l.rarity] || ""}">${TMC.esc(cap(l.rarity))}</span>`, "lead"));
    rows.push(infoRows(l.info));
    rows.push(row("Mana", TMC.esc(String(l.mana))));
    rows.push(row("Cooldown", secs(s.cooldown)));
    rows.push(row("Casting", TMC.esc(CAST[s.castType] || cap(s.castType)) + (l.castTime > 0 ? ` <span class="en-dim">${secs(l.castTime)}</span>` : "")));
    return rows.join("");
  }

  function detailHtml(s) {
    const lvl = state.level[s.id] || s.maxLevel;
    const levels =
      s.maxLevel > s.minLevel
        ? `<div class="gm-purity" role="group" aria-label="Level">${s.levels
            .map((l) => `<button type="button" class="gm-pbtn sp-lvl" data-level="${l.level}" aria-pressed="${l.level === lvl}">${roman(l.level)}</button>`)
            .join("")}</div>`
        : "";
    return `
      <div class="detail item-detail">
        <div class="ic-hero">
          <span class="ic-icon">${s.icon ? `<img src="${s.icon}" alt="" width="64" height="64">` : ""}</span>
          <div class="ic-head">
            <h3 class="ic-name">${TMC.esc(s.name)}</h3>
            <div class="ic-tags">
              <span class="ic-tag sp-school" style="--sc:${TMC.esc(s.schoolColor)}">${TMC.esc(s.schoolName)}</span>
              <span class="ic-tag mod">${TMC.esc(s.modName || s.mod)}</span>
            </div>
          </div>
        </div>
        ${s.description ? `<div class="ic-ability"><p>${TMC.esc(s.description)}</p></div>` : ""}
        ${levels}
        <div class="ic-stats en-stats sp-stats">${statsHtml(s, lvl)}</div>
      </div>`;
  }

  function rowHtml(s, i) {
    const open = state.open === s.id;
    return `
      <div class="row${open ? " open" : ""}" data-id="${TMC.esc(s.id)}" style="--i:${Math.min(i, 14)}">
        <button type="button" class="row-head" aria-expanded="${open}">
          ${s.icon ? `<img src="${s.icon}" alt="" width="40" height="40" loading="lazy">` : '<span class="sp-noicon"></span>'}
          <span class="row-main">
            <span class="row-name">${TMC.esc(s.name)}</span>
            <span class="row-desc"><span class="sp-dot" style="--sc:${TMC.esc(s.schoolColor)}"></span>${TMC.esc(s.schoolName)} · ${TMC.esc(rarityRange(s))}</span>
          </span>
          <span class="pills"><span class="pill"><span>Max</span> <b>${roman(s.maxLevel)}</b></span></span>
          ${chevron}
        </button>
        <div class="row-body"><div>${open ? detailHtml(s) : ""}</div></div>
      </div>`;
  }

  TMC.PAGES.spells = async (el) => {
    el.innerHTML = '<div class="page-head"><h1>Spells</h1></div>';
    let data = null;
    try {
      data = await TMC.loadJson("data/spells.json");
    } catch {}
    if (!data || !data.spells) {
      el.innerHTML = `
        <div class="page-head"><h1>Spells</h1></div>
        <section class="placeholder"><p class="eyebrow">No data yet</p></section>`;
      TMC.animateIn(el);
      return;
    }
    const all = data.spells.map((s) => ({ ...s, mod: s.mod || s.id.split(":")[0] }));
    el.innerHTML = `
      <div class="page-head"><h1>Spells</h1><span class="count"></span></div>
      <div class="filters">
        <label class="search">
          <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" stroke-width="2"/><path d="M16.5 16.5L21 21" stroke="currentColor" stroke-width="2"/></svg>
          <input type="search" placeholder="Search spells" aria-label="Search spells" value="${TMC.esc(state.query)}">
        </label>
      </div>
      <div class="chips-row gm-groups sp-schools"></div>
      <div class="chips-row gm-tierchips sp-rarities"></div>
      <div class="list"></div>`;
    TMC.animateIn(el);
    const list = el.querySelector(".list");
    const count = el.querySelector(".count");
    const schoolRow = el.querySelector(".sp-schools");
    const rarityRow = el.querySelector(".sp-rarities");
    // A spell "has" a rarity if any of its levels reaches it
    const hasRarity = (s, r) => s.levels.some((l) => l.rarity === r);

    const render = () => {
      const enabled = all.filter((s) => TMC.modOn(s.mod));
      const schools = new Map();
      enabled.forEach((s) => {
        const e = schools.get(s.school) || { name: s.schoolName, color: s.schoolColor, n: 0 };
        e.n++;
        schools.set(s.school, e);
      });
      if (state.school && !schools.has(state.school)) state.school = "";
      schoolRow.innerHTML = [`<button type="button" class="chip" data-school="" aria-pressed="${!state.school}">All schools</button>`]
        .concat(
          [...schools.entries()]
            .sort((a, b) => a[1].name.localeCompare(b[1].name))
            .map(([id, e]) => `<button type="button" class="chip sp-chip" data-school="${TMC.esc(id)}" style="--sc:${TMC.esc(e.color)}" aria-pressed="${state.school === id}"><span class="sp-dot"></span>${TMC.esc(e.name)} <span class="chip-n">${e.n}</span></button>`)
        )
        .join("");
      rarityRow.innerHTML = [`<button type="button" class="chip" data-rarity="" aria-pressed="${!state.rarity}">Any rarity</button>`]
        .concat(RARITIES.filter((r) => enabled.some((s) => hasRarity(s, r))).map((r) => `<button type="button" class="chip ${RARITY_CLASS[r]}" data-rarity="${r}" aria-pressed="${state.rarity === r}">${cap(r)}</button>`))
        .join("");
      const q = state.query.trim().toLowerCase();
      const shown = enabled
        .filter(
          (s) =>
            (!state.school || s.school === state.school) &&
            (!state.rarity || hasRarity(s, state.rarity)) &&
            (!q || (s.name + " " + s.schoolName + " " + (s.description || "")).toLowerCase().includes(q))
        )
        .sort((a, b) => a.name.localeCompare(b.name));
      count.textContent = shown.length === enabled.length ? `${enabled.length} spells` : `${shown.length} of ${enabled.length} spells`;
      list.innerHTML = shown.length ? shown.map((s, i) => rowHtml(s, i)).join("") : '<p class="empty">Nothing matches these filters.</p>';
      list.querySelectorAll(".row").forEach((r) => r.classList.add("enter-fast"));
    };

    el.querySelector(".search input").addEventListener("input", (ev) => {
      state.query = ev.target.value;
      render();
    });
    schoolRow.addEventListener("click", (ev) => {
      const chip = ev.target.closest(".chip");
      if (!chip) return;
      state.school = chip.dataset.school;
      render();
    });
    rarityRow.addEventListener("click", (ev) => {
      const chip = ev.target.closest(".chip");
      if (!chip) return;
      state.rarity = chip.dataset.rarity;
      render();
    });
    list.addEventListener("click", (ev) => {
      const lvlBtn = ev.target.closest(".sp-lvl");
      if (lvlBtn) {
        const row = lvlBtn.closest(".row");
        const s = all.find((x) => x.id === row.dataset.id);
        state.level[s.id] = Number(lvlBtn.dataset.level);
        row.querySelectorAll(".sp-lvl").forEach((b) => b.setAttribute("aria-pressed", String(b === lvlBtn)));
        const box = row.querySelector(".sp-stats");
        box.classList.add("swap");
        setTimeout(() => {
          box.innerHTML = statsHtml(s, state.level[s.id]);
          box.querySelectorAll(".ic-stat").forEach((x) => ((x.style.opacity = "1"), (x.style.transform = "none")));
          box.classList.remove("swap");
        }, 120);
        return;
      }
      const head = ev.target.closest(".row-head");
      if (!head) return;
      const row = head.closest(".row");
      const s = all.find((x) => x.id === row.dataset.id);
      const wasOpen = state.open === s.id;
      list.querySelectorAll(".row.open").forEach((r) => {
        r.classList.remove("open");
        r.querySelector(".row-head").setAttribute("aria-expanded", "false");
      });
      state.open = wasOpen ? null : s.id;
      if (!wasOpen) {
        row.querySelector(".row-body > div").innerHTML = detailHtml(s);
        requestAnimationFrame(() =>
          requestAnimationFrame(() => {
            row.classList.add("open");
            head.setAttribute("aria-expanded", "true");
          })
        );
      }
    });
    TMC.onModsChange = render;
    render();
  };
})();
