// sw.js - Service Worker OTIMIZADO para OFFLINE - TENDEX
const CACHE_NAME = 'tendex-v2';
const MODELOS_CACHE = 'tendex-modelos-v1';

// URLs para cachear (adaptado para seu sistema)
const urlsToCache = [
  '/',  // Cache da raiz
  '/index.html',
  '/TENDEX/',
  '/TENDEX/index.html',
  'https://cdn.jsdelivr.net/npm/qrcode@1.5.1/build/qrcode.min.js',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2'
];

// Ignorar requisições externas problemáticas
const EXCLUDED_URLS = [
  'supabase.co',
  'google.com',
  'googleapis.com',
  'gstatic.com',
  'analytics',
  'facebook'
];

function isExcluded(url) {
  return EXCLUDED_URLS.some(excluded => url.includes(excluded));
}

// Verificar se é uma requisição de página HTML
function isHtmlRequest(request) {
  return request.headers.get('accept')?.includes('text/html') ||
         request.destination === 'document';
}

// INSTALAÇÃO
self.addEventListener('install', event => {
  console.log('[SW] Instalando TENDEX...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('[SW] Cacheando arquivos essenciais...');
        // Tentar cachear cada URL, ignorando falhas
        return Promise.allSettled(
          urlsToCache.map(url => 
            cache.add(url).catch(err => 
              console.warn(`[SW] Não foi possível cachear: ${url}`, err)
            )
          )
        );
      })
      .then(() => self.skipWaiting())
  );
});

// ATIVAÇÃO
self.addEventListener('activate', event => {
  console.log('[SW] Ativando TENDEX...');
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
    ).then(() => {
      console.log('[SW] Pronto para uso offline!');
    })
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
    (async () => {
      try {
        // Primeiro, tenta buscar da rede (com timeout)
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000); // 5s timeout
        
        try {
          const networkResponse = await fetch(event.request, { signal: controller.signal });
          clearTimeout(timeoutId);
          
          // Se deu certo e é do mesmo domínio, cachear para usar offline depois
          if (networkResponse && networkResponse.status === 200) {
            const responseClone = networkResponse.clone();
            caches.open(CACHE_NAME).then(cache => {
              cache.put(event.request, responseClone);
            });
          }
          return networkResponse;
        } catch (fetchError) {
          clearTimeout(timeoutId);
          throw fetchError;
        }
      } catch (error) {
        console.log('[SW] Offline - servindo do cache:', url.pathname);
        
        // Tenta buscar do cache
        const cachedResponse = await caches.match(event.request);
        
        if (cachedResponse) {
          return cachedResponse;
        }
        
        // Se for requisição HTML e não tem cache, retorna página offline
        if (isHtmlRequest(event.request)) {
          // Tenta encontrar o index.html no cache
          const offlinePage = await caches.match('/index.html') ||
                             await caches.match('/TENDEX/index.html') ||
                             await caches.match('/');
          
          if (offlinePage) {
            return offlinePage;
          }
          
          // Fallback HTML simples
          return new Response(`
            <!DOCTYPE html>
            <html lang="pt">
            <head>
              <meta charset="UTF-8">
              <meta name="viewport" content="width=device-width, initial-scale=1.0">
              <title>TENDEX - Offline</title>
              <style>
                body {
                  font-family: system-ui, -apple-system, sans-serif;
                  text-align: center;
                  padding: 50px 20px;
                  background: #f3f6fc;
                  margin: 0;
                }
                .container {
                  max-width: 400px;
                  margin: 0 auto;
                  background: white;
                  border-radius: 20px;
                  padding: 30px;
                  box-shadow: 0 4px 20px rgba(0,0,0,0.1);
                }
                h1 { color: #1e4a76; margin-bottom: 20px; }
                p { color: #475569; line-height: 1.5; margin-bottom: 20px; }
                button {
                  background: #1e4a76;
                  color: white;
                  border: none;
                  padding: 12px 24px;
                  border-radius: 30px;
                  font-size: 16px;
                  cursor: pointer;
                  font-weight: 600;
                }
                button:hover { background: #0f2b3d; }
                .emoji { font-size: 48px; margin-bottom: 20px; }
              </style>
            </head>
            <body>
              <div class="container">
                <div class="emoji">📱</div>
                <h1>Modo Offline</h1>
                <p>Você está sem conexão com a internet.</p>
                <p>Os dados salvos em cache estarão disponíveis quando você clicar em "💾 Salvar para Offline" estando online.</p>
                <button onclick="location.reload()">🔄 Tentar novamente</button>
              </div>
              <script>
                if ('serviceWorker' in navigator && navigator.onLine) {
                  location.reload();
                }
              </script>
            </body>
            </html>
          `, { 
            status: 200, 
            headers: { 'Content-Type': 'text/html' } 
          });
        }
        
        // Para outros recursos, retorna erro
        return new Response('Recurso não disponível offline', { 
          status: 503,
          headers: { 'Content-Type': 'text/plain' }
        });
      }
    })()
  );
});

// MENSAGENS
self.addEventListener('message', event => {
  if (event.data === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  
  // Mensagem para limpar cache
  if (event.data === 'CLEAR_CACHE') {
    event.waitUntil(
      caches.delete(CACHE_NAME).then(() => {
        console.log('[SW] Cache limpo');
        event.ports[0].postMessage('CACHE_CLEARED');
      })
    );
  }
  
  // Mensagem para verificar status do cache
  if (event.data === 'GET_CACHE_STATUS') {
    event.waitUntil(
      (async () => {
        const cache = await caches.open(CACHE_NAME);
        const keys = await cache.keys();
        event.ports[0].postMessage({ 
          status: 'CACHE_STATUS',
          count: keys.length,
          urls: keys.map(req => req.url)
        });
      })()
    );
  }
});
