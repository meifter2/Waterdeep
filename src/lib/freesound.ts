import type { Recurso } from '../data/types'
import { supabase } from './supabase'

// Cliente de la búsqueda de Freesound. Habla SOLO con nuestra función de servidor (/api/sonidos):
// la clave de Freesound nunca está en el navegador. Cada petición lleva la sesión de Supabase.
//
// Cómo se guarda un sonido de Freesound con el modelo de siempre (recurso origen 'url', sin SQL nuevo):
// - enlace: MP3 de escucha + «#freesound=ID» (el id siempre se recupera, aunque el MP3 cambie).
// - descripcion: crédito legible y recuperable «Freesound #ID · «Título» · autor · CC BY 4.0 · página».
// Si el MP3 deja de funcionar, se vuelve a pedir a la API por su id (resolverSonido).

export type Licencia = 'cc0' | 'by' | 'by-nc'
export type TipoBusqueda = 'ambiente' | 'efecto'

export interface SonidoLibre {
  id: number
  titulo: string
  autor: string
  licencia: Licencia
  licenciaUrl: string
  duracion_ms: number
  preview: string
  pagina: string
  valoracion: number | null
}

export interface Busqueda {
  q: string
  tipo: TipoBusqueda
  duracion: string
  nc: boolean
  pagina: number
}

/** Opciones de duración (las mismas claves que entiende el servidor). */
export const DURACIONES: Record<TipoBusqueda, { valor: string; texto: string }[]> = {
  ambiente: [
    { valor: 'cualquiera', texto: 'Más de 1 min' },
    { valor: '1-5', texto: '1 a 5 min' },
    { valor: '5-20', texto: '5 a 20 min' },
    { valor: '20+', texto: 'Más de 20 min' },
  ],
  efecto: [
    { valor: 'cualquiera', texto: 'Hasta 1 min' },
    { valor: '0-3', texto: 'Hasta 3 s' },
    { valor: '0-10', texto: 'Hasta 10 s' },
    { valor: '10-60', texto: '10 s a 1 min' },
  ],
}

export class ErrorFreesound extends Error {
  constructor(
    mensaje: string,
    readonly codigo: string,
  ) {
    super(mensaje)
  }
}

async function pedir<T>(consulta: URLSearchParams): Promise<T> {
  if (!supabase) throw new ErrorFreesound('Buscar sonidos necesita tu cuenta de DFY: en modo local (sin cuenta) no está disponible.', 'local')
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) throw new ErrorFreesound('Tu sesión ha caducado. Sal y vuelve a entrar.', 'sesion')
  let r: Response
  try {
    r = await fetch(`/api/sonidos?${consulta}`, { headers: { authorization: `Bearer ${token}` } })
  } catch {
    throw new ErrorFreesound('No hay conexión. Revisa internet y vuelve a intentarlo.', 'red')
  }
  // Sin función de servidor (p. ej. «npm run preview» en local) llega la página de la app, no JSON.
  if (!(r.headers.get('content-type') ?? '').includes('application/json'))
    throw new ErrorFreesound('La búsqueda de sonidos solo funciona en la versión publicada en Vercel.', 'sin-servidor')
  const cuerpo = (await r.json().catch(() => ({}))) as { error?: string; mensaje?: string } & T
  if (!r.ok) {
    const espera = Number(r.headers.get('retry-after'))
    const extra = r.status === 429 && espera > 0 ? ` (unos ${espera} s)` : ''
    throw new ErrorFreesound((cuerpo.mensaje ?? 'No se ha podido buscar. Inténtalo de nuevo.') + extra, cuerpo.error ?? 'error')
  }
  return cuerpo
}

export function buscarSonidos(b: Busqueda) {
  const consulta = new URLSearchParams({ q: b.q, tipo: b.tipo, duracion: b.duracion, pagina: String(b.pagina), nc: b.nc ? '1' : '0' })
  return pedir<{ resultados: SonidoLibre[]; total: number; pagina: number; hayMas: boolean }>(consulta)
}

/** Datos actuales de un sonido (sobre todo, su MP3 de escucha vigente). */
export async function resolverSonido(id: number): Promise<SonidoLibre> {
  return (await pedir<{ sonido: SonidoLibre }>(new URLSearchParams({ id: String(id) }))).sonido
}

// ── Licencias y créditos ──

export function etiquetaLicencia(licencia: Licencia, url = ''): string {
  if (licencia === 'cc0') return 'CC0'
  const version = /\/(\d\.\d)\/?$/.exec(url)?.[1] ?? '4.0'
  return licencia === 'by' ? `CC BY ${version}` : `CC BY-NC ${version}`
}

export const AVISO_NC = 'Solo uso no comercial'

export const enlaceFreesound = (s: Pick<SonidoLibre, 'preview' | 'id'>) => `${s.preview}#freesound=${s.id}`

export const creditoTexto = (s: SonidoLibre) =>
  `Freesound #${s.id} · «${s.titulo.slice(0, 150)}» · ${s.autor} · ${etiquetaLicencia(s.licencia, s.licenciaUrl)} · ${s.pagina}`.slice(0, 500)

