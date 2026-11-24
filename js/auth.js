// Accounts (Firebase). Top right: "Log in · Sign up"; once logged in, the username and "Log out".
// The same buttons sit at the bottom of the phone menu.
// Usernames become an internal e-mail address behind the scenes: username@terminuxmc.firebaseapp.com. Firebase keeps
// the passwords.
// Data (rules: ../Planning/Firestore-Kurallari.txt):
//   users/{uid}     private: { username, usernameLower, createdAt } (only its owner reads it)
//   profiles/{uid}  public: { username }
// Linking a Minecraft account and the profile data sent by the game come in a later step.

import { initializeApp } from "https://www.gstatic.com/firebasejs/13.4.0/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  deleteUser,
} from "https://www.gstatic.com/firebasejs/13.4.0/firebase-auth.js";
import { getFirestore, doc, getDoc, writeBatch, serverTimestamp } from "https://www.gstatic.com/firebasejs/13.4.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyA4YumHcwdD8GaVFFdXncNAeLZOBzXOjyo",
  authDomain: "terminuxmc.firebaseapp.com",
  projectId: "terminuxmc",
  storageBucket: "terminuxmc.firebasestorage.app",
  messagingSenderId: "668616977979",
  appId: "1:668616977979:web:a8fce3e6a9c6db168a761e",
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const EMAIL_DOMAIN = "terminuxmc.firebaseapp.com";
const USERNAME_RE = /^[A-Za-z0-9_.-]{3,20}$/;
const MIN_PASSWORD = 8;

const TMC = window.TMC;
const esc = TMC.esc;

let user = null; // the Firebase user; anonymous sessions are not site accounts
let account = null; // users/{uid}
let view = "login";

const ERRORS = {
  username: "Usernames are 3 to 20 characters: letters, digits, dots, underscores and dashes.",
  password: `Passwords need at least ${MIN_PASSWORD} characters.`,
  mismatch: "The passwords do not match.",
  taken: "That username is taken.",
  wrong: "Wrong username or password.",
  tooMany: "Too many attempts. Wait a little and try again.",
  network: "Could not connect. Check your connection and try again.",
  denied: "You are not allowed to do that.",
  other: "Something went wrong",
};

function errorText(err) {
  const code = (err && err.code) || "";
  if (code === "auth/email-already-in-use") return ERRORS.taken;
  if (["auth/invalid-credential", "auth/wrong-password", "auth/user-not-found", "auth/invalid-login-credentials"].includes(code)) return ERRORS.wrong;
  if (code === "auth/too-many-requests") return ERRORS.tooMany;
  if (code === "auth/network-request-failed" || code === "unavailable") return ERRORS.network;
  if (code === "auth/weak-password") return ERRORS.password;
  if (code === "permission-denied") return ERRORS.denied;
  return `${ERRORS.other}${code ? ` (${code})` : ""}.`;
}

// ---------- Account buttons ----------

const tabs = document.querySelectorAll("[data-auth-tab]");

function renderTabs() {
  const html = !user
    ? `<button type="button" class="btn" data-open="login">Log in</button>
       <button type="button" class="btn btn-gold" data-open="register">Sign up</button>`
    : `<a class="who" href="#profile">${esc((account && account.username) || "My account")}</a>
       <button type="button" class="btn" data-action="logout">Log out</button>`;
  tabs.forEach((tab) => {
    tab.innerHTML = html;
    Array.from(tab.children).forEach((c, i) => {
      c.style.setProperty("--i", String(i));
      c.classList.add("enter-fast");
    });
  });
}

tabs.forEach((tab) =>
  tab.addEventListener("click", async (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    if (TMC.closeMenu) TMC.closeMenu();
    if (b.dataset.open) openDialog(b.dataset.open);
    if (b.dataset.action === "logout") await signOut(auth);
  })
);

// ---------- Log in and sign up dialog ----------

const dialog = document.createElement("dialog");
dialog.className = "tmc-dialog";
document.body.appendChild(dialog);
dialog.addEventListener("click", (e) => {
  if (e.target === dialog) return TMC.closeDialog(dialog);
  const b = e.target.closest("button");
  if (!b) return;
  if (b.dataset.action === "close") TMC.closeDialog(dialog);
  else if (b.dataset.open) openDialog(b.dataset.open);
});
dialog.addEventListener("cancel", (e) => {
  e.preventDefault();
  TMC.closeDialog(dialog);
});

const field = (name, label, type, hint, autocomplete) =>
  `<label class="auth-field"><span>${label}</span><input name="${name}" type="${type}" autocomplete="${autocomplete}" required>${hint ? `<small>${hint}</small>` : ""}</label>`;

