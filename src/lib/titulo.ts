import type { EnlaceMusical } from './enlaces'

// Pide el título de la canción a Spotify o YouTube (oEmbed, público y sin clave).
// Si falla o tarda, devuelve null y no pasa nada: es solo una sugerencia.

export async function tituloDe(e: EnlaceMusical): Promise<string | null> {
  const url =
    e.servicio === 'spotify'
      ? `https://open.spotify.com/oembed?url=${encodeURIComponent(e.web)}`
      : `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(e.web)}`
  const control = new AbortController()
  const limite = setTimeout(() => control.abort(), 4000)
  try {
    const r = await fetch(url, { signal: control.signal })
    if (!r.ok) return null
    const j = (await r.json()) as { title?: unknown }
    return typeof j.title === 'string' ? j.title.slice(0, 300) : null
  } catch {
    return null
  } finally {
    clearTimeout(limite)
  }
}
