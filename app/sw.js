const cacheName = 'mcbcode-cache-v1';

self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(cacheName).then(cache => cache.addAll(['/editor.html']))
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(resp => {
        caches.open(cacheName).then(cache => cache.put(event.request, resp.clone()));
        return resp;
      }).catch(() => new Response('Offline', { status: 503 }));
    })
  );
});
