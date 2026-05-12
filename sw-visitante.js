// sw-visitante.js - Service Worker com verificação automática de atualizações
const APP_VERSION = '0.0.7'; // ← ATUALIZE ESTA VERSÃO QUANDO MODIFICAR O CÓDIGO
const CACHE_NAME = `tendex-visitante-v${APP_VERSION.replace(/\./g, '_')}`;
const DYNAMIC_CACHE = `tendex-dynamic-v${APP_VERSION.replace(/\./g, '_')}`;

// URLs para cachear na instalação
const STATIC_ASSETS = [
  '/TENDEX/visitante.html',
  '/TENDEX/',
  '/TENDEX/index.html'
];

// URL do GitHub para verificar atualizações
const GITHUB_PAGE_URL = 'https://cockpitformularios.github.io/TENDEX/visitante.html';
const CHECK_INTERVAL = 5 * 60 * 1000; // Verifica a cada 5 minutos

// Extensões de arquivos que devem ser cacheadas
const CACHEABLE_EXTENSIONS = ['.html', '.js', '.css', '.json', '.ico', '.png', '.jpg', '.jpeg', '.svg', '.webp'];

// Versão atual armazenada
let currentAppVersion = APP_VERSION;

// ==================== FUNÇÕES DE VERIFICAÇÃO DE ATUALIZAÇÃO ====================

// Extrair versão do HTML
function extractVersionFromHtml(html) {
  const patterns = [
    /APP_VERSION\s*=\s*['"]([^'"]+)['"]/,
    /const APP_VERSION = ['"]([^'"]+)['"]/,
    /let APP_VERSION = ['"]([^'"]+)['"]/,
    /version:\s*['"]([^'"]+)['"]/,
    /<meta name="version" content="([^"]+)">/
  ];
  
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match && match[1]) {
      return match[1];
    }
  }
  return null;
}

// Verificar se há atualização disponível no GitHub
async function checkForUpdates() {
  console.log('[SW] 🔍 Verificando atualizações no GitHub...');
  
  try {
    // Buscar página mais recente com cache bust
    const url = `${GITHUB_PAGE_URL}?sw_check=${Date.now()}`;
    const response = await fetch(url, {
      cache: 'no-store',
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      }
    });
    
    if (!response.ok) {
      console.log('[SW] ❌ Falha ao verificar:', response.status);
      return false;
    }
    
    const html = await response.text();
    const remoteVersion = extractVersionFromHtml(html);
    
    if (remoteVersion && remoteVersion !== currentAppVersion) {
      console.log(`[SW] 🆕 NOVA VERSÃO DISPONÍVEL!`);
      console.log(`[SW] Local: ${currentAppVersion} → Remota: ${remoteVersion}`);
      
      // Atualizar versão atual
      currentAppVersion = remoteVersion;
      
      // Notificar todos os clientes (abas abertas)
      const clients = await self.clients.matchAll();
      clients.forEach(client => {
        client.postMessage({
          type: 'UPDATE_AVAILABLE',
          version: remoteVersion,
          currentVersion: APP_VERSION,
          timestamp: Date.now()
        });
      });
      
      return true;
    } else {
      console.log('[SW] ✅ App está atualizado (versão:', currentAppVersion, ')');
      return false;
    }
    
  } catch (error) {
    console.error('[SW] ❌ Erro ao verificar atualizações:', error);
    return false;
  }
}

// Forçar atualização e limpar caches antigos
async function forceUpdateAndClear() {
  console.log('[SW] 🔄 Forçando atualização e limpando caches...');
  
  try {
    // 1. Limpar caches antigos
    const cacheNames = await caches.keys();
    for (const cacheName of cacheNames) {
      if (cacheName !== CACHE_NAME) {
        await caches.delete(cacheName);
        console.log('[SW] Cache removido:', cacheName);
      }
    }
    
    // 2. Buscar nova versão
    const response = await fetch(`${GITHUB_PAGE_URL}?force=${Date.now()}`, {
      cache: 'no-store'
    });
    
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      await cache.put('/TENDEX/visitante.html', response.clone());
      await cache.put('/TENDEX/', response.clone());
      console.log('[SW] Nova versão cacheada');
    }
    
    // 3. Notificar clientes para recarregar
    const clients = await self.clients.matchAll();
    clients.forEach(client => {
      client.postMessage({
        type: 'FORCE_RELOAD',
        version: currentAppVersion,
        timestamp: Date.now()
      });
    });
    
    return true;
    
  } catch (error) {
    console.error('[SW] Erro na atualização forçada:', error);
    return false;
  }
}

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

