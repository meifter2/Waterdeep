// Función de servidor /api/sonidos (Freesound) con Supabase y Freesound simulados. No sale a la red.
import { atender, licenciaDe } from '../api/sonidos.ts'

let fallos = 0
const comprobar = (n: string, ok: boolean, extra = '') => {
  if (!ok) fallos++
  console.log(ok ? 'OK ' : 'MAL', n, extra)
}

const CLAVE = 'clave-secreta-freesound-123'
const TOKEN = 'aaa.bbb.ccc'
const env = (globalThis as unknown as { process: { env: Record<string, string | undefined> } }).process.env
env.VITE_SUPABASE_URL = 'https://prueba.supabase.co'
env.VITE_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_prueba'

// ── Mundo simulado ──
type Llamada = { url: string; cabeceras: Record<string, string> }
const llamadas: Llamada[] = []
let respuestaFreesound: () => Response = () => new Response('{}')
const sonido = (id: number, licencia: string, extra: Record<string, unknown> = {}) => ({
  id,
  name: `Sonido ${id}`,
  username: 'autora',
  license: licencia,
  duration: 125.4,
  previews: { 'preview-hq-mp3': `https://cdn.freesound.org/previews/1/${id}_1-hq.mp3`, 'preview-lq-mp3': 'x' },
  url: `https://freesound.org/people/autora/sounds/${id}/`,
  avg_rating: 4.26,
  num_ratings: 3,
  ...extra,
})
const CC0 = 'http://creativecommons.org/publicdomain/zero/1.0/'
const BY = 'https://creativecommons.org/licenses/by/4.0/'
const NC = 'https://creativecommons.org/licenses/by-nc/4.0/'
const busquedaOk = () =>
  new Response(JSON.stringify({ count: 4, next: 'https://freesound.org/apiv2/search/text/?page=2', results: [sonido(1, CC0), sonido(2, BY), sonido(3, NC), sonido(4, 'http://creativecommons.org/licenses/sampling+/1.0/')] }))

globalThis.fetch = (async (entrada: string | URL | Request, init?: RequestInit) => {
  const url = String(entrada)
  const cabeceras = Object.fromEntries(new Headers(init?.headers).entries())
  llamadas.push({ url, cabeceras })
  if (url.startsWith('https://prueba.supabase.co/auth/v1/user'))
    return cabeceras.authorization === `Bearer ${TOKEN}` ? new Response(JSON.stringify({ id: 'usuario-1' })) : new Response('{}', { status: 401 })
  if (url.startsWith('https://freesound.org/apiv2/')) return respuestaFreesound()
  throw new Error('red no simulada: ' + url)
}) as typeof fetch

const pedir = async (consulta: string, cabeceras: Record<string, string> = { authorization: `Bearer ${TOKEN}` }, metodo = 'GET') => {
  const r = await atender(new Request(`https://dfy.example/api/sonidos?${consulta}`, { method: metodo, headers: cabeceras }))
  const texto = await r.text()
  return { r, texto, cuerpo: JSON.parse(texto), cabeceras: JSON.stringify([...r.headers.entries()]) }
}
const sinClave = (x: { texto: string; cabeceras: string }) => !x.texto.includes(CLAVE) && !x.cabeceras.includes(CLAVE)
const freesoundLlamado = () => llamadas.some((l) => l.url.startsWith('https://freesound.org/'))

// ── Licencias ──
comprobar('Licencias: CC0, BY y BY-NC se reconocen; Sampling+ y ND no', licenciaDe(CC0) === 'cc0' && licenciaDe(BY) === 'by' && licenciaDe(NC) === 'by-nc' && licenciaDe('https://creativecommons.org/licenses/by-nd/4.0/') === null && licenciaDe('http://creativecommons.org/licenses/sampling+/1.0/') === null)

