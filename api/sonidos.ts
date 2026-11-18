// Función de servidor de Vercel: busca sonidos libres en Freesound (API v2) sin exponer la clave.
//
// GET /api/sonidos?q=lluvia&tipo=ambiente&duracion=cualquiera&nc=0&pagina=1  → búsqueda
// GET /api/sonidos?id=123456                                               → un sonido (enlace de escucha actual)
//
// Seguridad:
// - La clave (FREESOUND_API_KEY) solo vive aquí. Se envía a Freesound en la cabecera «Authorization: Token …»
//   (nunca en una URL) y ninguna respuesta, error ni cabecera la incluye. Los textos de Freesound no se reenvían.
// - Solo atiende a sesiones válidas de DFY: el token de Supabase se comprueba contra Supabase Auth.
// - Rechaza peticiones desde otras webs (Origin / Sec-Fetch-Site) y parámetros fuera de rango.
// - Sin memoria entre invocaciones: el límite real es el de Freesound (60/min, 2000/día por clave), que se
//   traduce en un 429 con Retry-After. La caché es la del navegador del usuario (Cache-Control: private).
// Archivo autónomo a propósito (sin imports): Vercel lo compila solo y las pruebas lo cargan directamente.

type Entorno = Record<string, string | undefined>
const entorno = (): Entorno => (globalThis as unknown as { process?: { env: Entorno } }).process?.env ?? {}

const FREESOUND = 'https://freesound.org/apiv2'
const CAMPOS = 'id,name,username,license,duration,previews,url,avg_rating,num_ratings'
const POR_PAGINA = 30
const ESPERA_MS = 8000

export type Licencia = 'cc0' | 'by' | 'by-nc'

export interface SonidoLibre {
  id: number
  titulo: string
  autor: string
  licencia: Licencia
  licenciaUrl: string
  duracion_ms: number
  /** MP3 de escucha de Freesound (puede cambiar con el tiempo: se guarda también el id). */
  preview: string
  /** Página del sonido en Freesound. */
  pagina: string
  valoracion: number | null
}

/** Rangos de duración en segundos (null = sin límite). Ambientes: largos; efectos: cortos. */
export const DURACIONES = {
  ambiente: { cualquiera: [60, null], '1-5': [60, 300], '5-20': [300, 1200], '20+': [1200, null] },
  efecto: { cualquiera: [0, 60], '0-3': [0, 3], '0-10': [0, 10], '10-60': [10, 60] },
} as const satisfies Record<string, Record<string, readonly [number, number | null]>>

const MENSAJES = {
  metodo: 'Esta dirección solo admite consultas.',
  origen: 'Petición no permitida.',
  'sin-supabase': 'La búsqueda de sonidos necesita las cuentas de DFY (Supabase) configuradas.',
  sesion: 'Tu sesión ha caducado o no es válida. Sal y vuelve a entrar.',
  parametros: 'La búsqueda no es válida. Escribe entre 1 y 100 caracteres.',
  'sin-clave': 'La búsqueda de Freesound aún no está configurada: falta la clave FREESOUND_API_KEY en Vercel (Settings › Environment Variables).',
  'clave-invalida': 'Freesound no acepta la clave configurada. Revisa FREESOUND_API_KEY en Vercel.',
  limite: 'Freesound ha recibido demasiadas búsquedas seguidas. Espera un momento y vuelve a intentarlo.',
  'no-existe': 'Ese sonido ya no está en Freesound.',
  freesound: 'Freesound no responde ahora mismo. Inténtalo de nuevo en un rato.',
} as const
type Codigo = keyof typeof MENSAJES
const ESTADO: Record<Codigo, number> = {
  metodo: 405,
  origen: 403,
  'sin-supabase': 503,
  sesion: 401,
  parametros: 400,
  'sin-clave': 503,
  'clave-invalida': 503,
  limite: 429,
  'no-existe': 404,
  freesound: 502,
}

const json = (cuerpo: unknown, estado: number, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(cuerpo), {
    status: estado,
    headers: { 'content-type': 'application/json; charset=utf-8', 'x-content-type-options': 'nosniff', ...extra },
  })

const fallo = (codigo: Codigo, extra: Record<string, string> = {}) =>
  json({ error: codigo, mensaje: MENSAJES[codigo] }, ESTADO[codigo], { 'cache-control': 'no-store', ...extra })

