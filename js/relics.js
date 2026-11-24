// Relics page. Data: data/relics.json, made by Tools/SiteData/build_relics.py.
// A searchable list; clicking a relic slides its info panel open below it.
// The panel has rarity tabs and, per ability, a level slider: the track runs to the ability's highest level, but the
// part above the chosen rarity's level cap is locked and the handle cannot enter it. The description shows the
// values at the slider's level. Beside it: which rarities the relic drops with on each world tier.

(() => {
  const TMC = window.TMC;
  const R = TMC.RARITIES;
  const state = { query: "", filter: 0, open: null, rarity: {}, levels: {} };

  const chevron =
    '<svg class="chev" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M3 6l5 5 5-5" fill="none" stroke="currentColor" stroke-width="2"/></svg>';

  /** Ability description with its stat values at this level: "%1$s" is the first stat, "%%" a percent sign. */
  function describe(ability, level) {
    let text = TMC.esc(ability.description.replace(/§./g, ""));
    text = text.replace(/%(\d+)\$s/g, (_, n) => {
      const stat = ability.stats[Number(n) - 1];
      if (!stat) return "?";
      const v = stat.best[Math.min(level, stat.best.length - 1)];
      return `<span class="val">${TMC.num(v)}</span>`;
    });
    return text.replace(/%%/g, "%").replace(/%s/g, "?");
  }

  /** Highest ability level allowed at this rarity, or null if the ability is still locked there. */
  function capAt(ability, rarity) {
    let cap = null;
    for (const [r, c] of ability.gates) if (r <= rarity) cap = c;
    return cap === null ? null : Math.min(cap, ability.maxLevel);
  }

  const levelKey = (relic, ability) => relic.id + "/" + ability.id;

  function sliderStyle(level, cap, max) {
    const pct = (x) => (max ? (100 * x) / max : 0);
    return `--v:${pct(level)}%;--cap:${pct(cap)}%`;
  }

  function abilityHtml(relic, ability, rarity) {
    const cap = capAt(ability, rarity);
    if (cap === null) {
      const opens = ability.gates.length ? R[ability.gates[0][0] - 1] : "?";
      return `
        <div class="ability locked">
          <div class="ability-head"><span class="ability-name">${TMC.esc(ability.name)}</span>
            <span class="ability-cap">Unlocks at ${TMC.esc(opens)}</span></div>
          <p>${describe(ability, 0)}</p>
        </div>`;
    }
    const key = levelKey(relic, ability);
    const level = Math.min(state.levels[key] ?? cap, cap);
    const slider =
      ability.maxLevel > 0
        ? `<div class="lvl">
             <input type="range" class="lvl-range" min="0" max="${ability.maxLevel}" step="1" value="${level}"
               data-key="${TMC.esc(key)}" data-cap="${cap}" style="${sliderStyle(level, cap, ability.maxLevel)}"
               aria-label="${TMC.esc(ability.name)} level" aria-valuetext="Level ${level} of ${cap}">
             <output class="lvl-out">Lv <b>${level}</b> / ${cap}</output>
           </div>`
        : "";
    return `
      <div class="ability" data-ability="${TMC.esc(ability.id)}">
        <div class="ability-head"><span class="ability-name">${TMC.esc(ability.name)}</span>
          <span class="ability-cap">Level cap <strong>${cap}</strong> of ${ability.maxLevel}</span></div>
        <p class="ability-text">${describe(ability, level)}</p>
        ${slider}
      </div>`;
  }

  function dropsHtml(relic, tiers) {
    const head = R.map((n, i) => `<span class="head r${i + 1}">${n}</span>`).join("");
    const rows = relic.drops
      .map((row, t) => {
        const name = `<span class="tier">${t + 1} · ${tiers[t]}</span>`;
        if (!row) return name + `<span class="never">Does not drop on this tier</span>`;
        return (
          name +
          row.map((p, i) => (p > 0 ? `<span class="cell r${i + 1}">${TMC.num(p)}%</span>` : `<span class="cell none">–</span>`)).join("")
        );
      })
      .join("");
    return `
      <div class="drops"><span></span>${head}${rows}</div>
      <p class="small-note">Rarity chances when found in a structure chest, by the world tier of the player who opens it.</p>`;
  }

  function abilitiesHtml(relic, rarity) {
    return relic.abilities.length
      ? relic.abilities.map((a) => abilityHtml(relic, a, rarity)).join("")
      : `<p class="small-note">This relic has no abilities.</p>`;
  }

  function detailHtml(relic, tiers) {
    const rarity = state.rarity[relic.id] || relic.unlock;
    const tabs = R.map((n, i) => {
      const r = i + 1;
      return `<button type="button" class="rtab r${r}" data-rarity="${r}" aria-pressed="${r === rarity}" ${r < relic.unlock ? "disabled" : ""}><span>${n}</span></button>`;
    }).join("");
    return `
      <div class="detail">
        ${relic.description ? `<div class="detail-top"><p class="flavor">${TMC.esc(relic.description)}</p></div>` : ""}
        <div class="detail-grid">
          <div class="detail-col">
            <p class="eyebrow">Abilities by rarity</p>
            <div class="rarity-tabs" role="group" aria-label="Rarity">${tabs}</div>
            <div class="abilities">${abilitiesHtml(relic, rarity)}</div>
          </div>
          <div class="detail-col">
            <p class="eyebrow">Rarity by world tier</p>
            ${dropsHtml(relic, tiers)}
          </div>
        </div>
      </div>`;
  }

  function rowHtml(relic, i) {
    const open = state.open === relic.id;
    return `
      <div class="row${open ? " open" : ""}" data-id="${relic.id}" style="--i:${Math.min(i, 14)}">
        <button type="button" class="row-head" aria-expanded="${open}">
          <img src="${relic.icon}" alt="" width="40" height="40" loading="lazy">
          <span class="row-main">
            <span class="row-name r${relic.unlock}">${TMC.esc(relic.name)}</span>
            <span class="row-desc">${TMC.esc(relic.description || relic.mod)}</span>
          </span>
          <span class="row-mod">${TMC.esc(relic.mod)}</span>
          <span class="row-rarity r${relic.unlock}">${R[relic.unlock - 1]}</span>
          ${chevron}
        </button>
        <div class="row-body"><div></div></div>
      </div>`;
  }

  function matches(relic) {
    if (!TMC.modOn(relic.namespace)) return false;
    if (state.filter && relic.unlock !== state.filter) return false;
    const q = state.query.trim().toLowerCase();
    if (!q) return true;
    return (relic.name + " " + relic.mod).toLowerCase().includes(q);
  }

  TMC.PAGES.relics = async (el) => {
    el.innerHTML = `<div class="page-head"><h1>Relics</h1></div>`;
    let data;
    try {
      data = await TMC.loadJson("data/relics.json");
    } catch (e) {
      el.innerHTML = `<div class="page-head"><h1>Relics</h1></div><section class="placeholder"><p>Could not load the relic data.</p></section>`;
      TMC.animateIn(el);
      return;
    }
    const chips = [`<button type="button" class="chip" data-filter="0">All</button>`]
      .concat(R.map((n, i) => `<button type="button" class="chip r${i + 1}" data-filter="${i + 1}">${n}</button>`))
      .join("");
    el.innerHTML = `
      <div class="page-head"><h1>Relics</h1><span class="count"></span></div>
      <div class="filters">
        <label class="search">
          <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" stroke-width="2"/><path d="M16.5 16.5L21 21" stroke="currentColor" stroke-width="2"/></svg>
          <input type="search" placeholder="Search relics" aria-label="Search relics" value="${TMC.esc(state.query)}">
        </label>
        ${chips}
      </div>
      <div class="list"></div>`;
    TMC.animateIn(el);
    const list = el.querySelector(".list");
    const count = el.querySelector(".count");

    const render = (entrance) => {
      const shown = data.relics.filter(matches);
      const enabled = data.relics.filter((r) => TMC.modOn(r.namespace)).length;
      count.textContent = shown.length === enabled ? `${enabled} relics` : `${shown.length} of ${enabled} relics`;
      el.querySelectorAll(".chip").forEach((c) => c.setAttribute("aria-pressed", String(Number(c.dataset.filter) === state.filter)));
      list.innerHTML = shown.length ? shown.map(rowHtml).join("") : `<p class="empty">No relic matches this search.</p>`;
      list.querySelectorAll(".row").forEach((row) => {
        row.classList.add(entrance);
        if (row.classList.contains("open")) {
          const relic = data.relics.find((r) => r.id === row.dataset.id);
          row.querySelector(".row-body > div").innerHTML = detailHtml(relic, data.tiers);
        }
      });
    };

    el.querySelector(".search input").addEventListener("input", (e) => {
      state.query = e.target.value;
      render("enter-fast");
    });
    el.querySelector(".filters").addEventListener("click", (e) => {
      const chip = e.target.closest(".chip");
      if (!chip) return;
      state.filter = Number(chip.dataset.filter);
      render("enter-fast");
    });

    // Level sliders: the handle stops at the rarity's cap; the description follows the level.
    list.addEventListener("input", (e) => {
      const range = e.target.closest(".lvl-range");
      if (!range) return;
      const cap = Number(range.dataset.cap);
      let level = Number(range.value);
      if (level > cap) {
        level = cap;
        range.value = String(cap);
      }
      state.levels[range.dataset.key] = level;
      const row = range.closest(".row");
      const relic = data.relics.find((r) => r.id === row.dataset.id);
      const ability = relic.abilities.find((a) => a.id === range.closest(".ability").dataset.ability);
      range.style.cssText = sliderStyle(level, cap, ability.maxLevel);
      range.setAttribute("aria-valuetext", `Level ${level} of ${cap}`);
      range.parentElement.querySelector(".lvl-out b").textContent = String(level);
      range.closest(".ability").querySelector(".ability-text").innerHTML = describe(ability, level);
    });

    list.addEventListener("click", (e) => {
      const row = e.target.closest(".row");
      if (!row) return;
      const relic = data.relics.find((r) => r.id === row.dataset.id);
      const tab = e.target.closest(".rtab");
      if (tab) {
        const rarity = Number(tab.dataset.rarity);
        state.rarity[relic.id] = rarity;
        // A new rarity puts each slider at that rarity's cap
        relic.abilities.forEach((a) => delete state.levels[levelKey(relic, a)]);
        row.querySelectorAll(".rtab").forEach((b) => b.setAttribute("aria-pressed", String(Number(b.dataset.rarity) === rarity)));
        const box = row.querySelector(".abilities");
        box.innerHTML = abilitiesHtml(relic, rarity);
        box.classList.remove("swap");
        void box.offsetWidth;
        box.classList.add("swap");
        return;
      }
      if (!e.target.closest(".row-head")) return;
      const wasOpen = state.open === relic.id;
      list.querySelectorAll(".row.open").forEach((r) => {
        r.classList.remove("open");
        r.querySelector(".row-head").setAttribute("aria-expanded", "false");
      });
      state.open = wasOpen ? null : relic.id;
      if (!wasOpen) {
        // Content first, then open on the next frame so it slides down
        row.querySelector(".row-body > div").innerHTML = detailHtml(relic, data.tiers);
        requestAnimationFrame(() =>
          requestAnimationFrame(() => {
            row.classList.add("open");
            row.querySelector(".row-head").setAttribute("aria-expanded", "true");
          })
        );
      }
    });
    TMC.onModsChange = () => render("enter-fast");
    render("enter-fast");
  };
})();