// ── Método, origen y parámetros ──
let x = await pedir('q=rain', undefined, 'POST')
comprobar('Solo GET (405)', x.r.status === 405 && x.cuerpo.error === 'metodo')
x = await pedir('q=rain', { authorization: `Bearer ${TOKEN}`, origin: 'https://malo.example' })
comprobar('Otra web (Origin distinto): 403', x.r.status === 403 && x.cuerpo.error === 'origen')
x = await pedir('q=rain', { authorization: `Bearer ${TOKEN}`, 'sec-fetch-site': 'cross-site' })
comprobar('Otra web (Sec-Fetch-Site): 403', x.r.status === 403)
x = await pedir('q=rain', { authorization: `Bearer ${TOKEN}`, origin: 'https://dfy.example' })
comprobar('Misma web con Origin: se atiende', x.r.status !== 403)
x = await pedir('q=rain', { authorization: `Bearer ${TOKEN}`, origin: 'https://master-waterdeep.vercel.app', 'x-forwarded-host': 'master-waterdeep.vercel.app' })
comprobar('Producción: Origin público distinto de la URL interna de la función, pero igual a X-Forwarded-Host: se atiende', x.r.status !== 403)
x = await pedir('q=rain', { authorization: `Bearer ${TOKEN}`, origin: 'https://master-waterdeep.vercel.app', 'sec-fetch-site': 'same-origin' })
comprobar('Producción: el navegador declara same-origin: se atiende', x.r.status !== 403)
x = await pedir('q=rain', { authorization: `Bearer ${TOKEN}`, origin: 'https://malo.example', 'x-forwarded-host': 'master-waterdeep.vercel.app' })
comprobar('Producción: Origin de otra web con X-Forwarded-Host propio: 403', x.r.status === 403)
for (const malo of ['q=', 'q=' + 'a'.repeat(101), 'q=rain&pagina=0', 'q=rain&pagina=21', 'q=rain&duracion=raro', 'id=abc', 'id=12345678901'])
  comprobar(`Parámetros inválidos (${malo.slice(0, 20)}): 400`, (await pedir(malo)).r.status === 400)

// ── Sesión ──
llamadas.length = 0
env.FREESOUND_API_KEY = CLAVE
x = await pedir('q=rain', {})
comprobar('Sin sesión: 401 y no se llama a Freesound', x.r.status === 401 && !freesoundLlamado())
x = await pedir('q=rain', { authorization: 'Bearer otro.token.falso' })
comprobar('Sesión falsa: 401 (comprobada en Supabase)', x.r.status === 401 && llamadas.some((l) => l.url.endsWith('/auth/v1/user')) && !freesoundLlamado())
delete env.VITE_SUPABASE_URL
comprobar('Sin Supabase configurado: 503 explicado', (await pedir('q=rain')).cuerpo.error === 'sin-supabase')
env.VITE_SUPABASE_URL = 'https://prueba.supabase.co'

// ── Sin clave ──
delete env.FREESOUND_API_KEY
llamadas.length = 0
x = await pedir('q=rain')
comprobar('Sin FREESOUND_API_KEY: 503 con explicación clara', x.r.status === 503 && x.cuerpo.error === 'sin-clave' && x.cuerpo.mensaje.includes('FREESOUND_API_KEY') && !freesoundLlamado())
env.FREESOUND_API_KEY = CLAVE