/** Id de Freesound guardado en el enlace (…mp3#freesound=123). */
export function freesoundIdDe(enlace: string): number | null {
  const m = /#freesound=(\d{1,10})$/.exec(enlace)
  return m ? Number(m[1]) : null
}

export interface Credito {
  id: number
  titulo: string
  autor: string
  licencia: string
  nc: boolean
  pagina: string
}

/** Crédito de un sonido de Freesound guardado en la biblioteca (null si no es de Freesound). */
export function creditoDe(r: Pick<Recurso, 'origen' | 'enlace' | 'descripcion'>): Credito | null {
  if (r.origen !== 'url') return null
  const id = freesoundIdDe(r.enlace)
  if (id == null) return null
  const m = /^Freesound #(\d+) · «(.*)» · (.+?) · (CC0|CC BY(?:-NC)? \d\.\d) · (https:\/\/freesound\.org\/\S+)$/.exec(r.descripcion)
  if (!m || Number(m[1]) !== id) return { id, titulo: '', autor: '', licencia: '', nc: false, pagina: `https://freesound.org/s/${id}/` }
  return { id, titulo: m[2], autor: m[3], licencia: m[4], nc: m[4].includes('NC'), pagina: m[5] }
}

// ── Sugerencias en inglés (Freesound etiqueta casi todo en inglés) ──

const DICCIONARIO: Record<string, string[]> = {
  lluvia: ['rain', 'rain on roof', 'light rain'],
  tormenta: ['thunderstorm', 'storm', 'thunder'],
  trueno: ['thunder'],
  viento: ['wind', 'howling wind'],
  bosque: ['forest', 'forest night', 'forest birds'],
  noche: ['night crickets', 'night ambience'],
  taberna: ['tavern', 'pub crowd', 'medieval tavern'],
  posada: ['tavern', 'inn'],
  chimenea: ['fireplace', 'crackling fire'],
  hoguera: ['campfire', 'crackling fire'],
  fuego: ['fire', 'crackling fire'],
  ciudad: ['city', 'medieval city', 'market crowd'],
  mercado: ['market crowd', 'marketplace'],
  multitud: ['crowd', 'crowd murmur'],
  batalla: ['battle', 'sword fight', 'war'],
  espada: ['sword', 'sword clash'],
  espadas: ['sword clash', 'sword fight'],
  mar: ['sea waves', 'ocean'],
  olas: ['waves', 'ocean waves'],
  río: ['river', 'stream'],
  rio: ['river', 'stream'],
  cueva: ['cave', 'cave drips'],
  mazmorra: ['dungeon', 'dungeon ambience'],
  barco: ['ship creaking', 'boat'],
  puerto: ['harbor', 'harbour', 'docks'],
  puerta: ['door', 'door creak', 'wooden door'],
  pasos: ['footsteps'],
  caballo: ['horse', 'horse gallop'],
  carruaje: ['carriage', 'horse carriage'],
  lobo: ['wolf howl'],
  dragón: ['dragon roar', 'monster roar'],
  dragon: ['dragon roar', 'monster roar'],
  monstruo: ['monster growl'],
  magia: ['magic spell', 'magic'],
  explosión: ['explosion'],
  explosion: ['explosion'],
  campanas: ['church bells', 'bells'],
  pájaros: ['birds', 'birdsong'],
  pajaros: ['birds', 'birdsong'],
  iglesia: ['church', 'church choir'],
  templo: ['temple', 'choir'],
  cementerio: ['graveyard', 'eerie wind'],
  terror: ['horror ambience', 'eerie'],
  misterio: ['mystery ambience', 'eerie'],
  nieve: ['snow footsteps', 'blizzard'],
  ventisca: ['blizzard'],
  desierto: ['desert wind'],
  pantano: ['swamp', 'frogs'],
  alcantarilla: ['sewer', 'water drips'],
  herrería: ['blacksmith', 'anvil'],
  herreria: ['blacksmith', 'anvil'],
}

/** Palabras sugeridas por tipo para empezar sin escribir. */
export const RAPIDAS: Record<TipoBusqueda, string[]> = {
  ambiente: ['lluvia', 'tormenta', 'bosque', 'taberna', 'chimenea', 'ciudad', 'mar', 'cueva', 'mazmorra', 'noche'],
  efecto: ['puerta', 'espadas', 'pasos', 'explosión', 'trueno', 'magia', 'lobo', 'dragón', 'campanas', 'batalla'],
}

/** Traducciones sugeridas para lo escrito (si hay alguna palabra conocida). */
export function sugerenciasEn(texto: string): string[] {
  const palabras = texto.toLocaleLowerCase('es').split(/[\s,]+/).filter(Boolean)
  const encontradas = new Set<string>()
  for (const p of palabras) for (const s of DICCIONARIO[p] ?? []) encontradas.add(s)
  return [...encontradas].filter((s) => s !== texto.trim().toLowerCase()).slice(0, 5)
}

/** Primera traducción de una palabra rápida (para buscar directamente en inglés). */
export const traduccion = (palabra: string) => DICCIONARIO[palabra.toLocaleLowerCase('es')]?.[0] ?? palabra
