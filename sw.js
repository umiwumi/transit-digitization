const CACHE_NAME = 'yuzawa-transit-v3.1.8';

const STATIC_ASSETS = [
  './',
  './index.html',
  'https://cdn.jsdelivr.net/npm/papaparse@5.4.1/papaparse.min.js',
  './Winter_Transit_Stops.csv',
  './Winter_Transit_Schedule.csv',
  './Public_Transit_Stops.csv',
  './Public_Transit_Schedule.csv'
];

// Pre-cache all essential root files during installation
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    }).then(() => self.skipWaiting())
  );
});

// Clean up stale caches when version updates
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

// Network-First for Root Assets & CDN, with Offline Cache Fallback
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // Do NOT intercept live Google Sheets requests in the Service Worker.
  // Let index.html try Tier 1 & Tier 2 directly; if they fail or user is offline,
  // fetchWithFallback() automatically requests Tier 3 (the root CSVs cached here).
  if (url.hostname.includes('google.com') || url.hostname.includes('googleusercontent.com')) {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const responseClone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone);
          });
        }
        return networkResponse;
      })
      .catch(async () => {
        // 1. Try exact match in cache
        const exactMatch = await caches.match(event.request);
        if (exactMatch) return exactMatch;

        // 2. Ignore query strings (e.g. ?lang=jp, ?mode=winter) for local repo files
        if (url.origin === self.location.origin) {
          const cleanMatch = await caches.match(event.request, { ignoreSearch: true });
          if (cleanMatch) return cleanMatch;

          if (event.request.mode === 'navigate') {
            const indexFallback = await caches.match('./index.html');
            if (indexFallback) return indexFallback;
          }
        }

        return Response.error();
      })
  );
});
