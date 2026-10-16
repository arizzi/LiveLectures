const CACHE = 'livelectures-offline-v3';
const APP = [
    './', './index.html', './styles.css', './utils.js', './drawing.js', './toolbar.js',
    './latex.js', './svg.js', './transcription.js', './pdf-export.js', './app.js',
    './manifest.json', './icons/icon.svg', './icons/icon-192.png', './icons/icon-512.png',
    './features/workspace.mjs', './features/workspace.html', './features/workspace.css',
    './features/model.mjs', './features/storage.mjs', './features/drive.mjs',
    './vendor/pdf.min.js', './vendor/pdf.worker.min.js', './vendor/jspdf.umd.min.js',
    './vendor/tex-svg-full.js', './vendor/pickr.min.js', './vendor/pickr-classic.min.css',
    './vendor/fontawesome/css/all.min.css', './vendor/fontawesome/webfonts/fa-solid-900.woff2',
    './vendor/fontawesome/webfonts/fa-regular-400.woff2'
];
self.addEventListener('install', event => {
    event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(APP)));
    // Wait for all previous clients to close before activating a new app version.
});
self.addEventListener('activate', event => {
    event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('livelectures-offline-') && key !== CACHE)
        .map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
    const url = new URL(event.request.url);
    if (event.request.method !== 'GET' || url.origin !== self.location.origin) return;
    event.respondWith(caches.open(CACHE).then(async cache => {
        const cached = await cache.match(event.request);
        if (cached) return cached;
        try { return await fetch(event.request); }
        catch (error) {
            if (event.request.mode === 'navigate') return cache.match('./index.html');
            throw error;
        }
    }));
});
