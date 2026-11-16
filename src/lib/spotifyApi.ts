import type { EnlaceSpotify } from './enlaces'
import { desconectarSpotify, tokenSpotify } from './spotifyAuth'

// Llamadas a la Web API de Spotify para controlar la reproducción (requiere Premium).

export type CodigoError = 'sin-dispositivo' | 'premium' | 'sin-permiso' | 'desconectado' | 'otro'

const MENSAJES: Record<CodigoError, string> = {
  'sin-dispositivo':
    'No encuentro Spotify abierto. Abre la app de Spotify en este móvil o en tu ordenador y vuelve a pulsar la tarjeta.',
  premium: 'Controlar Spotify desde aquí necesita una cuenta Premium.',
  'sin-permiso':
    'Spotify no deja usar tu cuenta con esta app. Añádela en developer.spotify.com › tu app › User Management y vuelve a conectar.',
  desconectado: 'La conexión con Spotify ha caducado. Pulsa «Conectar Spotify» de nuevo.',
  otro: 'Spotify no ha respondido. Inténtalo de nuevo en unos segundos.',
}

export class ErrorSpotify extends Error {
  constructor(public codigo: CodigoError) {
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
  if (r.status === 403) {
    const j = (await r.json().catch(() => ({}))) as { error?: { reason?: string } }
    throw new ErrorSpotify(j.error?.reason === 'PREMIUM_REQUIRED' ? 'premium' : 'sin-permiso')
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
}

export async function dispositivos(): Promise<Dispositivo[]> {
  const j = (await (await llamar('/me/player/devices')).json()) as {
    devices: { id: string | null; name: string; type: string; is_active: boolean; is_restricted: boolean }[]
  }
  return j.devices
    .filter((d) => d.id && !d.is_restricted)
    .map((d) => ({ id: d.id!, nombre: d.name, tipo: d.type, activo: d.is_active }))
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

export async function reproducirEn(d: Dispositivo, e: EnlaceSpotify) {
  const cuerpo = e.tipo === 'track' || e.tipo === 'episode' ? { uris: [e.uri] } : { context_uri: e.uri }
  await llamar(conDispositivo('/me/player/play', d.id), { method: 'PUT', body: JSON.stringify(cuerpo) })
}

export const pausar = (id?: string) => llamar(conDispositivo('/me/player/pause', id), { method: 'PUT' })
export const reanudar = (id?: string) => llamar(conDispositivo('/me/player/play', id), { method: 'PUT' })
export const modoRepetir = (modo: 'track' | 'context' | 'off', id?: string) =>
  llamar(conDispositivo(`/me/player/repeat?state=${modo}`, id), { method: 'PUT' })

/** Estado actual de Spotify (null si no hay nada activo). */
export async function estadoActual(): Promise<{ sonando: boolean } | null> {
  const r = await llamar('/me/player')
  if (r.status === 204) return null
  const j = (await r.json().catch(() => null)) as { is_playing?: boolean } | null
  return j ? { sonando: !!j.is_playing } : null
}
