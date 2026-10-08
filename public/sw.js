// Service worker: aplikacja otwiera się także bez internetu.
// Strategia "najpierw sieć" (zawsze świeży kod), a przy braku zasięgu — kopia.
const VERSION = 'zakupy-v3.0.0';
const SHELL = [
  '/', '/index.html', '/css/app.css', '/manifest.webmanifest',
  '/js/app.js', '/js/core.js', '/js/store.js', '/js/ui.js', '/js/ctx.js',
  '/js/views/home.js', '/js/views/list.js', '/js/views/templates.js', '/js/views/notes.js', '/js/views/more.js',
  '/icons/icon.svg', '/icons/icon-192.png', '/icons/apple-touch-icon.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function timeout(ms) { return new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms)); }

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin || url.pathname === '/ws' || url.pathname.startsWith('/api/')) return;
  e.respondWith((async () => {
    const cache = await caches.open(VERSION);
    try {
      const res = await Promise.race([fetch(req), timeout(req.mode === 'navigate' ? 4000 : 6000)]);
      if (res && res.ok) cache.put(req.mode === 'navigate' ? '/index.html' : req, res.clone());
      return res;
    } catch (err) {
      const hit = await cache.match(req.mode === 'navigate' ? '/index.html' : req, { ignoreSearch: true });
      if (hit) return hit;
      if (req.mode === 'navigate') { const shell = await cache.match('/'); if (shell) return shell; }
      throw err;
    }
  })());
});
