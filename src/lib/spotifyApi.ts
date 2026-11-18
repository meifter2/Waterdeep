import type { EnlaceSpotify } from './enlaces'
import { desconectarSpotify, tokenSpotify } from './spotifyAuth'

// Web API de Spotify para controlar la reproducción en la app del usuario (requiere Premium).

export type CodigoError = 'sin-dispositivo' | 'premium' | 'sin-permiso' | 'desconectado' | 'limite' | 'sin-volumen' | 'otro'

const MENSAJES: Record<CodigoError, string> = {
  'sin-dispositivo':
    'No encuentro Spotify abierto. Abre la app de Spotify en este móvil o en tu ordenador y vuelve a pulsar la tarjeta.',
  premium: 'Controlar Spotify desde aquí necesita una cuenta Premium.',
  'sin-permiso':
    'Spotify no deja usar tu cuenta con esta app. Añádela en developer.spotify.com › tu app › User Management y vuelve a conectar.',
  desconectado: 'La conexión con Spotify ha caducado. Pulsa «Conectar Spotify» de nuevo.',
  limite: 'Spotify pide ir más despacio. Espera un momento y vuelve a intentarlo.',
  'sin-volumen': 'Este dispositivo de Spotify no permite cambiar el volumen desde DFY. Ajústalo en la app de Spotify.',
  otro: 'Spotify no ha respondido. Inténtalo de nuevo en unos segundos.',
}

export class ErrorSpotify extends Error {
  constructor(
    public codigo: CodigoError,
    /** Segundos de espera que pide Spotify (error «limite»). */
    public esperar = 0,
  ) {
    super(MENSAJES[codigo])
  }
}

async function llamar(ruta: string, init: RequestInit = {}): Promise<Response> {
  const token = await tokenSpotify()
  if (!token) throw new ErrorSpotify('desconectado')
  let r: Response
  try {
    r = await fetch(`https://api.spotify.com/v1${ruta}`, {
      ...init,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    })
  } catch {
    throw new ErrorSpotify('otro')
  }
  if (r.status === 401) {
    desconectarSpotify()
    throw new ErrorSpotify('desconectado')
  }
  if (r.status === 429) throw new ErrorSpotify('limite', Number(r.headers.get('Retry-After')) || 1)
  if (r.status === 403) {
    const j = (await r.json().catch(() => ({}))) as { error?: { reason?: string } }
    const motivo = j.error?.reason ?? ''
    if (motivo === 'PREMIUM_REQUIRED') throw new ErrorSpotify('premium')
    if (motivo === 'VOLUME_CONTROL_DISALLOW') throw new ErrorSpotify('sin-volumen')
    throw new ErrorSpotify('sin-permiso')
  }
  if (r.status === 404) throw new ErrorSpotify('sin-dispositivo')
  if (!r.ok) throw new ErrorSpotify('otro')
  return r
}

export interface Dispositivo {
  id: string
  nombre: string
  tipo: string
  activo: boolean
  /** Volumen real del dispositivo (0–100), si Spotify lo informa. */
  volumen: number | null
  soportaVolumen: boolean
}

interface DispositivoApi {
  id: string | null
  name: string
  type: string
  is_active: boolean
  is_restricted: boolean
  volume_percent?: number | null
  supports_volume?: boolean
}

const convertir = (d: DispositivoApi): Dispositivo => ({
  id: d.id!,
  nombre: d.name,
  tipo: d.type,
  activo: d.is_active,
  volumen: typeof d.volume_percent === 'number' ? d.volume_percent : null,
  // Si Spotify no lo indica, se intenta y se maneja el rechazo.
  soportaVolumen: d.supports_volume !== false,
})

export async function dispositivos(): Promise<Dispositivo[]> {
  const j = (await (await llamar('/me/player/devices')).json()) as { devices: DispositivoApi[] }
  return j.devices.filter((d) => d.id && !d.is_restricted).map(convertir)
}

const esMovil = () => /Android|iPhone|iPad/i.test(navigator.userAgent)

/** El que ya suena; si no, el del tipo de este aparato (móvil u ordenador); si no, el primero. */
export async function elegirDispositivo(): Promise<Dispositivo | null> {
  const lista = await dispositivos()
  return (
    lista.find((d) => d.activo) ??
    lista.find((d) => d.tipo === (esMovil() ? 'Smartphone' : 'Computer')) ??
    lista[0] ??
    null
  )
}

const conDispositivo = (ruta: string, id?: string) => (id ? `${ruta}${ruta.includes('?') ? '&' : '?'}device_id=${id}` : ruta)

export async function reproducirEn(d: Dispositivo, e: EnlaceSpotify, inicioMs: number | null = null) {
  const suelta = e.tipo === 'track' || e.tipo === 'episode'
  const cuerpo = suelta ? { uris: [e.uri], ...(inicioMs ? { position_ms: inicioMs } : {}) } : { context_uri: e.uri }
  await llamar(conDispositivo('/me/player/play', d.id), { method: 'PUT', body: JSON.stringify(cuerpo) })
}

/** Salta a una posición de lo que suena (operación oficial «seek»). */
export const irA = (posicionMs: number, id?: string) =>
  llamar(conDispositivo(`/me/player/seek?position_ms=${Math.max(0, Math.round(posicionMs))}`, id), { method: 'PUT' })

export const pausar = (id?: string) => llamar(conDispositivo('/me/player/pause', id), { method: 'PUT' })
export const reanudar = (id?: string) => llamar(conDispositivo('/me/player/play', id), { method: 'PUT' })
export const modoRepetir = (modo: 'track' | 'context' | 'off', id?: string) =>
  llamar(conDispositivo(`/me/player/repeat?state=${modo}`, id), { method: 'PUT' })
export const fijarVolumenSpotify = (valor: number, id?: string) =>
  llamar(conDispositivo(`/me/player/volume?volume_percent=${Math.round(Math.min(100, Math.max(0, valor)))}`, id), { method: 'PUT' })

/** Estado REAL de Spotify: qué suena (canción y contexto), dónde, en qué punto y a qué volumen. */
export interface EstadoSpotify {
  sonando: boolean
  /** URI de lo que suena: spotify:track:… o spotify:episode:… */
  uri: string | null
  /** URI de la lista o álbum que se está reproduciendo, si lo hay. */
  contexto: string | null
  progreso: number | null
  dispositivo: Dispositivo | null
}

export async function estadoActual(): Promise<EstadoSpotify | null> {
  const r = await llamar('/me/player?additional_types=episode')
  if (r.status === 204) return null
  const j = (await r.json().catch(() => null)) as {
    is_playing?: boolean
    progress_ms?: number
    item?: { uri?: string } | null
    context?: { uri?: string } | null
    device?: DispositivoApi | null
  } | null
  if (!j) return null
  return {
    sonando: !!j.is_playing,
    uri: j.item?.uri ?? null,
    contexto: j.context?.uri ?? null,
    progreso: typeof j.progress_ms === 'number' ? j.progress_ms : null,
    dispositivo: j.device?.id ? convertir(j.device) : null,
  }
}

/** ¿El estado real de Spotify corresponde a este enlace? */
export function suenaEsto(s: EstadoSpotify | null, e: EnlaceSpotify): boolean {
  if (!s) return false
  return e.tipo === 'track' || e.tipo === 'episode' ? s.uri === e.uri : s.contexto === e.uri
}
