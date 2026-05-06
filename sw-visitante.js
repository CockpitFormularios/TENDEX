// sw-visitante.js - Service Worker específico para o Modo Visitante
const CACHE_NAME = 'tendex-visitante-v1';
const urlsToCache = [
  '/TENDEX/visitante.html',
  '/TENDEX/'
];

// Instalação do Service Worker
self.addEventListener('install', event => {
  console.log('[SW Visitante] Instalando...');
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      console.log('[SW Visitante] Cacheando arquivos');
      return cache.addAll(urlsToCache);
    }).catch(err => {
      console.error('[SW Visitante] Erro ao cachear:', err);
    })
  );
  self.skipWaiting();
});

// Ativação e limpeza de caches antigos
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
    }).catch(err => {
      console.error('[SW Visitante] Erro ao limpar cache:', err);
    })
  );
  self.clients.claim();
});

// Interceptação de requisições
self.addEventListener('fetch', event => {
  // Ignorar requisições para o Supabase e Google
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
      
      console.log('[SW Visitante] Cache MISS:', event.request.url);
      return fetch(event.request).then(response => {
        // Não cachear respostas de erro
        if (!response || response.status !== 200) {
          return response;
        }
        
        // Cachear apenas HTML, CSS e JS
        const url = new URL(event.request.url);
        if (url.pathname.endsWith('.html') || 
            url.pathname.endsWith('.css') || 
            url.pathname.endsWith('.js')) {
          const responseToCache = response.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, responseToCache);
          });
        }
        return response;
      });
    }).catch(err => {
      console.error('[SW Visitante] Erro no fetch:', err);
      // Fallback para a página offline
      return caches.match('/TENDEX/visitante.html');
    })
  );
});