/** cc0 / by / by-nc según la URL de la licencia. Cualquier otra (Sampling+, ND…) no se admite. */
export function licenciaDe(url: string): Licencia | null {
  const u = url.toLowerCase()
  if (u.includes('publicdomain/zero')) return 'cc0'
  if (/\/licenses\/by-nc\//.test(u)) return 'by-nc'
  if (/\/licenses\/by\//.test(u)) return 'by'
  return null
}

function normalizar(s: Record<string, unknown>): SonidoLibre | null {
  const previews = (s.previews ?? {}) as Record<string, unknown>
  const preview = previews['preview-hq-mp3']
  const licenciaUrl = typeof s.license === 'string' ? s.license : ''
  const licencia = licenciaDe(licenciaUrl)
  const id = Number(s.id)
  if (!Number.isInteger(id) || id <= 0 || !licencia || typeof preview !== 'string' || !preview.startsWith('https://')) return null
  const valoracion = Number(s.avg_rating)
  return {
    id,
    titulo: String(s.name ?? '').slice(0, 200),
    autor: String(s.username ?? '').slice(0, 100),
    licencia,
    licenciaUrl,
    duracion_ms: Math.max(0, Math.round(Number(s.duration) * 1000) || 0),
    preview,
    pagina: typeof s.url === 'string' && s.url.startsWith('https://freesound.org/') ? s.url : `https://freesound.org/s/${id}/`,
    valoracion: Number(s.num_ratings) > 0 && Number.isFinite(valoracion) ? Math.round(valoracion * 10) / 10 : null,
  }
}

/**
 * Petición desde otra web: se rechaza (la app siempre llama desde su propio dominio).
 * En Vercel la dirección interna de la función puede no coincidir con el dominio público, así que el Origin
 * se compara con el host de la URL y con las cabeceras Host / X-Forwarded-Host.
 */
function deOtraWeb(req: Request): boolean {
  const sitio = req.headers.get('sec-fetch-site')
  if (sitio === 'cross-site') return true
  if (sitio === 'same-origin') return false
  const origen = req.headers.get('origin')
  if (!origen) return false
  try {
    const propios = [new URL(req.url).host, req.headers.get('host'), req.headers.get('x-forwarded-host')].filter(Boolean)
    return !propios.includes(new URL(origen).host)
  } catch {
    return true
  }
}

async function sesionValida(req: Request, env: Entorno): Promise<boolean | 'sin-supabase'> {
  const base = env.SUPABASE_URL ?? env.VITE_SUPABASE_URL
  const publica = env.SUPABASE_PUBLISHABLE_KEY ?? env.VITE_SUPABASE_PUBLISHABLE_KEY
  if (!base || !publica) return 'sin-supabase'
  const token = /^Bearer ([\w-]+\.[\w-]+\.[\w-]+)$/.exec(req.headers.get('authorization') ?? '')?.[1]
  if (!token || token.length > 4096) return false
  try {
    const r = await fetch(`${base.replace(/\/$/, '')}/auth/v1/user`, {
      headers: { apikey: publica, authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(ESPERA_MS),
    })
    if (!r.ok) return false
    const u = (await r.json()) as { id?: unknown }
    return typeof u.id === 'string' && u.id.length > 0
  } catch {
    return false
  }
}

async function pedirFreesound(ruta: string, clave: string): Promise<Response | Codigo> {
  try {
    return await fetch(`${FREESOUND}${ruta}`, {
      headers: { authorization: `Token ${clave}`, accept: 'application/json' },
      signal: AbortSignal.timeout(ESPERA_MS),
    })
  } catch {
    return 'freesound'
  }
}

/** Traduce un error de Freesound sin reenviar nada de lo que diga. */
function errorFreesound(r: Response): Response {
  if (r.status === 401 || r.status === 403) return fallo('clave-invalida')
  if (r.status === 429) {
    const espera = Number(r.headers.get('retry-after'))
    return fallo('limite', { 'retry-after': String(Number.isFinite(espera) && espera > 0 && espera <= 3600 ? Math.ceil(espera) : 60) })
  }
  if (r.status === 404) return fallo('no-existe')
  return fallo('freesound')
}

export async function atender(req: Request): Promise<Response> {
  if (req.method !== 'GET') return fallo('metodo', { allow: 'GET' })
  if (deOtraWeb(req)) return fallo('origen')
  const env = entorno()

  const p = new URL(req.url).searchParams
  const id = p.get('id')
  const q = (p.get('q') ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim()
  const tipo = p.get('tipo') === 'efecto' ? 'efecto' : 'ambiente'
  const rangos = DURACIONES[tipo] as Record<string, readonly [number, number | null]>
  const duracion = p.get('duracion') ?? 'cualquiera'
  const pagina = Number(p.get('pagina') ?? '1')
  const nc = p.get('nc') === '1'
  if (id != null ? !/^\d{1,10}$/.test(id) : !q || q.length > 100 || !(duracion in rangos) || !Number.isInteger(pagina) || pagina < 1 || pagina > 20)
    return fallo('parametros')

  const sesion = await sesionValida(req, env)
  if (sesion === 'sin-supabase') return fallo('sin-supabase')
  if (!sesion) return fallo('sesion')

  const clave = env.FREESOUND_API_KEY?.trim()
  if (!clave) return fallo('sin-clave')

  const privado = { 'cache-control': 'private, max-age=600' }

  if (id != null) {
    const r = await pedirFreesound(`/sounds/${id}/?fields=${CAMPOS}`, clave)
    if (typeof r === 'string') return fallo(r)
    if (!r.ok) return errorFreesound(r)
    const s = normalizar((await r.json().catch(() => ({}))) as Record<string, unknown>)
    return s ? json({ sonido: s }, 200, { 'cache-control': 'private, max-age=300' }) : fallo('no-existe')
  }

  const [desde, hasta] = rangos[duracion]
  const consulta = new URLSearchParams({
    query: q,
    filter: `duration:[${desde} TO ${hasta ?? '*'}]`,
    fields: CAMPOS,
    page: String(pagina),
    page_size: String(POR_PAGINA),
    sort: 'score',
  }).toString()
  let r = await pedirFreesound(`/search/text/?${consulta}`, clave)
  // Por si Freesound retira la ruta antigua de búsqueda: se prueba la nueva una vez.
  if (typeof r !== 'string' && (r.status === 404 || r.status === 410)) r = await pedirFreesound(`/search/?${consulta}`, clave)
  if (typeof r === 'string') return fallo(r)
  if (!r.ok) return errorFreesound(r)
  const datos = (await r.json().catch(() => ({}))) as { count?: unknown; next?: unknown; results?: unknown }
  const resultados = (Array.isArray(datos.results) ? datos.results : [])
    .map((s) => normalizar(s as Record<string, unknown>))
    .filter((s): s is SonidoLibre => !!s && (s.licencia !== 'by-nc' || nc))
  return json({ resultados, total: Number(datos.count) || 0, pagina, hayMas: !!datos.next && pagina < 20 }, 200, privado)
}

export function GET(req: Request) {
  return atender(req)
}
