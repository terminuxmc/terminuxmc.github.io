// "Mods" in the top bar: hovering it drops down a list of the mods that add relics, weapons, armor or tools.
// Each one is a switch; switching a mod off hides its content on every page. The list builds itself from the data
// files, so mods that appear in a new export show up here with no change to the site. Terminux Additions cannot be
// switched off. The choice is kept in this browser.

(() => {
  const TMC = window.TMC;
  const KEY = "tmc-mods-off";
  const LOCKED = new Set(["terminux"]);
  const off = new Set(JSON.parse(localStorage.getItem(KEY) || "[]"));

  /** True if this mod's content is shown. */
  TMC.modOn = (namespace) => LOCKED.has(namespace) || !off.has(namespace);

  const wrap = document.getElementById("nav-mods");
  const btn = wrap.querySelector(".nav-mods-btn");
  const pop = document.getElementById("mods-pop");

  async function collect() {
    const mods = new Map();
    const add = (ns, name) => {
      if (!mods.has(ns)) mods.set(ns, name || ns);
    };
    try {
      const relics = await TMC.loadJson("data/relics.json");
      relics.relics.forEach((r) => add(r.namespace, r.mod));
    } catch {}
    try {
      const items = await TMC.loadJson("data/items.json");
      items.items.forEach((i) => add(i.mod, i.modName));
    } catch {}
    try {
      const gems = await TMC.loadJson("data/gems.json");
      gems.gems.forEach((g) => add(g.mod, g.modName));
    } catch {}
    return [...mods.entries()].sort((a, b) => {
      if (LOCKED.has(a[0]) !== LOCKED.has(b[0])) return LOCKED.has(a[0]) ? -1 : 1;
      return a[1].localeCompare(b[1]);
    });
  }

  function render(mods) {
    pop.innerHTML = `
      <p class="mods-title">Show content from</p>
      <div class="mods-list">
        ${mods
          .map(([ns, name], i) => {
            const locked = LOCKED.has(ns);
            return `
              <label class="mod-switch${locked ? " locked" : ""}" style="--i:${Math.min(i, 20)}">
                <input type="checkbox" data-ns="${TMC.esc(ns)}" ${TMC.modOn(ns) ? "checked" : ""} ${locked ? "disabled" : ""}>
                <span class="track" aria-hidden="true"><span class="knob"></span></span>
                <span class="mod-name">${TMC.esc(name)}</span>
                ${locked ? '<span class="mod-tag">Always on</span>' : ""}
              </label>`;
          })
          .join("")}
      </div>`;
  }

  pop.addEventListener("change", (e) => {
    const box = e.target.closest("input[data-ns]");
    if (!box) return;
    if (box.checked) off.delete(box.dataset.ns);
    else off.add(box.dataset.ns);
    localStorage.setItem(KEY, JSON.stringify([...off]));
    if (TMC.onModsChange) TMC.onModsChange();
  });

  // Hover opens on a pointer; a tap or a keyboard opens and closes it too, which is how the phone menu uses it.
  const setOpen = (open) => {
    wrap.classList.toggle("open", open);
    btn.setAttribute("aria-expanded", String(open));
  };
  btn.addEventListener("click", () => setOpen(!wrap.classList.contains("open")));
  wrap.addEventListener("mouseenter", () => {
    if (matchMedia("(hover: hover) and (min-width: 861px)").matches) setOpen(true);
  });
  wrap.addEventListener("mouseleave", () => {
    if (matchMedia("(hover: hover) and (min-width: 861px)").matches) setOpen(false);
  });
  wrap.addEventListener("focusout", (e) => {
    if (!wrap.contains(e.relatedTarget) && matchMedia("(min-width: 861px)").matches) setOpen(false);
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && wrap.classList.contains("open")) {
      setOpen(false);
      btn.focus();
    }
  });

  collect().then(render);
})();
