// Service Worker per la PWA della chiave
// ↑ Incrementa questa versione ad ogni aggiornamento per forzare il refresh
const CACHE = 'flora-friulana-v1.0.1';

const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './keys_by_family.json', // <-- nuovo nome
  './species.json',
  './manifest.json',
  // icone (se presenti):
  './icons/icon-192.png',
  './icons/icon-512.png'
];

// Installa: precache + attiva subito la nuova versione
self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(ASSETS))
  );
});

// Attiva: pulizia dei cache vecchi + prendi controllo delle pagine aperte
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Fetch: cache-first con revalidate in background (offline-friendly)
self.addEventListener('fetch', (e) => {
  const { request } = e;

  // Evita di “intrappolare” i JSON durante lo sviluppo: usa network-first sui dati
  const isData = request.url.endsWith('keys_by_family.json') || request.url.endsWith('species.json');

  if (isData) {
    e.respondWith(
      fetch(request)
        .then((resp) => {
          const copy = resp.clone();
          caches.open(CACHE).then((c) => c.put(request, copy));
          return resp;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  // Static assets: cache-first
  e.respondWith(
    caches.match(request).then((cached) => {
      const fetchPromise = fetch(request).then((resp) => {
        const copy = resp.clone();
        caches.open(CACHE).then((c) => c.put(request, copy));
        return resp;
      }).catch(() => cached);
      return cached || fetchPromise;
    })
  );
});
