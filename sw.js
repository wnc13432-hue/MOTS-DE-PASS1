/* الخزنة — Service Worker
   استراتيجية: stale-while-revalidate للـ app shell، network-first للبقية مع fallback للكاش.
*/

const CACHE = 'vault-v1';
const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-192.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
  './icons/favicon-32.png'
];

// install: precache app shell, then activate immediately
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
      .catch((err) => console.warn('[SW] precache failed', err))
  );
});

// activate: clean old caches, claim clients
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// fetch handler
self.addEventListener('fetch', (e) => {
  const req = e.request;

  // ignore non-GET (e.g. POST) and chrome-extension:// and blob:
  if (req.method !== 'GET' || !req.url.startsWith('http')) return;

  const url = new URL(req.url);

  // never cache cross-origin
  if (url.origin !== self.location.origin) {
    e.respondWith(fetch(req));
    return;
  }

  // For navigation requests: network-first, fall back to cached index.html (offline support)
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req).catch(() => caches.match('./index.html').then(r => r || caches.match('./')))
    );
    return;
  }

  // For static assets: stale-while-revalidate
  e.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req).then((res) => {
        // only cache successful, same-origin, basic responses
        if (res && res.status === 200 && res.type === 'basic') {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      }).catch(() => cached); // offline: return cached if available
      return cached || network;
    })
  );
});

// allow page to trigger skipWaiting via postMessage
self.addEventListener('message', (e) => {
  if (e.data === 'SKIP_WAITING') self.skipWaiting();
});
