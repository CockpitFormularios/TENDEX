// sw.js - Service Worker para TENDEX
const CACHE_NAME = 'tendex-v1';
const urlsToCache = [
  '/TENDEX/',
  '/TENDEX/dashboard.html',
  '/TENDEX/index.html'
];

const EXCLUDED_URLS = [
  'supabase.co',
  'jklcvyuxwxgsfczrfaco.supabase.co'
];

function isExcluded(url) {
  return EXCLUDED_URLS.some(excluded => url.includes(excluded));
}

self.addEventListener('install', event => {
  console.log('Service Worker instalado');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(urlsToCache))
      .catch(err => console.error('Erro ao adicionar ao cache:', err))
  );
});

self.addEventListener('activate', event => {
  console.log('Service Worker ativado');
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cache => {
          if (cache !== CACHE_NAME) {
            console.log('Removendo cache antigo:', cache);
            return caches.delete(cache);
          }
        })
      );
    })
  );
});

self.addEventListener('fetch', event => {
  const url = event.request.url;
  if (isExcluded(url)) {
    return;
  }
  event.respondWith(
    caches.match(event.request)
      .then(response => response || fetch(event.request))
  );
});

self.addEventListener('sync', event => {
  console.log('Evento sync recebido:', event.tag);
  if (event.tag === 'sync-inspecoes') {
    event.waitUntil(sincronizarDados());
  }
});

async function sincronizarDados() {
  console.log('🔄 Sincronizando dados pendentes...');
  const clients = await self.clients.matchAll();
  clients.forEach(client => {
    client.postMessage({
      type: 'SYNC_TRIGGERED',
      message: 'Internet restaurada. Iniciando sincronização...'
    });
  });
  console.log('✅ Sincronização finalizada');
}
