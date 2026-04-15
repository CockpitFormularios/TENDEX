// sw.js - Service Worker para TENDEX
const CACHE_NAME = 'tendex-v1';
const MODELOS_CACHE = 'tendex-modelos';

// URLs para cachear na instalação
const urlsToCache = [
  '/TENDEX/',
  '/TENDEX/dashboard.html',
  '/TENDEX/index.html'
];

// URLs/domínios que NÃO devem ser interceptados pelo Service Worker
const EXCLUDED_URLS = [
  'supabase.co',
  'jklcvyuxwxgsfczrfaco.supabase.co',
  'google.com',           // Evita erros CORS do dicionário
  'googleapis.com',       // Recursos do Google
  'gstatic.com',          // Recursos estáticos do Google
  'github.io'             // Para não cachear recursos de outros repositórios
];

// Extensões de arquivo que devem ser cacheadas
const CACHEABLE_EXTENSIONS = [
  '.html', '.css', '.js', '.json', '.pdf', 
  '.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico'
];

function isExcluded(url) {
  return EXCLUDED_URLS.some(excluded => url.includes(excluded));
}

function isCacheable(url) {
  // Se for excluído, não cacheia
  if (isExcluded(url)) return false;
  
  // Se for do mesmo domínio, cacheia
  if (url.startsWith(self.location.origin)) return true;
  
  // Se for de domínio externo mas com extensão permitida, cacheia
  return CACHEABLE_EXTENSIONS.some(ext => url.toLowerCase().includes(ext));
}

self.addEventListener('install', event => {
  console.log('Service Worker instalado');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Cache principal aberto');
        return cache.addAll(urlsToCache);
      })
      .catch(err => console.error('Erro ao adicionar ao cache:', err))
  );
  // Forçar ativação imediata
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  console.log('Service Worker ativado');
  event.waitUntil(
    Promise.all([
      // Limpar caches antigos
      caches.keys().then(cacheNames => {
        return Promise.all(
          cacheNames.map(cache => {
            if (cache !== CACHE_NAME && cache !== MODELOS_CACHE) {
              console.log('Removendo cache antigo:', cache);
              return caches.delete(cache);
            }
          })
        );
      }),
      // Assumir controle de clientes não controlados
      self.clients.claim()
    ])
  );
});

self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);
  
  // Ignorar requisições que não são GET
  if (request.method !== 'GET') return;
  
  // Verificar se é uma URL excluída
  if (isExcluded(url.href)) {
    // Apenas passar para a rede, sem interceptar
    return;
  }
  
  // Para requisições do Google (dicionário, etc), apenas passar
  if (url.hostname.includes('google.com')) {
    return;
  }
  
  // Para requisições cross-origin sem suporte a CORS, apenas passar
  if (url.origin !== self.location.origin && request.mode === 'cors') {
    // Tentar fazer fetch com no-cors para evitar erros
    event.respondWith(
      fetch(request, { mode: 'no-cors' })
        .catch(() => new Response('', { status: 200, statusText: 'OK' }))
    );
    return;
  }
  
  // Estratégia: Cache First, depois rede
  event.respondWith(
    caches.match(request)
      .then(cachedResponse => {
        if (cachedResponse) {
          return cachedResponse;
        }
        
        // Tentar buscar da rede
        return fetch(request)
          .then(networkResponse => {
            // Só cachear respostas bem-sucedidas e que não sejam de origem externa problemática
            if (networkResponse && networkResponse.status === 200 && isCacheable(request.url)) {
              const responseClone = networkResponse.clone();
              caches.open(CACHE_NAME)
                .then(cache => {
                  cache.put(request, responseClone);
                })
                .catch(err => console.error('Erro ao cachear:', err));
            }
            return networkResponse;
          })
          .catch(error => {
            console.warn('Fetch falhou para:', request.url, error);
            
            // Para requisições de HTML, retornar página offline
            if (request.headers.get('accept')?.includes('text/html')) {
              return caches.match('/TENDEX/offline.html')
                .then(offlineResponse => offlineResponse || new Response('Offline', { status: 503 }));
            }
            
            return new Response('Recurso não disponível offline', { status: 503 });
          });
      })
  );
});

// Sincronização em background
self.addEventListener('sync', event => {
  console.log('Evento sync recebido:', event.tag);
  if (event.tag === 'sync-inspecoes') {
    event.waitUntil(sincronizarDados());
  }
});

// Receber mensagens do cliente
self.addEventListener('message', event => {
  const { data } = event;
  if (data && data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// Função de sincronização
async function sincronizarDados() {
  console.log('🔄 Sincronizando dados pendentes...');
  
  try {
    const clients = await self.clients.matchAll();
    clients.forEach(client => {
      client.postMessage({
        type: 'SYNC_TRIGGERED',
        message: 'Internet restaurada. Iniciando sincronização...',
        timestamp: new Date().toISOString()
      });
    });
    
    // Aqui você pode adicionar lógica real de sincronização com o backend
    // Por exemplo, enviar dados do IndexedDB para o servidor
    
    console.log('✅ Sincronização finalizada');
  } catch (error) {
    console.error('❌ Erro na sincronização:', error);
  }
}

// Push notifications (opcional)
self.addEventListener('push', event => {
  if (event.data) {
    const data = event.data.json();
    const options = {
      body: data.body || 'Nova atualização disponível',
      icon: '/TENDEX/icon.png',
      badge: '/TENDEX/badge.png',
      vibrate: [200, 100, 200],
      data: {
        url: data.url || '/TENDEX/dashboard.html'
      }
    };
    
    event.waitUntil(
      self.registration.showNotification(data.title || 'TENDEX', options)
    );
  }
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(
    clients.openWindow(event.notification.data.url)
  );
});