function renderDialog() {
  const close = `<button type="button" class="auth-close" data-action="close" aria-label="Close">×</button>`;
  if (view === "login") {
    dialog.innerHTML = `
      <form class="auth-panel" novalidate>
        ${close}
        <h2>Log in</h2>
        ${field("username", "Username", "text", "", "username")}
        ${field("password", "Password", "password", "", "current-password")}
        <p class="auth-error" role="alert"></p>
        <button type="submit" class="btn btn-gold auth-submit">Log in</button>
        <p class="auth-switch">No account yet? <button type="button" data-open="register">Sign up</button></p>
      </form>`;
  } else {
    dialog.innerHTML = `
      <form class="auth-panel" novalidate>
        ${close}
        <h2>Sign up</h2>
        ${field("username", "Username", "text", "3 to 20 characters: letters, digits, dots, underscores, dashes. Cannot be changed later.", "username")}
        ${field("password", "Password", "password", `At least ${MIN_PASSWORD} characters.`, "new-password")}
        ${field("password2", "Password again", "password", "", "new-password")}
        <p class="auth-error" role="alert"></p>
        <button type="submit" class="btn btn-gold auth-submit">Sign up</button>
        <p class="auth-switch">Already have an account? <button type="button" data-open="login">Log in</button></p>
      </form>`;
  }
  TMC.animateIn(dialog.querySelector(".auth-panel"), "enter-fast");
}

function openDialog(which) {
  view = which;
  renderDialog();
  TMC.openDialog(dialog);
  const first = dialog.querySelector("input");
  if (first) first.focus();
}
TMC.openLogin = () => openDialog("login");

dialog.addEventListener("submit", async (e) => {
  e.preventDefault();
  const form = e.target;
  const errBox = form.querySelector(".auth-error");
  const submit = form.querySelector(".auth-submit");
  const v = Object.fromEntries(new FormData(form));
  const username = String(v.username || "").trim();
  const showError = (msg) => (errBox.textContent = msg);
  showError("");

  if (!USERNAME_RE.test(username)) return showError(ERRORS.username);
  if (view === "register") {
    if (String(v.password).length < MIN_PASSWORD) return showError(ERRORS.password);
    if (v.password !== v.password2) return showError(ERRORS.mismatch);
  }

  const label = submit.textContent;
  submit.disabled = true;
  submit.textContent = "Please wait…";
  const email = `${username.toLowerCase()}@${EMAIL_DOMAIN}`;
  try {
    if (view === "login") {
      await signInWithEmailAndPassword(auth, email, v.password);
    } else {
      const cred = await createUserWithEmailAndPassword(auth, email, v.password);
      const acc = { username, usernameLower: username.toLowerCase(), createdAt: serverTimestamp() };
      try {
        const batch = writeBatch(db);
        batch.set(doc(db, "users", cred.user.uid), acc);
        batch.set(doc(db, "profiles", cred.user.uid), { username });
        await batch.commit();
      } catch (err) {
        // If the account record could not be written, the login is removed too so the username stays free
        await deleteUser(cred.user).catch(() => {});
        throw err;
      }
      account = acc;
      renderTabs();
    }
    TMC.closeDialog(dialog);
  } catch (err) {
    showError(errorText(err));
  } finally {
    submit.disabled = false;
    submit.textContent = label;
  }
});

// ---------- Profile page ----------

TMC.PAGES.profile = (el) => {
  if (!user) {
    el.innerHTML = `
      <div class="page-head"><h1>Profile</h1></div>
      <section class="placeholder">
        <p>Log in to see your profile.</p>
        <div><button type="button" class="btn btn-gold" id="profile-login">Log in</button></div>
      </section>`;
    el.querySelector("#profile-login").addEventListener("click", () => openDialog("login"));
    TMC.animateIn(el);
    return;
  }
  el.innerHTML = `
    <div class="page-head"><h1>${esc((account && account.username) || "Profile")}</h1></div>
    <section class="placeholder">
      <p class="eyebrow">Minecraft account</p>
      <p>No Minecraft account is linked yet. Linking is on its way: type <code>/terminux add</code> in game and confirm the link it sends to chat.</p>
    </section>`;
  TMC.animateIn(el);
};

// ---------- Session ----------

onAuthStateChanged(auth, async (u) => {
  user = u && !u.isAnonymous ? u : null;
  account = null;
  if (user) {
    try {
      const snap = await getDoc(doc(db, "users", user.uid));
      account = snap.exists() ? snap.data() : null;
    } catch {
      account = null;
    }
  }
  renderTabs();
  if (location.hash.startsWith("#profile")) TMC.route(true);
});

renderTabs();
