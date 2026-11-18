// Comprueba un enlace directo de audio ANTES de guardarlo: el navegador lo abre (sin sonar) y lee su duración.
// Si el servidor no lo entrega (no existe, no es audio, bloquea su uso desde otras webs…), no se guarda.
// No descarga el archivo entero: solo lo justo para leer los datos del principio (streaming).

const LIMITE_MS = 15000

export class ErrorEnlaceAudio extends Error {}

export function comprobarAudio(url: string): Promise<{ duracion_ms: number | null }> {
  return new Promise((resolver, rechazar) => {
    const a = new Audio()
    a.preload = 'metadata'
    a.muted = true
    let hecho = false
    const terminar = (fn: () => void) => {
      if (hecho) return
      hecho = true
      window.clearTimeout(limite)
      a.removeAttribute('src')
      a.load()
      fn()
    }
    const limite = window.setTimeout(
      () => terminar(() => rechazar(new ErrorEnlaceAudio('El enlace tarda demasiado en responder. Revisa que funcione y vuelve a intentarlo.'))),
      LIMITE_MS,
    )
    a.addEventListener('loadedmetadata', () => {
      // La duración se lee ANTES de soltar el audio (al soltarlo, el navegador la borra).
      const duracion_ms = Number.isFinite(a.duration) && a.duration > 0 ? Math.round(a.duration * 1000) : null
      terminar(() => resolver({ duracion_ms }))
    })
    a.addEventListener('error', () =>
      terminar(() =>
        rechazar(
          new ErrorEnlaceAudio(
            a.error?.code === 4
              ? 'No se puede usar este enlace: no es un audio que el navegador pueda reproducir, ya no existe o su web no permite usarlo desde otras páginas.'
              : 'No se ha podido abrir el enlace. Revisa la conexión y que el enlace funcione.',
          ),
        ),
      ),
    )
    a.src = url
  })
}
