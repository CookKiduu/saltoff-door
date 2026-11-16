/* Blue Tide cloud layer: sign-in, sync, and push notification setup.
   Local data is the source of truth. This file only copies it to Firestore and back.
   If firebase-config.js has no config, nothing here loads and the app runs offline-only. */
const App = window.App;
const CFG = window.FIREBASE_CONFIG;
const VAPID = (window.VAPID_PUBLIC_KEY || "").trim();
const esc = App.esc;
const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const standalone = (window.matchMedia && matchMedia("(display-mode: standalone)").matches) || navigator.standalone === true;
const pushAPI = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
const COLLS = ["customers", "jobs", "sessions", "pins", "plans", "log", "state"];
const $ = s => document.querySelector(s);

let F = null, auth = null, db = null, user = null, ready = false;
let busy = false, again = false, timer = null, lastErr = "", pushState = "unknown";

const S = () => App.state;
const syncMeta = () => (S().meta.sync = S().meta.sync || {});
const ago = ts => { if (!ts) return "never"; const s = (Date.now() - ts) / 1000; if (s < 60) return "just now"; if (s < 3600) return Math.round(s / 60) + " min ago"; if (s < 86400) return Math.round(s / 3600) + " hr ago"; return Math.round(s / 86400) + " days ago"; };
function deviceId() { let d = null; try { d = localStorage.getItem("bluetide-device"); if (!d) { d = "d" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8); localStorage.setItem("bluetide-device", d); } } catch (e) { d = "d-unknown"; } return d; }
const safeId = id => typeof id === "string" && id && !id.includes("/") && !id.startsWith("__") && id.length < 700;

/* ---------- header pill ---------- */
function pill() {
  if (!CFG) return App.setSyncPill(null);
  if (!ready) return App.setSyncPill(null);
  if (!user) return App.setSyncPill("off", "Sign in");
  if (!navigator.onLine) return App.setSyncPill("off", "Offline");
  if (lastErr) return App.setSyncPill("err", "Sync error");
  if (busy) return App.setSyncPill("ok", "Syncing");
  App.setSyncPill("ok", "Synced");
}

