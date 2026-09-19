/* HealthFun service worker
 * - App shell: cache-first (szybki start, działa offline)
 * - Pliki CSV (nasze "API"): network-first, fallback do cache — aktualizacja danych bez zmiany kodu
 * Zmień VERSION przy każdym wdrożeniu, żeby wymusić odświeżenie shellu.
 */
const VERSION = 'hf-v1';
const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/style.css',
  './js/app.js',
  './js/csv.js',
  './js/db.js',
  './js/store.js',
  './js/ui.js',
  './js/views/today.js',
  './js/views/training.js',
  './js/views/diet.js',
  './js/views/journal.js',
  './js/views/knowledge.js',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
];
const DATA = [
  '00_indeks', '01_profil_i_cele', '02_slownik', '03_cwiczenia', '04_plan_treningowy',
  '05_rutyny_dzienne', '06_skladniki', '07_przepisy', '08_plan_posilkow_tydzien',
  '09_zasady_i_nawyki', '10_suplementy', '11_dziennik', '12_lista_zakupow_tydzien',
].map(f => `./data/${f}.csv`);

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const cache = await caches.open(VERSION);
    await cache.addAll(SHELL);
    // Dane cache'ujemy "best effort" — brak jednego pliku nie blokuje instalacji.
    await Promise.allSettled(DATA.map(u => cache.add(u)));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.endsWith('.csv')) {
    e.respondWith(networkFirst(req));
  } else {
    e.respondWith(cacheFirst(req));
  }
});

async function networkFirst(req) {
  const cache = await caches.open(VERSION);
  try {
    const res = await fetch(req, { cache: 'no-store' });
    if (res.ok) cache.put(req, res.clone());
    return res;
  } catch {
    const hit = await cache.match(req);
    if (hit) return hit;
    return new Response('', { status: 504, statusText: 'offline' });
  }
}

async function cacheFirst(req) {
  const cache = await caches.open(VERSION);
  const hit = await cache.match(req, { ignoreSearch: true });
  if (hit) return hit;
  try {
    const res = await fetch(req);
    if (res.ok) cache.put(req, res.clone());
    return res;
  } catch {
    if (req.mode === 'navigate') return cache.match('./index.html');
    return new Response('', { status: 504, statusText: 'offline' });
  }
}
