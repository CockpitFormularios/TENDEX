// sw.js - Service Worker para TENDEX
const CACHE_NAME = 'tendex-v1';
const urlsToCache = [
  '/TENDEX/',
  '/TENDEX/dashboard.html',
  '/TENDEX/index.html',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2',
  'https://unpkg.com/pdf-lib@1.17.1/dist/pdf-lib.min.js'
];

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

// Estratégia de busca: cache first, depois rede
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => response || fetch(event.request))
  );
});

// Background Sync - será chamado quando a internet voltar
self.addEventListener('sync', event => {
  console.log('Evento sync recebido:', event.tag);
  if (event.tag === 'sync-inspecoes') {
    event.waitUntil(sincronizarInspecoes());
  }
});

// Função de sincronização
async function sincronizarInspecoes() {
  console.log('🔄 Sincronizando inspeções pendentes...');
  
  // Notifica a página principal para processar os pendentes
  const clients = await self.clients.matchAll();
  clients.forEach(client => {
    client.postMessage({ 
      type: 'SYNC_TRIGGERED',
      message: 'Internet restaurada. Iniciando sincronização...'
    });
  });
  
  // Aguarda um pouco para dar tempo da página processar
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  // Verifica se ainda há pendentes e notifica novamente se necessário
  // (a página vai enviar os dados e remover da fila)
  console.log('✅ Sincronização finalizada');
}