/* ---------- settings panels (called by app.js when Settings opens) ---------- */
function panelHTML() {
  if (!CFG) return `<div class="muted small">Cloud sync isn't set up yet. The app works fully on this phone. Follow the setup guide to turn on sync and notifications.</div>`;
  if (!ready) return `<div class="muted small">Loading…</div>`;
  if (!user) return `<div class="muted small">Sign in to back up to the cloud, use more than one device, and get reminders.</div>
    <input class="f" id="cl-email" type="email" autocomplete="username" inputmode="email" placeholder="Email">
    <input class="f" id="cl-pass" type="password" autocomplete="current-password" placeholder="Password">
    <button class="save teal" type="button" id="cl-signin">Sign in</button>
    <button class="btn sm" type="button" id="cl-reset">Forgot password</button>
    <div class="muted small" id="cl-msg" role="status"></div>`;
  const m = syncMeta();
  return `<div class="kv"><span>Signed in as</span><b>${esc(user.email || "")}</b></div>
    <div class="kv"><span>Last sync</span><b>${esc(ago(m.last))}</b></div>
    ${lastErr ? `<div class="warnbox"><span>${esc(lastErr)}</span></div>` : ""}
    <div class="two"><button class="btn" type="button" id="cl-sync">Sync now</button><button class="btn" type="button" id="cl-out">Sign out</button></div>
    <div class="muted small">Everything still saves on this phone first, so the app works with no signal and catches up later.</div>`;
}
function notifHTML() {
  if (!CFG) return `<div class="muted small">Notifications need cloud sync. Set it up first (see the setup guide).</div>`;
  if (!user) return `<div class="muted small">Sign in first (Account &amp; sync, above).</div>`;
  if (!VAPID) return `<div class="muted small">Almost there: the notification key is missing. Run <b>node setup-keys.js</b> (setup guide) and upload firebase-config.js again.</div>`;
  if (!pushAPI && isIOS && !standalone) return `<div class="muted small">iPhone only allows notifications for apps on the Home Screen. Open Blue Tide from its Home Screen icon, then come back here.</div>`;
  if (!pushAPI) return `<div class="muted small">This browser can't receive notifications. On iPhone, use the Home Screen app (iOS 16.4 or newer).</div>`;
  if (Notification.permission === "denied") return `<div class="muted small">Notifications are blocked. Turn them on in iPhone Settings → Notifications → ${esc(S().settings.appName || "Blue Tide")}, then come back.</div>`;
  if (pushState === "on" && S().settings.notif.enabled) return `<div class="update"><span>Notifications are on for this phone.</span></div>
    <div class="two"><button class="btn" type="button" id="nf-test">Send a test</button><button class="btn" type="button" id="nf-off">Turn off</button></div>
    <div class="muted small">Pick which ones you want below. Reminders are checked every 5 minutes.</div>`;
  return `<button class="save teal" type="button" id="nf-on">Turn on notifications</button>
    <div class="muted small">You'll get session reminders, follow-ups and payment nudges. Never during school or at night (you can change those times below).</div>`;
}
function wirePanels() {
  const on = (id, fn) => { const e = document.getElementById(id); if (e) e.onclick = fn; };
  on("cl-signin", signIn); on("cl-reset", resetPw); on("cl-out", signOutNow);
  on("cl-sync", () => { syncNow(true); });
  on("nf-on", enablePush); on("nf-off", disablePush); on("nf-test", testPush);
  const pw = $("#cl-pass"); if (pw) pw.addEventListener("keydown", e => { if (e.key === "Enter") signIn(); });
}
function refreshPanels() {
  const a = $("#cloud-panel"); if (a) { a.innerHTML = panelHTML(); }
  const n = $("#notif-panel"); if (n) { n.innerHTML = notifHTML(); }
  if (a || n) wirePanels();
  pill();
}
const msg = t => { const e = $("#cl-msg"); if (e) e.textContent = t; };

/* ---------- auth ---------- */
const AUTH_ERR = {
  "auth/invalid-credential": "Wrong email or password.", "auth/wrong-password": "Wrong email or password.",
  "auth/user-not-found": "No account with that email. Ask your parent to add you in the Firebase console.",
  "auth/invalid-email": "That email doesn't look right.", "auth/too-many-requests": "Too many tries. Wait a few minutes.",
  "auth/network-request-failed": "No signal. Try again when you're online.", "auth/missing-password": "Type your password."
};
async function signIn() {
  const email = ($("#cl-email") || {}).value || "", pass = ($("#cl-pass") || {}).value || "";
  if (!email.trim() || !pass) return msg("Type your email and password.");
  msg("Signing in…");
  try { await F.signInWithEmailAndPassword(auth, email.trim(), pass); }
  catch (e) { msg(AUTH_ERR[e.code] || ("Couldn't sign in (" + (e.code || e.message) + ").")); }
}
async function resetPw() {
  const email = (($("#cl-email") || {}).value || "").trim();
  if (!email) return msg("Type your email above first.");
  try { await F.sendPasswordResetEmail(auth, email); msg("Check your email for a reset link."); }
  catch (e) { msg(AUTH_ERR[e.code] || "Couldn't send the email."); }
}
async function signOutNow() {
  try { await F.signOut(auth); } catch (e) {}
  App.toast("Signed out. Your data is still on this phone.");
}

