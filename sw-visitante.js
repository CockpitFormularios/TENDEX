// sw-visitante.js - Service Worker otimizado para iOS e Android
const CACHE_NAME = 'tendex-visitante-v3';
const DYNAMIC_CACHE = 'tendex-dynamic-v1';

// URLs para cachear na instalação (apenas o essencial)
const STATIC_ASSETS = [
  '/TENDEX/visitante.html',
  '/TENDEX/'
];

// Extensões de arquivos que devem ser cacheadas
const CACHEABLE_EXTENSIONS = ['.html', '.js', '.css', '.json', '.ico', '.png', '.jpg', '.jpeg', '.svg'];

// Verificar se a URL é cacheável
function isCacheableUrl(url) {
  // Não cachear PDFs (serão gerenciados pelo IndexedDB)
  if (url.includes('.pdf')) return false;
  
  // Verificar extensões cacheáveis
  const hasCacheableExt = CACHEABLE_EXTENSIONS.some(ext => url.includes(ext));
  
  // Não cachear APIs do Supabase
  if (url.includes('supabase.co') && !url.includes('storage')) return false;
  
  // Cachear apenas arquivos estáticos e a página principal
  return hasCacheableExt || 
         url.includes('visitante.html') ||
         url === '/' ||
         url.includes('/TENDEX/');
}

self.addEventListener('install', event => {
  console.log('[SW] Instalando Service Worker versão:', CACHE_NAME);
  
  event.waitUntil(
    caches.open(CACHE_NAME).then(async cache => {
      console.log('[SW] Cacheando arquivos estáticos');
      
      // Cachear cada URL individualmente para evitar falhas
      const cachePromises = STATIC_ASSETS.map(async url => {
        try {
          const response = await fetch(url);
          if (response.ok) {
            await cache.put(url, response);
            console.log('[SW] Cacheado com sucesso:', url);
          }
        } catch (error) {
          console.warn('[SW] Erro ao cachear:', url, error);
        }
      });
      
      await Promise.allSettled(cachePromises);
      console.log('[SW] Cache de instalação concluído');
    }).catch(err => {
      console.error('[SW] Erro na instalação:', err);
    })
  );
  
  // Forçar ativação imediata
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  console.log('[SW] Ativando Service Worker');
  
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          // Remover caches antigos
          if (cacheName !== CACHE_NAME && cacheName !== DYNAMIC_CACHE && 
              (cacheName.includes('tendex-visitante') || cacheName.includes('tendex-dynamic'))) {
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

self.addEventListener('fetch', event => {
  const url = event.request.url;
  const request = event.request;
  
  // Ignorar requisições que não devem ser interceptadas pelo Service Worker
  if (request.method !== 'GET') return;
  
  // Ignorar PDFs (serão tratados pelo IndexedDB no app principal)
  if (url.includes('.pdf') || url.includes('/storage/v1/object/')) {
    return;
  }
  
  // Ignorar analytics e métricas
  if (url.includes('google-analytics') || url.includes('gtag')) {
    return;
  }
  
  event.respondWith(
    (async () => {
      try {
        // Estratégia: Cache First, depois Network
        const cachedResponse = await caches.match(request);
        
        if (cachedResponse) {
          console.log('[SW] Cache HIT:', url);
          
          // Atualizar o cache em background (stale-while-revalidate)
          if (navigator.onLine) {
            fetch(request).then(networkResponse => {
              if (networkResponse && networkResponse.ok && isCacheableUrl(url)) {
                caches.open(CACHE_NAME).then(cache => {
                  cache.put(request, networkResponse);
                  console.log('[SW] Cache atualizado em background:', url);
                });
              }
            }).catch(() => {});
          }
          
          return cachedResponse;
        }
        
        // Se não estiver em cache, tentar rede
        console.log('[SW] Network fetch:', url);
        const networkResponse = await fetch(request);
        
        // Cachear respostas bem-sucedidas de recursos estáticos
        if (networkResponse && networkResponse.ok && isCacheableUrl(url)) {
          const cache = await caches.open(CACHE_NAME);
          cache.put(request, networkResponse.clone());
          console.log('[SW] Cacheado novo recurso:', url);
        }
        
        return networkResponse;
        
      } catch (error) {
        console.warn('[SW] Falha na requisição:', url, error);
        
        // Fallback: tentar retornar a página principal para navegação
        if (request.mode === 'navigate') {
          const fallbackResponse = await caches.match('/TENDEX/visitante.html');
          if (fallbackResponse) {
            console.log('[SW] Retornando fallback para navegação');
            return fallbackResponse;
          }
        }
        
        // Se for uma imagem, tentar retornar um placeholder
        if (request.destination === 'image') {
          // Tentar retornar uma imagem de placeholder, se existir
          const placeholder = await caches.match('/TENDEX/placeholder.png');
          if (placeholder) return placeholder;
        }
        
        return new Response('Recurso indisponível offline', {
          status: 503,
          statusText: 'Service Unavailable',
          headers: new Headers({
            'Content-Type': 'text/plain'
          })
        });
      }
    })()
  );
});

// Sincronização em background (opcional)
self.addEventListener('sync', event => {
  console.log('[SW] Sincronização em background:', event.tag);
  if (event.tag === 'sync-data') {
    event.waitUntil(syncData());
  }
});

async function syncData() {
  console.log('[SW] Sincronizando dados...');
  // Aqui você pode adicionar lógica de sincronização se necessário
  const cache = await caches.open(DYNAMIC_CACHE);
  const keys = await cache.keys();
  
  for (const request of keys) {
    try {
      const response = await fetch(request);
      if (response.ok) {
        await cache.put(request, response);
        console.log('[SW] Sincronizado:', request.url);
      }
    } catch (error) {
      console.error('[SW] Erro na sincronização:', error);
    }
  }
}

// Push notifications (opcional)
self.addEventListener('push', event => {
  console.log('[SW] Push notification recebida');
  const data = event.data ? event.data.json() : {};
  
  const options = {
    body: data.body || 'Novas atualizações disponíveis',
    icon: '/TENDEX/icon-192.png',
    badge: '/TENDEX/badge.png',
    vibrate: [200, 100, 200],
    data: {
      url: data.url || '/TENDEX/'
    }
  };
  
  event.waitUntil(
    self.registration.showNotification(data.title || 'TENDEX', options)
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(clientList => {
        const url = event.notification.data.url;
        
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

// Mensagens do cliente
self.addEventListener('message', event => {
  console.log('[SW] Mensagem recebida:', event.data);
  
  if (event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  
  if (event.data.type === 'CLEAR_CACHE') {
    event.waitUntil(clearCache());
  }
});

async function clearCache() {
  console.log('[SW] Limpando cache...');
  const cacheNames = await caches.keys();
  await Promise.all(
    cacheNames.map(cacheName => {
      if (cacheName !== CACHE_NAME) {
        return caches.delete(cacheName);
      }
    })
  );
  console.log('[SW] Cache limpo com sucesso');
}

// Verificar versão do cache
self.addEventListener('fetch', event => {
  // Adicionar header para indicar versão do cache
  const response = event.respondWith(
    (async () => {
      const response = await fetch(event.request);
      const clonedResponse = response.clone();
      const headers = new Headers(clonedResponse.headers);
      headers.set('X-Cache-Version', CACHE_NAME);
      
      return new Response(clonedResponse.body, {
        status: clonedResponse.status,
        statusText: clonedResponse.statusText,
        headers: headers
      });
    })()
  );
});
