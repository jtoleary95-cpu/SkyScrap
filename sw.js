// Sky Scrap offline cache.
// The game page is network-first, so new versions show up whenever there's a connection;
// with no connection it loads from the cache. Fonts and three.js are cached after first fetch.
const CACHE = 'skyscrap-v1';
const CORE = ['./', './index.html', './manifest.json'];
const EXTRA = [
  'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js',
  'https://fonts.googleapis.com/css2?family=Baloo+2:wght@600;800&display=swap'
];
// online play needs a live connection, so never cache the signalling server
const SKIP = /firebaseio\.com|firebasejs|googleapis\.com\/identitytoolkit|securetoken|stun:/;

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    await c.addAll(CORE);
    // extras are nice to have; a failure here shouldn't block install
    await Promise.all(EXTRA.map(u => fetch(u, { mode: 'cors' })
      .then(r => r.ok && c.put(u, r)).catch(() => {})));
    self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || SKIP.test(req.url)) return;
  const url = new URL(req.url);

  // the game page: try the network first, fall back to the saved copy
  if (req.mode === 'navigate' || (url.origin === location.origin && url.pathname.endsWith('.html'))) {
    e.respondWith((async () => {
      const c = await caches.open(CACHE);
      try {
        const r = await fetch(req);
        if (r.ok) c.put('./index.html', r.clone());
        return r;
      } catch (err) {
        return (await c.match('./index.html')) || (await c.match('./')) || Response.error();
      }
    })());
    return;
  }

  // everything else (fonts, three.js, manifest): cache first, then network, saving what comes back
  e.respondWith((async () => {
    const c = await caches.open(CACHE);
    const hit = await c.match(req, { ignoreVary: true });
    if (hit) return hit;
    try {
      const r = await fetch(req);
      if (r.ok || r.type === 'opaque') c.put(req, r.clone());
      return r;
    } catch (err) {
      return Response.error();
    }
  })());
});
