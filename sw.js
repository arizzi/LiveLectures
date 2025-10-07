// Minimal service worker to satisfy registration during development
self.addEventListener('install', (event) => {
  // skip waiting to activate immediately during development
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  // claim clients immediately so the page can use the SW
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  // Simple network-first fetch. Do not block or cache aggressively.
  event.respondWith(fetch(event.request).catch(() => caches.match(event.request)));
});
