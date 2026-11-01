// Offline support: app shell is cached; network first for the page so updates arrive.
const CACHE = 'reelator-v1'

self.addEventListener('install', (e) => {
  self.skipWaiting()
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(['./', './manifest.webmanifest', './icon-192.png'])))
})

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()))
})

self.addEventListener('fetch', (e) => {
  const req = e.request
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return
  const isPage = req.mode === 'navigate'
  if (isPage) {
    e.respondWith(fetch(req).then((r) => { caches.open(CACHE).then((c) => c.put('./', r.clone())); return r }).catch(() => caches.match('./')))
    return
  }
  // hashed assets never change: cache first
  e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((r) => {
    if (r.ok) { const copy = r.clone(); caches.open(CACHE).then((c) => c.put(req, copy)) }
    return r
  })))
})
