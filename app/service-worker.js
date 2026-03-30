const cacheName = 'mcbcode-cache-v1';

// install: cache everything we see
self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(cacheName).then(cache => cache.addAll(['/editor.html']))
  );
});

// fetch: respond with cache first, then network
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(resp => {
        return caches.open(cacheName).then(cache => {
          cache.put(event.request, resp.clone());
          return resp;
        });
      }).catch(() => new Response('Offline', { status: 503 }));
    })
  );
});
