const CACHE_NAME = 'callcenter-v1';

// ინსტალაციის ეტაპი (შეგვიძლია ფაილები დავქეშოთ, რომ სწრაფად გაიხსნას)
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll([
                '/',
                '/index.html',
                '/style.css',
                '/main.js'
            ]);
        })
    );
});

// ქსელის მოთხოვნების მართვა
self.addEventListener('fetch', (event) => {
    event.respondWith(
        fetch(event.request).catch(() => {
            return caches.match(event.request);
        })
    );
});