// ── Búsqueda ──
llamadas.length = 0
respuestaFreesound = busquedaOk
x = await pedir('q=rain%20forest&tipo=ambiente&duracion=1-5&pagina=1')
const fs = llamadas.find((l) => l.url.startsWith('https://freesound.org/'))!
const u = new URL(fs.url)
comprobar('Búsqueda: usa la API v2 de texto con la consulta', u.pathname === '/apiv2/search/text/' && u.searchParams.get('query') === 'rain forest')
comprobar('…filtro de duración del tipo (ambiente 1–5 min)', u.searchParams.get('filter') === 'duration:[60 TO 300]')
comprobar('…clave en la cabecera Authorization: Token, nunca en la URL', fs.cabeceras.authorization === `Token ${CLAVE}` && !fs.url.includes(CLAVE) && !u.searchParams.has('token'))
comprobar('…sin NC por defecto y sin licencias no admitidas', x.cuerpo.resultados.map((s: { id: number }) => s.id).join() === '1,2')
const s1 = x.cuerpo.resultados[1]
comprobar('…datos normalizados (autor, licencia, duración, escucha, página)', s1.autor === 'autora' && s1.licencia === 'by' && s1.duracion_ms === 125400 && s1.preview.endsWith('2_1-hq.mp3') && s1.pagina.endsWith('/sounds/2/') && s1.valoracion === 4.3)
comprobar('…hay más páginas y la respuesta solo se guarda en el navegador', x.cuerpo.hayMas === true && x.r.headers.get('cache-control') === 'private, max-age=600')
comprobar('…la clave no aparece en la respuesta', sinClave(x))
x = await pedir('q=rain&nc=1')
comprobar('Con «incluir NC»: aparece el sonido CC BY-NC', x.cuerpo.resultados.some((s: { licencia: string }) => s.licencia === 'by-nc'))
llamadas.length = 0
await pedir('q=door&tipo=efecto&duracion=0-3')
comprobar('Efectos: filtro de duración corto', new URL(llamadas.find((l) => l.url.startsWith('https://freesound.org/'))!.url).searchParams.get('filter') === 'duration:[0 TO 3]')

// ── Resolver un sonido por id (enlace de escucha caducado) ──
llamadas.length = 0
respuestaFreesound = () => new Response(JSON.stringify(sonido(77, BY, { previews: { 'preview-hq-mp3': 'https://cdn.freesound.org/previews/9/77_nuevo-hq.mp3' } })))
x = await pedir('id=77')
comprobar('Resolver por id: devuelve el enlace de escucha actual', x.r.status === 200 && x.cuerpo.sonido.preview.endsWith('77_nuevo-hq.mp3') && llamadas.some((l) => l.url.includes('/apiv2/sounds/77/')))
respuestaFreesound = () => new Response('{"detail":"Not found."}', { status: 404 })
x = await pedir('id=78')
comprobar('Sonido borrado en Freesound: 404 «no-existe»', x.r.status === 404 && x.cuerpo.error === 'no-existe')

// ── Errores de Freesound (sin filtrar nada de lo que diga) ──
respuestaFreesound = () => new Response(`{"detail":"Invalid token ${CLAVE}"}`, { status: 401 })
x = await pedir('q=rain')
comprobar('Clave rechazada por Freesound: 503 y su texto (con la clave) no se reenvía', x.r.status === 503 && x.cuerpo.error === 'clave-invalida' && sinClave(x))
respuestaFreesound = () => new Response('{"detail":"Request was throttled"}', { status: 429, headers: { 'retry-after': '42' } })
x = await pedir('q=rain')
comprobar('Límite de la API (429): se traduce con Retry-After', x.r.status === 429 && x.cuerpo.error === 'limite' && x.r.headers.get('retry-after') === '42' && x.r.headers.get('cache-control') === 'no-store')
respuestaFreesound = () => new Response('boom', { status: 500 })
comprobar('Freesound caído: 502', (await pedir('q=rain')).cuerpo.error === 'freesound')
respuestaFreesound = () => {
  throw new Error('tiempo agotado')
}
comprobar('Freesound sin respuesta (red/tiempo): 502', (await pedir('q=rain')).r.status === 502)
let rutas: string[] = []
respuestaFreesound = () => (rutas.push('x'), rutas.length === 1 ? new Response('', { status: 410 }) : busquedaOk())
llamadas.length = 0
x = await pedir('q=rain')
comprobar('Si Freesound retira /search/text/, prueba /search/ una vez', x.r.status === 200 && llamadas.some((l) => new URL(l.url).pathname === '/apiv2/search/'))

console.log(fallos ? `\n${fallos} FALLOS` : '\nTodas las comprobaciones correctas')
const proc = (globalThis as unknown as { process: { exit: (c: number) => void } }).process
proc.exit(fallos ? 1 : 0)