/* ---------- sync ---------- */
function schedule(ms) { clearTimeout(timer); timer = setTimeout(() => syncNow(false), ms); }
async function syncNow(manual) {
  if (!user || !db) return;
  if (!navigator.onLine) { pill(); if (manual) App.toast("No signal. It'll sync when you're back online."); return; }
  if (busy) { again = true; return; }
  busy = true; pill();
  try {
    await pull();
    await push();
    await pushReminders();
    const m = syncMeta(); m.last = Date.now(); lastErr = ""; App.persist();
    if (manual) App.toast("Synced");
  } catch (e) {
    console.warn("sync failed", e);
    lastErr = e && e.code === "permission-denied" ? "The cloud said no. Make sure firestore.rules was deployed (setup guide)." :
      e && (e.code === "unavailable" || e.code === "deadline-exceeded") ? "Weak signal. It'll try again soon." : ("Sync problem: " + ((e && (e.code || e.message)) || "unknown"));
    if (manual) App.toast(lastErr);
  } finally {
    busy = false; pill(); refreshPanels();
    if (again) { again = false; schedule(1500); }
  }
}
async function pull() {
  const m = syncMeta(), uid = user.uid;
  const first = m.uid !== uid;
  // First sync for this account on this phone: compare everything by date instead of "local wins".
  if (first && m.pendingUid !== uid) { m.pendingUid = uid; m.h = {}; m.pulled = {}; m.remKey = ""; S().meta.stateUpdatedAt = 0; }
  m.pulled = m.pulled || {};
  let changed = false;
  for (const coll of COLLS) {
    const ref = F.collection(db, "users", uid, coll);
    const since = m.pulled[coll];
    const q = since ? F.query(ref, F.where("srv", ">", F.Timestamp.fromMillis(Math.max(0, since - 5000)))) : ref;
    const snap = await F.getDocs(q);
    let max = since || 0;
    snap.forEach(d => {
      const data = d.data(); const srv = data.srv && data.srv.toMillis ? data.srv.toMillis() : 0;
      if (srv > max) max = srv;
      delete data.srv;
      if (App.applyRemote(coll, d.id, data, first)) changed = true;
    });
    m.pulled[coll] = max;
  }
  if (first) { m.uid = uid; delete m.pendingUid; }
  App.persist();
  if (changed) { App.checkRecords(); App.persist(); App.render(); }
}
async function push() {
  const list = App.collectDirty().filter(x => safeId(x.id));
  if (!list.length) return;
  const uid = user.uid;
  for (let i = 0; i < list.length; i += 400) {
    const chunk = list.slice(i, i + 400);
    const b = F.writeBatch(db);
    for (const x of chunk) b.set(F.doc(db, "users", uid, x.coll, x.id), Object.assign({}, x.data, { srv: F.serverTimestamp() }));
    await b.commit();
    App.markSynced(chunk);
  }
}
/* One document holds the upcoming reminder list. The cloud function reads it every 5 minutes. */
async function pushReminders() {
  const m = syncMeta();
  const items = App.computeReminders();
  if (m.test && m.test.sendAt > Date.now() - 15 * 60e3) items.push(m.test); else delete m.test;
  items.sort((a, b) => a.sendAt - b.sendAt);
  const key = items.map(x => x.id).join("|");
  if (key === m.remKey) return;
  const next = items.length ? items[0].sendAt : 9e15;
  await F.setDoc(F.doc(db, "users", user.uid, "push", "schedule"),
    { items, next, tz: Intl.DateTimeFormat().resolvedOptions().timeZone || "", updatedAt: Date.now() }, { merge: true });
  m.remKey = key; App.persist();
}

