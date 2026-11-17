import type { EstadoReproduccion } from '../../data/reproduccion'

/** Cómo un motor (Spotify, YouTube, archivo) comunica su estado al reproductor. */
export type Informe = (estado: EstadoReproduccion, aviso?: string) => void

/** Tramo de la pista en milisegundos (null = desde el principio / hasta el final). */
export interface Segmento {
  inicio: number | null
  fin: number | null
}

/** URL del reproductor básico, por si la API oficial no carga (el máster pulsa ▶ a mano). */
export function urlRespaldo(
  e: { servicio: 'spotify'; tipo: string; id: string } | { servicio: 'youtube'; videoId?: string; listaId?: string },
  inicioMs: number | null = null,
): string {
  if (e.servicio === 'spotify') return `https://open.spotify.com/embed/${e.tipo}/${e.id}`
  const inicio = inicioMs ? `&start=${Math.floor(inicioMs / 1000)}` : ''
  return e.videoId
    ? `https://www.youtube.com/embed/${e.videoId}?autoplay=1&playsinline=1${inicio}`
    : `https://www.youtube.com/embed/videoseries?list=${e.listaId}&autoplay=1`
}
