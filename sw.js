// Service worker: permite instalar la app y abrirla rápido.
// Sólo guarda en caché la interfaz (HTML/JS/íconos) de este sitio.
// Los datos de pacientes (Supabase) NUNCA se guardan en caché.
const CACHE = "ahp-app-v1";
const BASE = [
  "./", "index.html", "config.js", "manifest.webmanifest",
  "js/core.js", "js/agenda.js", "js/pacientes.js", "js/admin.js", "js/importar.js",
  "vendor/supabase.js", "icon-192.png", "icon-512.png"
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(BASE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Primero la red (siempre la versión más nueva); si no hay conexión, la copia guardada.
self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) { const copia = res.clone(); caches.open(CACHE).then((c) => c.put(req, copia)); }
        return res;
      })
      .catch(() => caches.match(req, { ignoreSearch: true }).then((r) => r || caches.match("index.html")))
  );
});
