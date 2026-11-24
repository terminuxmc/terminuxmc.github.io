// TerminuxMC: page router and shared helpers.
// Pages are chosen by the address hash (#relics, #tree, #profile …). Each page is a mount(el, args) function in
// TMC.PAGES; relics.js and auth.js add theirs. Page changes fade the old page out and let the new one rise in.

const TMC = (window.TMC = window.TMC || {});

TMC.RARITIES = ["Common", "Uncommon", "Rare", "Epic", "Mythic"];

TMC.esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

TMC.num = (n) => {
  if (n === null || n === undefined) return "?";
  return (Math.round(n * 1000) / 1000).toLocaleString("en-US", { maximumFractionDigits: 3 });
};

const cache = {};
TMC.loadJson = (path) => {
  if (!cache[path]) {
    cache[path] = fetch(path).then((r) => {
      if (!r.ok) throw new Error(path + " " + r.status);
      return r.json();
    });
  }
  return cache[path];
};

/** Gives the direct children of a container the rising entrance, one after another. */
TMC.animateIn = (container, cls = "enter") => {
  Array.from(container.children).forEach((child, i) => {
    child.style.setProperty("--i", String(Math.min(i, 14)));
    child.classList.add(cls);
  });
};

TMC.PAGES = TMC.PAGES || {};

const SOON = {
  tree: ["Skill Tree", "The skill tree exactly as it looks in the game: zoom, drag, mastery trees, node details and a build planner. Coming soon."],
};

function soonPage(id) {
  const [title, text] = SOON[id];
  return (el) => {
    el.innerHTML = `
      <div class="page-head"><h1>${title}</h1></div>
      <section class="placeholder"><p class="eyebrow">Coming soon</p><p>${TMC.esc(text)}</p></section>`;
    TMC.animateIn(el);
  };
}
for (const id of Object.keys(SOON)) if (!TMC.PAGES[id]) TMC.PAGES[id] = soonPage(id);

const app = document.getElementById("app");
const nav = document.querySelector(".mainnav");
const ink = document.querySelector(".nav-ink");

/** Slides the gold line under the active tab. */
function moveInk() {
  const active = nav.querySelector('a[aria-current="page"]');
  if (!active) {
    ink.style.opacity = "0";
    return;
  }
  if (getComputedStyle(ink).display === "none") return;
  ink.style.width = active.offsetWidth + "px";
  ink.style.transform = `translateX(${active.offsetLeft}px)`;
  ink.style.opacity = "1";
}

let current = null;
let leaveTimer = 0;

TMC.route = (instant = false) => {
  const hash = location.hash.replace(/^#/, "");
  const id = TMC.PAGES[hash.split("/")[0]] ? hash.split("/")[0] : "relics";
  nav.querySelectorAll("a[data-page]").forEach((a) => {
    if (a.dataset.page === id) a.setAttribute("aria-current", "page");
    else a.removeAttribute("aria-current");
  });
  moveInk();
  const draw = () => {
    app.classList.remove("leaving");
    app.innerHTML = "";
    TMC.onModsChange = null;
    current = id;
    TMC.PAGES[id](app, hash.split("/").slice(1));
  };
  clearTimeout(leaveTimer);
  if (instant || current === null) return draw();
  app.classList.add("leaving");
  leaveTimer = setTimeout(draw, 140);
};

window.addEventListener("hashchange", () => {
  closeMenu();
  window.scrollTo({ top: 0, behavior: "smooth" });
  TMC.route();
  app.focus({ preventScroll: true });
});
window.addEventListener("resize", moveInk);
document.fonts && document.fonts.ready.then(moveInk);

// ---------- Theme: the moon turns into the sun ----------

const themeBtn = document.getElementById("theme-toggle");
const labelTheme = () =>
  themeBtn.setAttribute("aria-label", document.documentElement.dataset.theme === "light" ? "Switch to dark theme" : "Switch to light theme");
labelTheme();
themeBtn.addEventListener("click", () => {
  const root = document.documentElement;
  const next = root.dataset.theme === "light" ? "dark" : "light";
  root.classList.add("theming");
  root.dataset.theme = next;
  localStorage.setItem("tmc-theme", next);
  labelTheme();
  setTimeout(() => root.classList.remove("theming"), 460);
});

// ---------- Phone menu: a panel that slides in from the left ----------

const menuBtn = document.getElementById("menu-toggle");
const scrim = document.getElementById("scrim");
function openMenu() {
  document.body.classList.add("menu-open");
  menuBtn.setAttribute("aria-expanded", "true");
  menuBtn.setAttribute("aria-label", "Close menu");
}
function closeMenu() {
  document.body.classList.remove("menu-open");
  menuBtn.setAttribute("aria-expanded", "false");
  menuBtn.setAttribute("aria-label", "Open menu");
}
TMC.closeMenu = closeMenu;
menuBtn.addEventListener("click", () => (document.body.classList.contains("menu-open") ? closeMenu() : openMenu()));
scrim.addEventListener("click", closeMenu);
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && document.body.classList.contains("menu-open")) closeMenu();
});

// ---------- Dialogs that fade and rise in, and fade out ----------

TMC.openDialog = (dialog) => {
  if (!dialog.open) dialog.showModal();
  requestAnimationFrame(() => requestAnimationFrame(() => dialog.classList.add("show")));
};
TMC.closeDialog = (dialog) => {
  if (!dialog.open) return;
  dialog.classList.remove("show");
  setTimeout(() => dialog.open && dialog.close(), 280);
};

// First draw once the other scripts have added their pages
document.addEventListener("DOMContentLoaded", () => TMC.route(true));
