const CACHE_NAME = 'yuzawa-transit-v3.1.9';

const STATIC_ASSETS = [
  './',
  './index.html',
  'https://cdn.jsdelivr.net/npm/papaparse@5.4.1/papaparse.min.js',
  './Winter_Transit_Stops.csv',
  './Winter_Transit_Schedule.csv',
  './Public_Transit_Stops.csv',
  './Public_Transit_Schedule.csv'
];

// How long to wait for the network before falling back to the cached copy.
const NETWORK_TIMEOUT_MS = 6000;

// Pre-cache essential files. Each file is cached on its own, so one missing
// file (e.g. a CSV that 404s) no longer makes the whole install fail.
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      Promise.allSettled(
        STATIC_ASSETS.map((asset) =>
          cache.add(new Request(asset, { cache: 'reload' }))
        )
      )
    ).then(() => self.skipWaiting())
  );
});

// Clean up stale caches when version updates
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
    ).then(() => self.clients.claim())
  );
});

// Network-first with timeout, cache fallback when offline or slow
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // Live Google Sheets requests are handled by index.html itself
  // (Tier 1/2, then Tier 3 = the root CSVs cached here).
  if (url.hostname.includes('google.com') || url.hostname.includes('googleusercontent.com')) {
    return;
  }

  // For our own files, bypass the browser HTTP cache (GitHub Pages sends max-age=600)
  // so a data update is not hidden for 10 minutes.
  const sameOrigin = url.origin === self.location.origin;
  const networkRequest = sameOrigin && event.request.mode !== 'navigate'
    ? new Request(event.request, { cache: 'no-cache' })
    : event.request;

  const fromNetwork = fetch(networkRequest).then((response) => {
    if (response && response.status === 200) {
      const copy = response.clone();
      event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy)));
    }
    return response;
  });

  const timeout = new Promise((_, reject) =>
    setTimeout(() => reject(new Error('timeout')), NETWORK_TIMEOUT_MS)
  );

  event.respondWith(
    Promise.race([fromNetwork, timeout]).catch(async () => {
      const exactMatch = await caches.match(event.request);
      if (exactMatch) return exactMatch;

      if (sameOrigin) {
        const cleanMatch = await caches.match(event.request, { ignoreSearch: true });
        if (cleanMatch) return cleanMatch;

        if (event.request.mode === 'navigate') {
          const indexFallback = await caches.match('./index.html');
          if (indexFallback) return indexFallback;
        }
      }
      // Slow network and nothing cached: let the real request finish if it can
      return fromNetwork.catch(() => Response.error());
    })
  );
});
