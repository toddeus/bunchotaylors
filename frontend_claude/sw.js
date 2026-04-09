// ─── BUMP THIS ON EVERY S3 DEPLOY ────────────────────────────────────────────
const CACHE_VERSION = 'v1.0.0';
// ─────────────────────────────────────────────────────────────────────────────

const CACHE_NAME = `bot-${CACHE_VERSION}`;

// Core app-shell files to pre-cache (paths relative to sw.js location)
const APP_SHELL = [
  'index.html',
  'manifest.json',
  'app-icon.png',
  'banner.png',
  'js/config.js',
  'js/auth.js',
  'js/gallery.js',
];

// Install: pre-cache the app shell
self.addEventListener('install', event => {
  self.skipWaiting(); // activate immediately, don't wait for old tabs to close
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL))
  );
});

// Activate: delete any old caches from previous versions
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim()) // take control of open tabs immediately
  );
});

// Fetch strategy:
//   HTML pages  → network-first (ensures fresh content on reload)
//   Everything else → cache-first (fast, falls back to network)
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Only handle same-origin requests
  if (url.origin !== self.location.origin) return;

  if (request.destination === 'document') {
    // Network-first for HTML
    event.respondWith(
      fetch(request)
        .then(response => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
          return response;
        })
        .catch(() => caches.match(request))
    );
  } else {
    // Cache-first for everything else
    event.respondWith(
      caches.match(request).then(cached => {
        if (cached) return cached;
        return fetch(request).then(response => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
          return response;
        });
      })
    );
  }
});
