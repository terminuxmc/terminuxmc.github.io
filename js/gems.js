// Gems. Data: data/gems.json, from the mod jars via Tools/SiteData/build_gems.py.
// A searchable list with stat toggles (each toggle narrows the list to gems that have that kind of bonus) and world
// tier chips; a click slides the gem card open, where the purity buttons switch every bonus value.

(() => {
  const TMC = window.TMC;
  const TIER_NAMES = { haven: "Haven", frontier: "Frontier", ascent: "Ascent", summit: "Summit", pinnacle: "Pinnacle" };
  const DIMENSIONS = {
    "minecraft:overworld": "Overworld",
    "minecraft:the_nether": "Nether",
    "minecraft:the_end": "End",
    "twilightforest:twilight_forest": "Twilight Forest",
  };
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  const state = { query: "", groups: new Set(), tier: "", open: null, purity: {} };

  const chevron =
    '<svg class="chev" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M3 6l5 5 5-5" fill="none" stroke="currentColor" stroke-width="2"/></svg>';

  const tierIndex = (data, t) => data.tiers.indexOf(t);

  function value(p, purity) {
    if (p.text) return "";
    const v = p.values[purity];
    if (v === undefined) return "–";
    const n = p.pct ? v * 100 : v;
    return `${n > 0 ? "+" : ""}${TMC.num(n)}${p.pct ? "%" : ""}`;
  }

  /** Purities this gem can have, lowest first. */
  const puritiesOf = (data, gem) => data.purities.slice(data.purities.indexOf(gem.minPurity));

  function bonusesHtml(gem, purity) {
    return gem.bonuses
      .map(
        (b) => `
        <div class="gm-bonus">
          <span class="gm-slot">${TMC.esc(b.slot)}</span>
          <div class="gm-parts">
            ${b.parts
              .map((p) => {
                const v = value(p, purity);
                const neg = v.startsWith("-");
                return `<div class="gm-part${p.text ? " text" : ""}"><span class="gm-pname">${TMC.esc(p.name)}</span>${
                  p.text ? "" : `<span class="gm-pval${neg ? " neg" : ""}">${TMC.esc(v)}</span>`
                }</div>`;
              })
              .join("")}
          </div>
        </div>`
      )
      .join("");
  }

  function detailHtml(data, gem) {
    const purities = puritiesOf(data, gem);
    const purity = state.purity[gem.id] && purities.includes(state.purity[gem.id]) ? state.purity[gem.id] : purities[purities.length - 1];
    const tags = [`<span class="ic-tag mod">${TMC.esc(gem.modName)}</span>`];
    if (gem.unique) tags.unshift('<span class="ic-tag unique">Unique</span>');
    gem.dimensions.forEach((d) => tags.push(`<span class="ic-tag dim">${TMC.esc(DIMENSIONS[d] || d)}</span>`));
    return `
      <div class="detail item-detail gem-detail">
        <div class="ic-hero">
          <span class="ic-icon">${gem.icon ? `<img src="${gem.icon}" alt="" width="64" height="64">` : ""}</span>
          <div class="ic-head">
            <h3 class="ic-name">${TMC.esc(gem.name)}</h3>
            <div class="ic-tags">${tags.join("")}</div>
          </div>
        </div>
        <div class="gm-tiers">
          ${data.tiers
            .map((t, i) => `<span class="gm-tier${gem.tiers.includes(t) ? " on" : ""}"><b>T${i + 1}</b>${TIER_NAMES[t]}</span>`)
            .join("")}
        </div>
        <div class="gm-purity" role="group" aria-label="Purity">
          ${purities
            .map((p) => `<button type="button" class="gm-pbtn" data-purity="${p}" aria-pressed="${p === purity}">${cap(p)}</button>`)
            .join("")}
        </div>
        <div class="gm-bonuses">${bonusesHtml(gem, purity)}</div>
      </div>`;
  }

  function rowHtml(data, gem, i) {
    const open = state.open === gem.id;
    const first = tierIndex(data, gem.tiers[0]);
    const desc = [gem.modName];
    if (gem.unique) desc.push("Unique");
    gem.dimensions.forEach((d) => desc.push(DIMENSIONS[d] || d));
    return `
      <div class="row${open ? " open" : ""}" data-id="${TMC.esc(gem.id)}" style="--i:${Math.min(i, 14)}">
        <button type="button" class="row-head" aria-expanded="${open}">
          ${gem.icon ? `<img src="${gem.icon}" alt="" width="40" height="40" loading="lazy" class="gm-rowicon">` : '<span class="gm-rowicon"></span>'}
          <span class="row-main">
            <span class="row-name">${TMC.esc(gem.name)}</span>
            <span class="row-desc">${TMC.esc(desc.join(" · "))}</span>
          </span>
          <span class="pills"><span class="pill"><span>From</span> <b>T${first + 1}</b></span></span>
          ${chevron}
        </button>
        <div class="row-body"><div>${open ? detailHtml(data, gem) : ""}</div></div>
      </div>`;
  }

  TMC.PAGES.gems = async (el) => {
    el.innerHTML = '<div class="page-head"><h1>Gems</h1></div>';
    let data = null;
    try {
      data = await TMC.loadJson("data/gems.json");
    } catch {}
    if (!data) {
      el.innerHTML = '<div class="page-head"><h1>Gems</h1></div><section class="placeholder"><p class="eyebrow">No data yet</p></section>';
      TMC.animateIn(el);
      return;
    }
    el.innerHTML = `
      <div class="page-head"><h1>Gems</h1><span class="count"></span></div>
      <div class="filters">
        <label class="search">
          <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" stroke-width="2"/><path d="M16.5 16.5L21 21" stroke="currentColor" stroke-width="2"/></svg>
          <input type="search" placeholder="Search gems" aria-label="Search gems" value="${TMC.esc(state.query)}">
        </label>
      </div>
      <div class="chips-row gm-groups"></div>
      <div class="chips-row gm-tierchips"></div>
      <div class="list"></div>`;
    TMC.animateIn(el);
    const list = el.querySelector(".list");
    const count = el.querySelector(".count");
    const groupsRow = el.querySelector(".gm-groups");
    const tierRow = el.querySelector(".gm-tierchips");

    const render = () => {
      const enabled = data.gems.filter((g) => TMC.modOn(g.mod));
      const byGroup = new Map(data.groups.map((g) => [g, 0]));
      enabled.forEach((g) => g.groups.forEach((x) => byGroup.set(x, (byGroup.get(x) || 0) + 1)));
      groupsRow.innerHTML = data.groups
        .filter((g) => byGroup.get(g))
        .map((g) => `<button type="button" class="chip" data-group="${TMC.esc(g)}" aria-pressed="${state.groups.has(g)}">${TMC.esc(g)} <span class="chip-n">${byGroup.get(g)}</span></button>`)
        .join("");
      tierRow.innerHTML = [`<button type="button" class="chip" data-tier="" aria-pressed="${!state.tier}">Any tier</button>`]
        .concat(data.tiers.map((t, i) => `<button type="button" class="chip" data-tier="${t}" aria-pressed="${state.tier === t}">T${i + 1} ${TIER_NAMES[t]}</button>`))
        .join("");
      const q = state.query.trim().toLowerCase();
      const shown = enabled.filter(
        (g) =>
          [...state.groups].every((x) => g.groups.includes(x)) &&
          (!state.tier || g.tiers.includes(state.tier)) &&
          (!q || (g.name + " " + g.modName + " " + g.bonuses.map((b) => b.parts.map((p) => p.name).join(" ")).join(" ")).toLowerCase().includes(q))
      );
      count.textContent = shown.length === enabled.length ? `${enabled.length} gems` : `${shown.length} of ${enabled.length} gems`;
      list.innerHTML = shown.length ? shown.map((g, n) => rowHtml(data, g, n)).join("") : '<p class="empty">Nothing matches these filters.</p>';
      list.querySelectorAll(".row").forEach((r) => r.classList.add("enter-fast"));
    };

    el.querySelector(".search input").addEventListener("input", (e) => {
      state.query = e.target.value;
      render();
    });
    groupsRow.addEventListener("click", (e) => {
      const chip = e.target.closest(".chip");
      if (!chip) return;
      const g = chip.dataset.group;
      if (state.groups.has(g)) state.groups.delete(g);
      else state.groups.add(g);
      render();
    });
    tierRow.addEventListener("click", (e) => {
      const chip = e.target.closest(".chip");
      if (!chip) return;
      state.tier = chip.dataset.tier;
      render();
    });
    list.addEventListener("click", (e) => {
      const pbtn = e.target.closest(".gm-pbtn");
      if (pbtn) {
        const row = pbtn.closest(".row");
        const gem = data.gems.find((g) => g.id === row.dataset.id);
        state.purity[gem.id] = pbtn.dataset.purity;
        row.querySelectorAll(".gm-pbtn").forEach((b) => b.setAttribute("aria-pressed", String(b === pbtn)));
        const box = row.querySelector(".gm-bonuses");
        box.classList.add("swap");
        setTimeout(() => {
          box.innerHTML = bonusesHtml(gem, pbtn.dataset.purity);
          box.classList.remove("swap");
        }, 120);
        return;
      }
      const head = e.target.closest(".row-head");
      if (!head) return;
      const row = head.closest(".row");
      const gem = data.gems.find((g) => g.id === row.dataset.id);
      const wasOpen = state.open === gem.id;
      list.querySelectorAll(".row.open").forEach((r) => {
        r.classList.remove("open");
        r.querySelector(".row-head").setAttribute("aria-expanded", "false");
      });
      state.open = wasOpen ? null : gem.id;
      if (!wasOpen) {
        row.querySelector(".row-body > div").innerHTML = detailHtml(data, gem);
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