// ==================== INSTALAÇÃO ====================
self.addEventListener('install', event => {
  console.log('[SW] Instalando Service Worker versão:', APP_VERSION);
  
  event.waitUntil(
    caches.open(CACHE_NAME).then(async cache => {
      console.log('[SW] Cacheando arquivos estáticos');
      
      const cachePromises = STATIC_ASSETS.map(async url => {
        try {
          // Tentar buscar versão mais recente durante instalação
          const fetchOptions = {
            cache: 'no-store',
            headers: { 'Cache-Control': 'no-cache' }
          };
          
          let response = await fetch(url, fetchOptions);
          if (!response || !response.ok) {
            response = await cache.match(url);
          }
          
          if (response && response.ok) {
            await cache.put(url, response);
            console.log('[SW] Cacheado com sucesso:', url);
          } else {
            await cache.add(url);
          }
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

// ==================== ATIVAÇÃO ====================
self.addEventListener('activate', event => {
  console.log('[SW] Ativando Service Worker versão:', APP_VERSION);
  
  event.waitUntil(
    caches.keys().then(async cacheNames => {
      // Remover caches de versões anteriores
      const deletePromises = cacheNames.map(cacheName => {
        if (cacheName !== CACHE_NAME && cacheName !== DYNAMIC_CACHE && 
            (cacheName.startsWith('tendex-visitante') || cacheName.startsWith('tendex-dynamic'))) {
          console.log('[SW] Removendo cache antigo:', cacheName);
          return caches.delete(cacheName);
        }
      });
      
      await Promise.all(deletePromises);
      console.log('[SW] Cache limpo, reivindicando controle dos clientes');
      
      // Verificar atualizações imediatamente após ativação
      if (navigator.onLine !== false) {
        await checkForUpdates();
      }
      
      // Configurar verificação periódica
      setInterval(async () => {
        if (navigator.onLine !== false) {
          await checkForUpdates();
        }
      }, CHECK_INTERVAL);
      
      return self.clients.claim();
    })
  );
});

// ==================== FETCH (COM VERIFICAÇÃO DE VERSÃO) ====================
self.addEventListener('fetch', event => {
  const url = event.request.url;
  const request = event.request;
  
  if (request.method !== 'GET') return;
  if (url.includes('.pdf') || url.includes('/storage/v1/object/')) return;
  if (url.includes('google-analytics') || url.includes('gtag') || url.includes('googletagmanager')) return;
  
  // Para o HTML principal, sempre tentar buscar versão mais recente quando online
  const isMainHtml = url.includes('visitante.html') || url === '/TENDEX/' || url.endsWith('/TENDEX');
  
  event.respondWith(
    (async () => {
      try {
        // Para HTML principal: Network First (sempre buscar atualizado)
        if (isMainHtml && navigator.onLine !== false) {
          try {
            const networkResponse = await fetch(request, {
              cache: 'no-store',
              headers: { 'Cache-Control': 'no-cache, no-store' }
            });
            
            if (networkResponse && networkResponse.ok) {
              // Verificar versão no HTML baixado
              const htmlClone = networkResponse.clone();
              const htmlText = await htmlClone.text();
              const newVersion = extractVersionFromHtml(htmlText);
              
              if (newVersion && newVersion !== currentAppVersion) {
                console.log('[SW] Nova versão detectada via fetch:', newVersion);
                currentAppVersion = newVersion;
                
                // Notificar clientes
                const clients = await self.clients.matchAll();
                clients.forEach(client => {
                  client.postMessage({
                    type: 'UPDATE_AVAILABLE',
                    version: newVersion,
                    timestamp: Date.now()
                  });
                });
              }
              
              // Atualizar cache
              const cache = await caches.open(CACHE_NAME);
              cache.put(request, networkResponse.clone());
              
              return networkResponse;
            }
          } catch (error) {
            console.log('[SW] Network falhou para HTML, usando cache');
          }
        }
        
        // Para outros recursos: Cache First
        const cachedResponse = await caches.match(request);
        
        if (cachedResponse) {
          // Atualizar cache em background (stale-while-revalidate)
          if (navigator.onLine !== false && !isMainHtml) {
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
        
        // Não está em cache, buscar da rede
        const networkResponse = await fetch(request);
        
        if (networkResponse && networkResponse.ok && isCacheableUrl(url)) {
          const cache = await caches.open(CACHE_NAME);
          cache.put(request, networkResponse.clone());
        }
        
        return networkResponse;
        
      } catch (error) {
        console.warn('[SW] Falha na requisição:', url.substring(0, 50), error);
        
        // Fallback para navegação
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

// ==================== SINCronização EM BACKGROUND ====================
self.addEventListener('sync', event => {
  console.log('[SW] Sincronização em background:', event.tag);
  if (event.tag === 'sync-data') {
    event.waitUntil(syncData());
  }
  if (event.tag === 'check-update') {
    event.waitUntil(checkForUpdates());
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

// ==================== MENSAGENS DO CLIENTE ====================
self.addEventListener('message', async event => {
  console.log('[SW] Mensagem recebida do cliente:', event.data);
  
  const { type } = event.data;
  
  switch (type) {
    case 'SKIP_WAITING':
      self.skipWaiting();
      break;
      
    case 'CLEAR_CACHE':
      event.waitUntil(clearCache());
      break;
      
    case 'GET_VERSION':
      if (event.ports && event.ports[0]) {
        event.ports[0].postMessage({ version: APP_VERSION, cacheVersion: CACHE_NAME });
      }
      break;
      
    case 'CHECK_UPDATE':
      const hasUpdate = await checkForUpdates();
      if (event.ports && event.ports[0]) {
        event.ports[0].postMessage({ hasUpdate, version: currentAppVersion });
      }
      break;
      
    case 'FORCE_UPDATE':
      const updated = await forceUpdateAndClear();
      if (event.ports && event.ports[0]) {
        event.ports[0].postMessage({ updated, version: currentAppVersion });
      }
      break;
      
    default:
      console.log('[SW] Tipo de mensagem desconhecido:', type);
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

// ==================== PUSH NOTIFICATIONS ====================
self.addEventListener('push', event => {
  console.log('[SW] Push notification recebida');
  
  if (!event.data) return;
  
  try {
    const data = event.data.json();
    
    const options = {
      body: data.body || 'Nova versão disponível! Atualize o TENDEX',
      icon: '/TENDEX/icon-192.png',
      badge: '/TENDEX/badge.png',
      vibrate: [200, 100, 200],
      data: { url: data.url || '/TENDEX/', version: data.version }
    };
    
    event.waitUntil(
      self.registration.showNotification(data.title || '📱 TENDEX - Atualização', options)
    );
  } catch (error) {
    console.error('[SW] Erro ao processar push:', error);
  }
});

// ==================== CLIQUE EM NOTIFICAÇÃO ====================
self.addEventListener('notificationclick', event => {
  console.log('[SW] Clique em notificação');
  event.notification.close();
  
  const notificationVersion = event.notification.data?.version;
  
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(async clientList => {
        const url = event.notification.data?.url || '/TENDEX/';
        
        // Se tem nova versão, forçar atualização
        if (notificationVersion && notificationVersion !== APP_VERSION) {
          await forceUpdateAndClear();
        }
        
        for (const client of clientList) {
          if (client.url.includes('cockpitformularios') && 'focus' in client) {
            client.postMessage({ type: 'FORCE_RELOAD', version: notificationVersion });
            return client.focus();
          }
        }
        
        if (clients.openWindow) {
          return clients.openWindow(url + '?notification=' + Date.now());
        }
      })
  );
});

// ==================== EVENTOS DE CONEXÃO ====================
self.addEventListener('online', () => {
  console.log('[SW] 🌐 Conexão online detectada - verificando atualizações...');
  checkForUpdates();
});

self.addEventListener('offline', () => {
  console.log('[SW] 📡 Conexão offline - modo cache ativado');
});

console.log('[SW] Service Worker inicializado - Versão:', APP_VERSION);
