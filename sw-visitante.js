// sw-visitante.js - Service Worker específico para o Modo Visitante
const CACHE_NAME = 'tendex-visitante-v1';
const urlsToCache = [
  '/TENDEX/visitante.html',
  '/TENDEX/'
];

self.addEventListener('install', event => {
  console.log('[SW Visitante] Instalando...');
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      console.log('[SW Visitante] Cacheando arquivos');
      return cache.addAll(urlsToCache);
    }).catch(err => console.error('[SW Visitante] Erro ao cachear:', err))
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  console.log('[SW Visitante] Ativando...');
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME && cacheName.startsWith('tendex-visitante')) {
            console.log('[SW Visitante] Removendo cache antigo:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  if (event.request.url.includes('supabase.co') || 
      event.request.url.includes('google.com') ||
      event.request.url.includes('cdn.jsdelivr.net') ||
      event.request.url.includes('qrcode')) {
    return;
  }
  
  event.respondWith(
    caches.match(event.request).then(response => {
      if (response) {
        console.log('[SW Visitante] Cache HIT:', event.request.url);
        return response;
      }
      return fetch(event.request);
    }).catch(() => {
      return caches.match('/TENDEX/visitante.html');
    })
  );
});
