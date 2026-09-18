/* Service worker: кэширует приложение целиком, чтобы дневник открывался без сети.
   VERSION подставляется при публикации (см. build.mjs и workflow), поэтому каждый
   деплой получает новый кэш, а старый удаляется. */
const VERSION = '__BUILD__';
const CACHE = 'pullup-diary-' + VERSION;
const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './manifest.webmanifest',
  './icon.svg',
  './icon-maskable.svg'
];
const NETWORK_TIMEOUT_MS = 4000;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'skipWaiting') self.skipWaiting();
});

// Сначала сеть (с таймаутом), затем кэш. Онлайн всегда свежая версия, оффлайн — из кэша.
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  event.respondWith(
    new Promise((resolve) => {
      let settled = false;
      const useCache = () => caches.match(event.request, { ignoreSearch: true }).then((cached) => {
        if (cached) return cached;
        if (event.request.mode === 'navigate') return caches.match('./index.html');
        return Response.error();
      });
      const timer = setTimeout(() => { if (!settled) { settled = true; resolve(useCache()); } }, NETWORK_TIMEOUT_MS);
      fetch(event.request)
        .then((resp) => {
          if (resp && resp.ok) {
            const copy = resp.clone();
            caches.open(CACHE).then((cache) => cache.put(event.request, copy));
          }
          if (!settled) { settled = true; clearTimeout(timer); resolve(resp.ok ? resp : useCache().then((c) => c || resp)); }
        })
        .catch(() => { if (!settled) { settled = true; clearTimeout(timer); resolve(useCache()); } });
    })
  );
});
