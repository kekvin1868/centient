// Service worker: keeps the app's shell and code on the device, so it opens with no signal. Data is not its
// job (the query cache in models/query.ts keeps that), so /api/* is never touched.
// The page registers it as /sw.js?v=<build id>: a new build is a new worker with its own cache.
const PREFIX = 'centient-';
const CACHE = PREFIX + new URL(location.href).searchParams.get('v');

// A saved file is matched by its address alone: servers add `Vary` (preview: Origin; Cloudflare:
// Accept-Encoding), and a hashed file or the shell is the same file whatever those headers say.
const saved = key => caches.match(key, { cacheName: CACHE, ignoreVary: true });
// Only our own good answers are kept: a sign-in redirect or an error page must never become the shell.
const keep = async (key, res) => {
  if (res.ok && res.type === 'basic') await (await caches.open(CACHE)).put(key, res.clone());
  return res;
};

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', event =>
  event.waitUntil(
    caches
      .keys()
      .then(keys =>
        Promise.all(
          keys.filter(k => k.startsWith(PREFIX) && k !== CACHE).map(k => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  ),
);

// The page lists what it downloaded before this worker took over (lib/serviceWorker.ts). The shell is saved
// last, so a saved shell always has its code.
self.addEventListener('message', event => {
  const files = Array.isArray(event.data) ? event.data.filter(f => typeof f === 'string') : [];
  const save = file =>
    fetch(file).then(
      res => keep(file, res),
      () => {},
    );
  event.waitUntil(Promise.all(files.map(save)).then(() => save('/')));
});

self.addEventListener('fetch', event => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api/'))
    return;
  // Every page is the same shell: the network's when it answers, the saved one when it can't.
  // ponytail: a connection that hangs waits for the browser's own timeout; race a timer if that bites.
  if (req.mode === 'navigate')
    event.respondWith(
      fetch(req).then(
        res => keep('/', res),
        () => saved('/').then(hit => hit ?? Response.error()),
      ),
    );
  // Built files carry a content hash, so a saved copy is always right.
  else if (url.pathname.startsWith('/assets/'))
    event.respondWith(saved(req).then(hit => hit ?? fetch(req).then(res => keep(req, res))));
});
