import type { EstadoReproduccion } from '../../data/reproduccion'

/** Cómo un motor (Spotify o YouTube) comunica su estado al reproductor. */
export type Informe = (estado: EstadoReproduccion, aviso?: string) => void

/** URL del reproductor básico, por si la API oficial no carga (el máster pulsa ▶ a mano). */
export function urlRespaldo(
  e: { servicio: 'spotify'; tipo: string; id: string } | { servicio: 'youtube'; videoId?: string; listaId?: string },
): string {
  if (e.servicio === 'spotify') return `https://open.spotify.com/embed/${e.tipo}/${e.id}`
  return e.videoId
    ? `https://www.youtube.com/embed/${e.videoId}?autoplay=1&playsinline=1`
    : `https://www.youtube.com/embed/videoseries?list=${e.listaId}&autoplay=1`
}