/* ---------- push notifications ---------- */
function b64ToBytes(b64) { const pad = "=".repeat((4 - b64.length % 4) % 4); const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/")); const out = new Uint8Array(raw.length); for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i); return out; }
async function saveDevice(sub) {
  await F.setDoc(F.doc(db, "users", user.uid, "devices", deviceId()), {
    sub: JSON.parse(JSON.stringify(sub)), ua: navigator.userAgent.slice(0, 160), updatedAt: Date.now(), srv: F.serverTimestamp()
  });
}
async function checkPush() {
  if (!pushAPI || !user || !VAPID || Notification.permission !== "granted") { pushState = "off"; return; }
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    pushState = sub ? "on" : "off";
    // If iOS gave us a new address since last time, save it so pushes keep arriving.
    if (sub && S().settings.notif.enabled) { let last = ""; try { last = localStorage.getItem("bluetide-push-ep") || ""; } catch (e) {}
      if (last !== sub.endpoint) { await saveDevice(sub); try { localStorage.setItem("bluetide-push-ep", sub.endpoint); } catch (e) {} } }
  } catch (e) { pushState = "off"; }
}
async function enablePush() {
  // iOS requires this to start right from the tap, so ask permission first.
  let perm;
  try { perm = await Notification.requestPermission(); } catch (e) { perm = "default"; }
  if (perm !== "granted") { App.toast(perm === "denied" ? "Notifications are blocked in iPhone Settings." : "Notifications weren't allowed."); refreshPanels(); return; }
  try {
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(VAPID) });
    await saveDevice(sub);
    try { localStorage.setItem("bluetide-push-ep", sub.endpoint); } catch (e) {}
    S().settings.notif.enabled = true; pushState = "on";
    App.save(); App.toast("Notifications are on");
    syncNow(false);
  } catch (e) {
    console.warn(e); App.toast("Couldn't turn on notifications: " + (e.message || e));
  }
  refreshPanels();
}
async function disablePush() {
  try {
    const reg = await navigator.serviceWorker.ready; const sub = await reg.pushManager.getSubscription();
    if (sub) await sub.unsubscribe();
    await F.deleteDoc(F.doc(db, "users", user.uid, "devices", deviceId()));
  } catch (e) {}
  S().settings.notif.enabled = false; pushState = "off"; App.save(); App.toast("Notifications are off"); syncNow(false); refreshPanels();
}
async function testPush() {
  try { const reg = await navigator.serviceWorker.ready; await reg.showNotification("Notifications work on this phone", { body: "Your reminders will look like this.", icon: "icon-192.png", tag: "test-local" }); } catch (e) {}
  const now = Date.now();
  syncMeta().test = { id: "test-" + now, type: "test", sendAt: now, title: "Test from the cloud", body: "Your reminder system is working. Go knock!", url: "./#today", check: null };
  App.persist(); await syncNow(false);
  App.toast("Sent. A second test arrives from the cloud within 5 minutes.");
}

/* ---------- boot ---------- */
window.Cloud = { panelHTML, notifHTML, wirePanels, signedIn: () => !!user, syncNow: () => syncNow(true) };
async function boot() {
  if (!CFG || !CFG.apiKey) { pill(); return; }
  try {
    const [appMod, authMod, fsMod] = await Promise.all([
      import("./vendor/firebase/firebase-app.js"),
      import("./vendor/firebase/firebase-auth.js"),
      import("./vendor/firebase/firebase-firestore-lite.js")
    ]);
    F = Object.assign({}, appMod, authMod, fsMod);
    const app = F.initializeApp(CFG);
    // Plain email/password with on-device persistence: no pop-ups, works inside the Home Screen app.
    auth = F.initializeAuth(app, { persistence: [F.indexedDBLocalPersistence, F.browserLocalPersistence] });
    db = F.getFirestore(app);
    F.onAuthStateChanged(auth, async u => {
      user = u; ready = true; lastErr = "";
      if (u) { await checkPush(); syncNow(false); }
      refreshPanels();
    });
  } catch (e) {
    console.warn("cloud failed to load", e); ready = true; lastErr = "Cloud couldn't load. The app still works on this phone.";
  }
  App.onChange(() => { if (user) schedule(4000); });
  setInterval(() => { if (user && !document.hidden) syncNow(false); }, 120000);
  document.addEventListener("visibilitychange", () => { if (!document.hidden && user) syncNow(false); });
  window.addEventListener("online", () => { pill(); if (user) syncNow(false); });
  window.addEventListener("offline", pill);
}
boot();
