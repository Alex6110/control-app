// Service worker: fa funzionare l'app anche offline.
// Cambia VERSION quando pubblichi una nuova versione per forzare l'aggiornamento.
const VERSION = "v5";
const SHELL = "scadenziario-shell-" + VERSION;
const RUNTIME = "scadenziario-runtime-" + VERSION;
const FILES = [
  "./",
  "index.html",
  "styles.css",
  "app.js",
  "config.js",
  "icons.js",
  "schede.js",
  "manifest.webmanifest",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/apple-touch-icon.png"
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => ![SHELL, RUNTIME].includes(k)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // Le chiamate a Supabase non si cacheano mai (l'app tiene da sé una copia dei dati).
  if (url.hostname.endsWith("supabase.co")) return;

  // File dell'app: prima la rete (così gli aggiornamenti arrivano subito), poi la cache.
  if (url.origin === location.origin) {
    e.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(SHELL).then((c) => c.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req).then((r) => r || caches.match("index.html")))
    );
    return;
  }

  // Librerie da CDN (supabase-js): cache, poi aggiornamento in background.
  e.respondWith(
    caches.open(RUNTIME).then((cache) =>
      cache.match(req).then((hit) => {
        const net = fetch(req)
          .then((res) => { if (res.ok) cache.put(req, res.clone()); return res; })
          .catch(() => hit);
        return hit || net;
      })
    )
  );
});
