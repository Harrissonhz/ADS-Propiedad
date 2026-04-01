const CACHE_NAME = 'ads-prop-cache-v1';
const urlsToCache = [
  'index.html',
  'proyectos.html',
  'evaluacion.html',
  'css/styles.css',
  'js/app.js',
  'js/nav.js',
  'js/theme.js',
  'js/config.js'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(urlsToCache))
  );
});

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => response || fetch(event.request))
  );
});
