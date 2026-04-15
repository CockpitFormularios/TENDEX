// sw.js - Service Worker OTIMIZADO para OFFLINE
const CACHE_NAME = 'tendex-v1';
const MODELOS_CACHE = 'tendex-modelos';
const OFFLINE_PAGE = '/TENDEX/offline.html';

// Arquivos para cachear na instalação
const urlsToCache = [
  '/TENDEX/',
  '/TENDEX/dashboard.html',
  '/TENDEX/index.html',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2',
  'https://unpkg.com/pdf-lib@1.17.1/dist/pdf-lib.min.js'
];

// Ignorar requisições externas problemáticas
const EXCLUDED_URLS = [
  'supabase.co',
  'google.com',
  'googleapis.com',
  'gstatic.com'
];

function isExcluded(url) {
  return EXCLUDED_URLS.some(excluded => url.includes(excluded));
}

// INSTALAÇÃO
self.addEventListener('install', event => {
  console.log('[SW] Instalando...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('[SW] Cacheando arquivos essenciais...');
        return cache.addAll(urlsToCache);
      })
      .then(() => self.skipWaiting())
      .catch(err => console.error('[SW] Erro no cache:', err))
  );
});

// ATIVAÇÃO
self.addEventListener('activate', event => {
  console.log('[SW] Ativando...');
  event.waitUntil(
    Promise.all([
      caches.keys().then(cacheNames => {
        return Promise.all(
          cacheNames.map(cache => {
            if (cache !== CACHE_NAME && cache !== MODELOS_CACHE) {
              console.log('[SW] Removendo cache antigo:', cache);
              return caches.delete(cache);
            }
          })
        );
      }),
      self.clients.claim() // Toma controle imediatamente
    ])
  );
});

// INTERCEPTAÇÃO DE REQUISIÇÕES
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  
  // Ignorar requisições excluídas
  if (isExcluded(url.href)) {
    return;
  }
  
  // Ignorar métodos que não são GET
  if (event.request.method !== 'GET') {
    return;
  }
  
  event.respondWith(
    caches.match(event.request)
      .then(cachedResponse => {
        // Se tem cache, retorna do cache
        if (cachedResponse) {
          console.log('[SW] Cache HIT:', url.pathname);
          return cachedResponse;
        }
        
        // Se não tem cache, tenta buscar da rede
        console.log('[SW] Cache MISS:', url.pathname);
        return fetch(event.request)
          .then(networkResponse => {
            // Cachear apenas respostas bem-sucedidas do mesmo domínio
            if (networkResponse && networkResponse.status === 200 && 
                url.origin === self.location.origin) {
              const responseClone = networkResponse.clone();
              caches.open(CACHE_NAME)
                .then(cache => cache.put(event.request, responseClone));
            }
            return networkResponse;
          })
          .catch(error => {
            console.error('[SW] Fetch falhou:', url.pathname, error);
            
            // Retorna página offline para navegação HTML
            if (event.request.headers.get('accept')?.includes('text/html')) {
              return caches.match(OFFLINE_PAGE)
                .then(offlineResponse => {
                  if (offlineResponse) return offlineResponse;
                  return new Response(`
                    <!DOCTYPE html>
                    <html>
                    <head><title>Offline</title><meta charset="UTF-8"></head>
                    <body style="text-align:center;padding:50px;font-family:sans-serif;">
                      <h1>🔌 Modo Offline</h1>
                      <p>Você está sem conexão com a internet.</p>
                      <p>Os dados serão sincronizados quando a conexão for restabelecida.</p>
                      <button onclick="location.reload()">Tentar novamente</button>
                    </body>
                    </html>
                  `, { headers: { 'Content-Type': 'text/html' } });
                });
            }
            
            return new Response('Recurso não disponível offline', { status: 503 });
          });
      })
  );
});

// MENSAGENS
self.addEventListener('message', event => {
  if (event.data === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
