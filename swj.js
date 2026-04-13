// sw.js - Service Worker para TENDEX
const CACHE_NAME = 'tendex-v1';
const urlsToCache = [
  '/TENDEX/',
  '/TENDEX/dashboard.html',
  '/TENDEX/index.html',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2',
  'https://unpkg.com/pdf-lib@1.17.1/dist/pdf-lib.min.js'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(urlsToCache))
  );
});

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => response || fetch(event.request))
  );
});

self.addEventListener('sync', event => {
  if (event.tag === 'sync-inspecoes') {
    event.waitUntil(sincronizarInspecoes());
  }
});

async function sincronizarInspecoes() {
  // Esta função será chamada automaticamente quando a internet voltar
  // Você pode implementar a lógica de envio dos dados pendentes aqui
  console.log('Sincronizando inspeções pendentes...');
  // Notifica a página para processar os pendentes
  const clients = await clients.matchAll();
  clients.forEach(client => {
    client.postMessage({ type: 'SYNC_TRIGGERED' });
  });
}