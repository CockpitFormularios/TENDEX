// sw-visitante.js - Service Worker otimizado para Android e iOS
const CACHE_NAME = 'tendex-visitante-v3';
const DYNAMIC_CACHE = 'tendex-dynamic-v1';

// URLs para cachear na instalação
const STATIC_ASSETS = [
  '/TENDEX/visitante.html',
  '/TENDEX/',
  '/TENDEX/index.html'
];

// Extensões de arquivos que devem ser cacheadas
const CACHEABLE_EXTENSIONS = ['.html', '.js', '.css', '.json', '.ico', '.png', '.jpg', '.jpeg', '.svg', '.webp'];

// Verificar se a URL é cacheável (exceto PDFs que vão para IndexedDB)
function isCacheableUrl(url) {
  if (url.includes('.pdf')) return false;
  if (url.includes('supabase.co') && !url.includes('storage')) return false;
  if (url.includes('google-analytics') || url.includes('gtag') || url.includes('googletagmanager')) return false;
  
  const hasCacheableExt = CACHEABLE_EXTENSIONS.some(ext => url.includes(ext));
  
  return hasCacheableExt || 
         url.includes('visitante.html') ||
         url === '/' ||
         url.includes('/TENDEX/');
}

// Instalação do Service Worker
self.addEventListener('install', event => {
  console.log('[SW] Instalando Service Worker versão:', CACHE_NAME);
  
  event.waitUntil(
    caches.open(CACHE_NAME).then(async cache => {
      console.log('[SW] Cacheando arquivos estáticos');
      
      const cachePromises = STATIC_ASSETS.map(async url => {
        try {
          await cache.add(url);
          console.log('[SW] Cacheado com sucesso:', url);
        } catch (error) {
          console.warn('[SW] Erro ao cachear:', url, error);
        }
      });
      
      await Promise.allSettled(cachePromises);
      console.log('[SW] Cache de instalação concluído');
    }).catch(err => {
      console.error('[SW] Erro crítico na instalação:', err);
    })
  );
  
  self.skipWaiting();
});

// Ativação do Service Worker
self.addEventListener('activate', event => {
  console.log('[SW] Ativando Service Worker');
  
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME && cacheName !== DYNAMIC_CACHE && 
              (cacheName.startsWith('tendex-visitante') || cacheName.startsWith('tendex-dynamic'))) {
            console.log('[SW] Removendo cache antigo:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      console.log('[SW] Cache limpo, reivindicando controle dos clientes');
      return self.clients.claim();
    })
  );
});

// Interceptação de requisições
self.addEventListener('fetch', event => {
  const url = event.request.url;
  const request = event.request;
  
  if (request.method !== 'GET') return;
  if (url.includes('.pdf') || url.includes('/storage/v1/object/')) return;
  if (url.includes('google-analytics') || url.includes('gtag') || url.includes('googletagmanager')) return;
  
  event.respondWith(
    (async () => {
      try {
        const cachedResponse = await caches.match(request);
        
        if (cachedResponse) {
          console.log('[SW] Cache HIT:', url.replace(/^.*?:\/\//, '').substring(0, 50));
          
          if (navigator.onLine !== false) {
            fetch(request).then(networkResponse => {
              if (networkResponse && networkResponse.ok && isCacheableUrl(url)) {
                caches.open(CACHE_NAME).then(cache => {
                  cache.put(request, networkResponse);
                }).catch(() => {});
              }
            }).catch(() => {});
          }
          
          return cachedResponse;
        }
        
        console.log('[SW] Network fetch:', url.replace(/^.*?:\/\//, '').substring(0, 50));
        const networkResponse = await fetch(request);
        
        if (networkResponse && networkResponse.ok && isCacheableUrl(url)) {
          const cache = await caches.open(CACHE_NAME);
          cache.put(request, networkResponse.clone());
        }
        
        return networkResponse;
        
      } catch (error) {
        console.warn('[SW] Falha na requisição:', url.replace(/^.*?:\/\//, '').substring(0, 50), error);
        
        if (request.mode === 'navigate') {
          const fallbackResponse = await caches.match('/TENDEX/visitante.html');
          if (fallbackResponse) return fallbackResponse;
          
          const altFallback = await caches.match('/TENDEX/');
          if (altFallback) return altFallback;
        }
        
        if (request.destination === 'image') {
          const placeholder = await caches.match('/TENDEX/placeholder.svg');
          if (placeholder) return placeholder;
        }
        
        return new Response('Recurso indisponível offline - TENDEX', {
          status: 503,
          statusText: 'Service Unavailable',
          headers: new Headers({ 'Content-Type': 'text/plain; charset=utf-8' })
        });
      }
    })()
  );
});

// Sincronização em background
self.addEventListener('sync', event => {
  console.log('[SW] Sincronização em background:', event.tag);
  if (event.tag === 'sync-data') {
    event.waitUntil(syncData());
  }
});

async function syncData() {
  console.log('[SW] Sincronizando dados em background...');
  try {
    const cache = await caches.open(DYNAMIC_CACHE);
    const keys = await cache.keys();
    
    for (const request of keys) {
      try {
        const response = await fetch(request);
        if (response && response.ok) {
          await cache.put(request, response);
        }
      } catch (error) {
        console.error('[SW] Erro na sincronização:', error);
      }
    }
  } catch (error) {
    console.error('[SW] Erro geral na sincronização:', error);
  }
}

// Mensagens do cliente
self.addEventListener('message', event => {
  console.log('[SW] Mensagem recebida do cliente:', event.data);
  
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  
  if (event.data && event.data.type === 'CLEAR_CACHE') {
    event.waitUntil(clearCache());
  }
  
  if (event.data && event.data.type === 'GET_VERSION') {
    if (event.ports && event.ports[0]) {
      event.ports[0].postMessage({ version: CACHE_NAME });
    }
  }
});

async function clearCache() {
  console.log('[SW] Limpando cache por solicitação do cliente...');
  try {
    const cacheNames = await caches.keys();
    await Promise.all(
      cacheNames.map(cacheName => {
        if (cacheName !== CACHE_NAME) {
          return caches.delete(cacheName);
        }
      })
    );
    console.log('[SW] Cache limpo com sucesso');
    
    const clients = await self.clients.matchAll();
    clients.forEach(client => {
      client.postMessage({ type: 'CACHE_CLEARED', timestamp: Date.now() });
    });
  } catch (error) {
    console.error('[SW] Erro ao limpar cache:', error);
  }
}

// Push notifications
self.addEventListener('push', event => {
  console.log('[SW] Push notification recebida');
  
  if (!event.data) return;
  
  try {
    const data = event.data.json();
    
    const options = {
      body: data.body || 'Novas atualizações disponíveis no TENDEX',
      icon: '/TENDEX/icon-192.png',
      badge: '/TENDEX/badge.png',
      vibrate: [200, 100, 200],
      data: { url: data.url || '/TENDEX/' }
    };
    
    event.waitUntil(
      self.registration.showNotification(data.title || 'TENDEX', options)
    );
  } catch (error) {
    console.error('[SW] Erro ao processar push:', error);
  }
});

// Clique em notificação
self.addEventListener('notificationclick', event => {
  console.log('[SW] Clique em notificação');
  event.notification.close();
  
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(clientList => {
        const url = event.notification.data?.url || '/TENDEX/';
        
        for (const client of clientList) {
          if (client.url === url && 'focus' in client) {
            return client.focus();
          }
        }
        
        if (clients.openWindow) {
          return clients.openWindow(url);
        }
      })
  );
});
