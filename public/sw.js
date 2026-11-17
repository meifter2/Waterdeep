// Service worker de DFY (antes «Banda sonora»): permite instalar la app y que abra rápido.
// - Páginas: primero la red (siempre la versión publicada más reciente); sin red, la última guardada.
// - Archivos con huella (/assets/…): se guardan al usarlos; nunca cambian.
// - Spotify, YouTube, Supabase y Google: no se tocan (pasan directos a la red).
// v2: identidad DFY (iconos nuevos). Solo guarda archivos de la app; ningún dato del usuario.
const CACHE = 'dfy-v2'

self.addEventListener('install', () => self.skipWaiting())

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((claves) => Promise.all(claves.filter((c) => c !== CACHE).map((c) => caches.delete(c)))).then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (e) => {
  const req = e.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return

  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then((res) => {
          const copia = res.clone()
          caches.open(CACHE).then((c) => c.put('/', copia))
          return res
        })
        .catch(() => caches.match('/').then((r) => r || Response.error())),
    )
    return
  }

  if (url.pathname.startsWith('/assets/') || url.pathname.startsWith('/iconos/')) {
    e.respondWith(
      caches.match(req).then(
        (r) =>
          r ||
          fetch(req).then((res) => {
            if (res.ok) {
              const copia = res.clone()
              caches.open(CACHE).then((c) => c.put(req, copia))
            }
            return res
          }),
      ),
    )
  }
})
