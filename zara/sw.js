/* Zara · sw.js — offline cache layer
   - App shell: precached, served cache-first (fast + offline)
   - Navigations: network-first with cache fallback → index.html
   - Google Fonts: stale-while-revalidate (best effort, never blocks)
   - Gemini API: always network, never cached */
const VERSION = 'zara-v2.1.0';
const SHELL_CACHE = `${VERSION}-shell`;
const RUNTIME_CACHE = `${VERSION}-runtime`;
const SHELL = [
  './',
  './index.html',
  './style.css',
  './manifest.json',
  './js/icons.js',
  './js/store.js',
  './js/defaults.js',
  './js/utils.js',
  './js/intents.js',
  './js/ai.js',
  './js/ui.js',
  './js/app.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-512-maskable.png',
  './icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then((cache) => Promise.all(SHELL.map((url) => cache.add(url).catch((e) => console.warn('[SW] skip', url, e.message)))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('zara-') && ![SHELL_CACHE, RUNTIME_CACHE].includes(k)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Never touch the AI API or non-http schemes
  if (url.hostname === 'generativelanguage.googleapis.com' || !url.protocol.startsWith('http')) return;

  // Navigation requests → network first, fall back to cached shell
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).then((res) => { const copy = res.clone(); caches.open(SHELL_CACHE).then((c) => c.put('./index.html', copy)); return res; })
        .catch(() => caches.match('./index.html'))
    );
    return;
  }

  // Same-origin assets → cache first, then network (and refresh cache)
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(req).then((cached) => {
        const network = fetch(req).then((res) => {
          if (res && res.ok) caches.open(SHELL_CACHE).then((c) => c.put(req, res.clone()));
          return res;
        }).catch(() => cached);
        return cached || network;
      })
    );
    return;
  }

  // Google Fonts / other cross-origin → stale-while-revalidate (opaque ok)
  if (/fonts\.(googleapis|gstatic)\.com$/.test(url.hostname)) {
    event.respondWith(
      caches.open(RUNTIME_CACHE).then(async (cache) => {
        const cached = await cache.match(req);
        const network = fetch(req).then((res) => { if (res) cache.put(req, res.clone()); return res; }).catch(() => cached);
        return cached || network;
      })
    );
  }
});
