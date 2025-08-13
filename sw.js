const CACHE_NAME = 'generator-pormp-v1';
const URLS_TO_CACHE = [
    '/',
    'index.html',
    'index.css',
    'index.tsx',
];

// Instalacja service workera i zapisanie kluczowych zasobów w pamięci podręcznej
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log('Opened cache');
                return cache.addAll(URLS_TO_CACHE);
            })
    );
    self.skipWaiting();
});

// Czyszczenie starych pamięci podręcznych
self.addEventListener('activate', event => {
    const cacheWhitelist = [CACHE_NAME];
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cacheName => {
                    if (cacheWhitelist.indexOf(cacheName) === -1) {
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
    return self.clients.claim();
});

// Serwowanie zawartości z pamięci podręcznej w trybie offline
self.addEventListener('fetch', event => {
    event.respondWith(
        caches.match(event.request)
            .then(response => {
                // Trafienie w cache - zwróć odpowiedź z cache
                if (response) {
                    return response;
                }
                // Brak w cache - pobierz z sieci
                return fetch(event.request);
            })
    );
});