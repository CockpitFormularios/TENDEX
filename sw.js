// sw.js - Service Worker para TENDEX
const CACHE_NAME = 'tendex-v1';
const urlsToCache = [
  '/TENDEX/',
  '/TENDEX/dashboard.html',
  '/TENDEX/index.html'
];

// URLs que NÃO devem ser interceptadas pelo Service Worker
const EXCLUDED_URLS = [
  'supabase.co',
  'jklcvyuxwxgsfczrfaco.supabase.co'
];

function isExcluded(url) {
  return EXCLUDED_URLS.some(excluded => url.includes(excluded));
}

// Instalação do Service Worker
self.addEventListener('install', event => {
  console.log('Service Worker instalado');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Cache aberto');
        return cache.addAll(urlsToCache);
      })
      .catch(err => console.error('Erro ao adicionar ao cache:', err))
  );
});

// Ativação - limpa caches antigos
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

// Busca - NÃO intercepta requisições para o Supabase
self.addEventListener('fetch', event => {
  const url = event.request.url;
  
  // Se for requisição para o Supabase, deixa passar direto
  if (isExcluded(url)) {
    return;
  }
  
  // Para outros recursos, usa cache first
  event.respondWith(
    caches.match(event.request)
      .then(response => response || fetch(event.request))
  );
});

// Background Sync
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
