// Log in with Kiwibase, for TerminuxMC.
// 1. Adds a "Log in with Kiwibase" button to the site's log in / sign up dialog. It opens Kiwibase, which signs the
//    user in there and comes back here with a one-hour sign-in token in the URL fragment (#kbtoken=…).
// 2. On load, takes that token out of the address bar at once and signs in with it (signInWithCustomToken), using the
//    site's own Firebase app, so the rest of the site sees an ordinary signed-in user.
// Load it after the site's auth module: <script type="module" src="js/kb-login.js"></script>
// The SDK version must be the one the site's auth.js imports, or getApp() finds no app.

import { getApp } from "https://www.gstatic.com/firebasejs/13.4.0/firebase-app.js";
import { getAuth, signInWithCustomToken } from "https://www.gstatic.com/firebasejs/13.4.0/firebase-auth.js";

const PROJECT = "terminuxmc";
const KIWIBASE = "https://kiwibase.github.io/#/sso/" + PROJECT;
const FORM = "dialog.tmc-dialog form.auth-panel";
const BEFORE = ".auth-switch";
const BUTTON_CLASS = "btn kb-login";

// ---- the token coming back from Kiwibase
const m = /^#kbtoken=([^&]+)/.exec(location.hash);
if (m) {
  const token = decodeURIComponent(m[1]);
  // Out of the address bar and history before anything else runs with the URL
  history.replaceState(null, "", location.pathname + location.search);
  signInWithCustomToken(getAuth(getApp()), token).catch((err) => console.warn("Kiwibase sign-in failed", err && err.code));
}

// ---- the button
function addButton(form) {
  if (form.querySelector(".kb-login")) return;
  const a = document.createElement("a");
  a.className = BUTTON_CLASS;
  a.href = KIWIBASE;
  a.textContent = "Log in with Kiwibase";
  a.style.justifyContent = "center";
  a.style.textAlign = "center";
  const before = form.querySelector(BEFORE);
  if (before) form.insertBefore(a, before);
  else form.appendChild(a);
}
new MutationObserver(() => document.querySelectorAll(FORM).forEach(addButton)).observe(document.body, { childList: true, subtree: true });
document.querySelectorAll(FORM).forEach(addButton);
