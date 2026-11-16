/* Blue Tide service worker: offline app shell + push notifications.
   Bump VERSION on every update. Phones download the new files in the background,
   then the app shows "New version ready, Reload" instead of reloading on its own. */
const VERSION = "bluetide-v6.0.3";
const SHELL = [
  "./", "./index.html", "./styles.css", "./app.js", "./cloud.js", "./firebase-config.js", "./manifest.json",
  "./icon-180.png", "./icon-192.png", "./icon-512.png"
];
const LAZY = [
  "./vendor/firebase/firebase-app.js", "./vendor/firebase/firebase-auth.js", "./vendor/firebase/firebase-firestore-lite.js",
  "./vendor/leaflet/leaflet.js", "./vendor/leaflet/leaflet.css",
  "./vendor/leaflet/images/marker-icon.png", "./vendor/leaflet/images/marker-icon-2x.png", "./vendor/leaflet/images/marker-shadow.png",
  "./vendor/leaflet/images/layers.png", "./vendor/leaflet/images/layers-2x.png"
];
const fresh = u => new Request(u, { cache: "reload" });

self.addEventListener("install", e => {
  e.waitUntil(caches.open(VERSION).then(async c => {
    await c.addAll(SHELL.map(fresh));
    // Extras are best-effort, so one missing file can't break offline mode.
    await Promise.all(LAZY.map(u => c.add(fresh(u)).catch(() => {})));
  }).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return; // map tiles, Firebase, etc. go straight to the network
  // Cloud settings file: try the network first, so pasting in your Firebase keys works without a new version.
  if (url.pathname.endsWith("/firebase-config.js")) {
    // Weak signal: after 2.5 seconds use the saved copy (the download still finishes for next time).
    const cached = () => caches.match("./firebase-config.js");
    const net = fetch(req, { cache: "no-cache" }).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(VERSION).then(c => c.put("./firebase-config.js", copy)); }
      return res;
    });
    const slow = new Promise(r => setTimeout(r, 2500)).then(cached).then(hit => hit || net);
    e.respondWith(Promise.race([net.catch(cached), slow]).then(r => r || net));
    return;
  }
  e.respondWith(
    caches.match(req, { ignoreSearch: true }).then(hit => hit || fetch(req).then(res => {
      if (res.ok && res.type === "basic") { const copy = res.clone(); caches.open(VERSION).then(c => c.put(req, copy)); }
      return res;
    }).catch(() => req.mode === "navigate" ? caches.match("./index.html") : Response.error()))
  );
});

/* ---------- push ---------- */
self.addEventListener("push", e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (err) { d = { title: "Blue Tide", body: e.data ? e.data.text() : "" }; }
  const title = d.title || "Blue Tide";
  const opts = {
    body: d.body || "", icon: "icon-192.png", badge: "icon-192.png",
    tag: d.tag || d.type || undefined, data: { url: d.url || "./" }
  };
  e.waitUntil(Promise.all([
    self.registration.showNotification(title, opts),
    (self.navigator && self.navigator.setAppBadge && typeof d.badge === "number") ? self.navigator.setAppBadge(d.badge).catch(() => {}) : Promise.resolve()
  ]));
});

self.addEventListener("notificationclick", e => {
  e.notification.close();
  const target = new URL((e.notification.data && e.notification.data.url) || "./", self.registration.scope);
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(list => {
    for (const c of list) {
      if (c.url.startsWith(self.registration.scope)) {
        c.postMessage({ type: "nav", hash: target.hash.replace("#", "") });
        return c.focus();
      }
    }
    return self.clients.openWindow(target.href);
  }));
});
