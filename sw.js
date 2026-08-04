const CACHE_NAME = 'royalstream-v1';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/style.css',
  '/app.js',
  '/royalst.png',
  '/royalstream.png'
];

// Install Event - Cache local App Shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
  self.skipWaiting();
});

// Activate Event - Clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Fetch Event - Network first for streaming media, static cache for app assets
self.addEventListener('fetch', (event) => {
  // Pass dynamic API and audio streaming network requests straight through
  if (
    event.request.url.includes('api.jamendo.com') ||
    event.request.url.includes('audius.co') ||
    event.request.url.includes('lrclib.net')
  ) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((response) => {
      return response || fetch(event.request);
    })
  );
});