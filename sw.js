// Service Worker — Alerta Vagas
const CACHE_NAME = "alertavaga-v2";
const ASSETS = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png"
];

// Instalação: pré-cacheia os arquivos do app shell.
// Como falha em qualquer arquivo ausente, garantimos que TODOS existem.
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

// Ativação: limpa caches antigos e assume o controle imediatamente.
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Estratégia:
//  - Navegação (HTML): network-first, caindo no cache (offline).
//  - Firebase / mapas / fontes: só rede (não cacheamos APIs dinâmicas).
//  - Demais arquivos próprios (css/js/ícones): cache-first.
self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  // Não intercepta Firebase nem tiles de mapa (deixamos a rede decidir).
  const isFirebase = url.hostname.includes("firebaseio.com") ||
                     url.hostname.includes("googleapis.com") ||
                     url.hostname.includes("gstatic.com");
  const isMapTile = url.hostname.includes("cartocdn.com") ||
                    url.hostname.includes("tile.openstreetmap.org");
  if (isFirebase || isMapTile) {
    event.respondWith(fetch(req).catch(() => caches.match(req)));
    return;
  }

  // Navegação (HTML): network-first.
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req).catch(() => caches.match("./index.html"))
    );
    return;
  }

  // Demais recursos (próprios): cache-first.
  event.respondWith(
    caches.match(req).then((cached) => cached || fetch(req).then((res) => {
      const copy = res.clone();
      caches.open(CACHE_NAME).then((cache) => cache.put(req, copy)).catch(() => {});
      return res;
    }).catch(() => cached))
  );
});
