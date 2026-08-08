const CACHE_VERSION = 'formatinho-v41';
const SHELL_CACHE = `${CACHE_VERSION}-shell`;
const DATA_CACHE = `${CACHE_VERSION}-data`;
const SHELL_ASSETS = [
  '/index.html',
  '/styles.css?v=codex-36',
  '/banlist.js?v=codex-36',
  '/catalog-worker.js?v=codex-35',
  '/virtual-grid.js?v=codex-36',
  '/formatinho-logo.png?v=3',
  '/favicon.png?v=3',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL_ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(Promise.all([
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key.startsWith('formatinho-') && ![SHELL_CACHE, DATA_CACHE].includes(key)).map((key) => caches.delete(key)))),
    self.clients.claim(),
  ]));
});

async function navigationResponse(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(SHELL_CACHE);
      void cache.put('/index.html', response.clone());
    }
    return response;
  } catch {
    return (await caches.match('/index.html')) || Response.error();
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(SHELL_CACHE);
  const cached = await cache.match(request, { ignoreSearch: false });
  const network = fetch(request).then((response) => {
    if (response.ok) void cache.put(request, response.clone());
    return response;
  }).catch(() => null);
  return cached || (await network) || Response.error();
}

async function catalogResponse(request) {
  const cache = await caches.open(DATA_CACHE);
  try {
    const response = await fetch(request);
    if (response.ok) void cache.put(request, response.clone());
    return response;
  } catch {
    return (await cache.match(request)) || Response.error();
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (request.mode === 'navigate') {
    event.respondWith(navigationResponse(request));
    return;
  }
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/catalog/')) {
    event.respondWith(catalogResponse(request));
    return;
  }
  if (url.pathname.startsWith('/api/')) return;
  if (/\.(?:js|css|png|jpe?g|webp|avif|woff2?)$/i.test(url.pathname)) event.respondWith(staleWhileRevalidate(request));
});
