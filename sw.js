const CACHE_NAME = 'family-travel-v52';
const ASSETS = [
  './',
  './index.html?v=52',
  './app.css?v=52',
  './app.js?v=52',
  './manifest.json',
  './app-icon.jpg',
  './icon-itinerary.jpg',
  './icon-lodging.jpg',
  './icon-expenses.jpg',
  './icon-chat.jpg',
  './icon-family.jpg',
  './wood-texture.jpg'
];

// Install Service Worker
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('[Service Worker] Caching App Shell Assets');
        return cache.addAll(ASSETS);
      })
      .then(() => self.skipWaiting())
  );
});

// Activate Service Worker
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.map(key => {
          if (key !== CACHE_NAME) {
            console.log('[Service Worker] Removing old cache:', key);
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch Assets (Cache First / Network Fallback)
self.addEventListener('fetch', event => {
  // Only handle GET requests and local scope
  if (event.request.method !== 'GET' || !event.request.url.startsWith(self.location.origin)) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then(cachedResponse => {
      if (cachedResponse) {
        // Fetch in background to update cache (stale-while-revalidate)
        fetch(event.request).then(networkResponse => {
          if (networkResponse.status === 200) {
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, networkResponse));
          }
        }).catch(err => console.log('[Service Worker] Offline background fetch failed:', err));
        
        return cachedResponse;
      }
      
      return fetch(event.request).catch(() => {
        // Return index.html for navigation requests if offline
        if (event.request.mode === 'navigate') {
          return caches.match('./index.html');
        }
      });
    })
  );
});
