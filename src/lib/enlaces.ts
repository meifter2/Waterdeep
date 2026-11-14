// Reconoce enlaces de Spotify y YouTube y los traduce a lo que necesita cada reproductor.

export type Servicio = 'spotify' | 'youtube'

export interface EnlaceSpotify {
  servicio: 'spotify'
  tipo: 'track' | 'playlist' | 'album' | 'episode' | 'show' | 'artist'
  id: string
  /** Formato que usa la API del reproductor: spotify:track:ID */
  uri: string
  /** Página para abrir en Spotify. */
  web: string
}

export interface EnlaceYoutube {
  servicio: 'youtube'
  videoId?: string
  listaId?: string
  /** Segundo de inicio si el enlace lo indica (?t=90). */
  inicio?: number
  web: string
}

export type EnlaceMusical = EnlaceSpotify | EnlaceYoutube

const TIPOS_SPOTIFY = ['track', 'playlist', 'album', 'episode', 'show', 'artist'] as const
const ID_SPOTIFY = /^[A-Za-z0-9]{22}$/
const ID_YOUTUBE = /^[A-Za-z0-9_-]{11}$/

export const AYUDA_ENLACE =
  'Pega un enlace de Spotify (canción, lista o álbum) o de YouTube. En Spotify: «Compartir» › «Copiar enlace».'

/** Devuelve el enlace interpretado, o un texto de error que explica qué falla. */
export function interpretarEnlace(texto: string): EnlaceMusical | string {
  const limpio = texto.trim()
  if (!limpio) return 'Falta el enlace de la canción.'

  // spotify:track:ID
  const uri = limpio.match(/^spotify:([a-z]+):([A-Za-z0-9]{22})$/)
  if (uri) return spotify(uri[1], uri[2]) ?? 'Ese tipo de enlace de Spotify no se puede reproducir.'

  let url: URL
  try {
    url = new URL(/^https?:\/\//i.test(limpio) ? limpio : `https://${limpio}`)
  } catch {
    return 'No parece un enlace. ' + AYUDA_ENLACE
  }
  const host = url.hostname.replace(/^www\.|^m\./, '')

  if (host === 'open.spotify.com' || host === 'play.spotify.com') {
    // /track/ID, /intl-es/track/ID, /embed/track/ID
    const partes = url.pathname.split('/').filter((p) => p && !p.startsWith('intl-') && p !== 'embed')
    const [tipo, id] = partes
    if (!tipo || !id) return 'Este enlace de Spotify no apunta a una canción, lista o álbum.'
    return spotify(tipo, id) ?? 'Este enlace de Spotify no apunta a una canción, lista o álbum.'
  }
  if (host === 'spotify.link' || host === 'spotify.app.link') {
    return 'Los enlaces cortos de Spotify no se pueden leer. Abre el enlace y copia la dirección completa (open.spotify.com/…).'
  }

  if (host === 'youtu.be') {
    return youtube(url.pathname.slice(1), url.searchParams.get('list'), url) ?? 'Este enlace de YouTube no tiene un vídeo válido.'
  }
  if (host === 'youtube.com' || host === 'music.youtube.com' || host === 'youtube-nocookie.com') {
    const p = url.pathname.split('/').filter(Boolean)
    const video =
      url.searchParams.get('v') ?? (['shorts', 'embed', 'live', 'v'].includes(p[0]) ? p[1] : null)
    return (
      youtube(video, url.searchParams.get('list'), url) ??
      'Este enlace de YouTube no apunta a un vídeo ni a una lista.'
    )
  }

  return 'Solo se admiten enlaces de Spotify o YouTube. ' + AYUDA_ENLACE
}

function spotify(tipo: string, id: string): EnlaceSpotify | null {
  const t = TIPOS_SPOTIFY.find((x) => x === tipo)
  if (!t || !ID_SPOTIFY.test(id)) return null
  return { servicio: 'spotify', tipo: t, id, uri: `spotify:${t}:${id}`, web: `https://open.spotify.com/${t}/${id}` }
}

function youtube(video: string | null, lista: string | null, url: URL): EnlaceYoutube | null {
  const videoId = video && ID_YOUTUBE.test(video) ? video : undefined
  const listaId = lista && /^[A-Za-z0-9_-]{10,}$/.test(lista) ? lista : undefined
  if (!videoId && !listaId) return null
  const t = url.searchParams.get('t') ?? url.searchParams.get('start')
  const inicio = t ? segundos(t) : undefined
  const web = videoId
    ? `https://www.youtube.com/watch?v=${videoId}${listaId ? `&list=${listaId}` : ''}`
    : `https://www.youtube.com/playlist?list=${listaId}`
  return { servicio: 'youtube', videoId, listaId, inicio, web }
}

/** "90", "90s", "1m30s" → 90 */
function segundos(t: string): number | undefined {
  if (/^\d+$/.test(t)) return Number(t)
  const m = t.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/)
  if (!m || !m[0]) return undefined
  return Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0)
}

export function nombreServicio(s: Servicio): string {
  return s === 'spotify' ? 'Spotify' : 'YouTube'
}

/** «canción de Spotify», «lista de YouTube»… */
export function describirEnlace(e: EnlaceMusical): string {
  if (e.servicio === 'youtube') return e.listaId && !e.videoId ? 'lista de YouTube' : 'vídeo de YouTube'
  const tipo = { track: 'canción', playlist: 'lista', album: 'álbum', episode: 'episodio', show: 'pódcast', artist: 'artista' }[e.tipo]
  return `${tipo} de Spotify`
}
