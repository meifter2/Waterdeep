import { almacenamientoSeguro } from '../data/storage'

// Recibe lo que se comparte desde otra app de Android (Spotify, YouTube…).
// El manifiesto declara un «share target»: Android abre la app con ?title=&text=&url=.
// Se guarda en el navegador para que sobreviva al inicio de sesión con Google.

const CLAVE = 'banda-sonora:compartido'
const CADUCIDAD_MS = 60 * 60 * 1000

export interface Compartido {
  enlace: string
  /** Texto que acompañaba al enlace (a menudo el título de la canción). */
  texto: string
}

const PATRON_ENLACE = /https?:\/\/[^\s]+|spotify:[a-z]+:[A-Za-z0-9]{22}/i

export function extraerEnlace(texto: string): string | null {
  const m = texto.match(PATRON_ENLACE)
  return m ? m[0].replace(/[).,;!?»"']+$/, '') : null
}

/** Llamar al arrancar: si la app se abrió desde «Compartir», guarda lo recibido y limpia la dirección. */
export function capturarCompartido() {
  const q = new URLSearchParams(window.location.search)
  const partes = ['url', 'text', 'title'].map((k) => q.get(k)?.trim() ?? '').filter(Boolean)
  if (partes.length === 0) return
  const todo = partes.join(' ')
  const enlace = extraerEnlace(todo) ?? ''
  const texto = [q.get('title'), q.get('text')]
    .map((t) => (t ?? '').replace(PATRON_ENLACE, '').replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .filter((t, i, l) => l.indexOf(t) === i)
    .join(' · ')
    .slice(0, 300)
  almacenamientoSeguro.setItem(CLAVE, JSON.stringify({ enlace: enlace || todo.slice(0, 500), texto, momento: Date.now() }))
  window.history.replaceState(null, '', window.location.pathname + window.location.hash)
}

/** Devuelve lo compartido pendiente (y lo olvida), o null. */
export function tomarCompartido(): Compartido | null {
  const bruto = almacenamientoSeguro.getItem(CLAVE)
  if (!bruto) return null
  almacenamientoSeguro.removeItem(CLAVE)
  try {
    const d = JSON.parse(bruto) as Compartido & { momento: number }
    if (Date.now() - d.momento > CADUCIDAD_MS) return null
    return { enlace: d.enlace ?? '', texto: d.texto ?? '' }
  } catch {
    return null
  }
}
