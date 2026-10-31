// Bump CACHE on every update so phones pick up the new version.
const CACHE = "saltoff-doors-v4";
const CORE = ["./", "./index.html", "./manifest.json"];
const EXTRA = ["./icon-180.png", "./icon-192.png", "./icon-512.png"];
const fresh = u => new Request(u, { cache: "reload" });

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(async c => {
    await c.addAll(CORE.map(fresh));
    // Icons are best-effort so a missing icon can't break offline mode.
    await Promise.all(EXTRA.map(u => c.add(fresh(u)).catch(() => {})));
  }).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== location.origin) return;
  e.respondWith(
    caches.match(req, { ignoreSearch: true }).then(hit => hit || fetch(req).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
      return res;
    }).catch(() => req.mode === "navigate" ? caches.match("./index.html") : Response.error()))
  );
});
