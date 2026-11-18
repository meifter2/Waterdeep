import type { Informe, Segmento } from './motor'

// Reproduce archivos propios con el reproductor de audio del navegador.
// Tramo preciso y reproducible: se coloca en el inicio antes de sonar y un temporizador
// (recalculado con cada «timeupdate») corta o repite exactamente en el fin.

const MARGEN_MS = 12

export class MotorArchivo {
  repetir = false
  /** Aviso opcional al terminar la pista sin repetir (lo usan los efectos de la mezcla). */
  alFin?: () => void
  private audio: HTMLAudioElement
  private seg: Segmento = { inicio: null, fin: null }
  private temporizador = 0
  private parado = true
  private generacion = 0

  constructor(private informar: Informe) {
    const a = new Audio()
    a.preload = 'auto'
    a.addEventListener('playing', () => {
      this.informar('sonando', '')
      this.programarFin()
    })
    a.addEventListener('pause', () => {
      window.clearTimeout(this.temporizador)
      if (!this.parado && !a.ended) this.informar('pausa')
    })
    a.addEventListener('waiting', () => this.informar('cargando'))
    a.addEventListener('timeupdate', () => this.comprobarFin())
    a.addEventListener('seeked', () => this.programarFin())
    a.addEventListener('ended', () => this.alTerminar())
    a.addEventListener('error', () => {
      if (this.parado) return
      const codigo = a.error?.code
      this.informar(
        'error',
        codigo === 4
          ? 'No se puede reproducir este archivo: el formato no es compatible o el enlace ha caducado. Recarga la página.'
          : 'No se ha podido cargar el archivo. Revisa la conexión.',
      )
    })
    this.audio = a
  }

  /** Para las pruebas: el elemento de audio interno. */
  get elemento() {
    return this.audio
  }

  /** Volumen 0–1 y silencio: se aplican al instante, también mientras suena. */
  fijarVolumen(volumen: number, silenciado: boolean) {
    this.audio.volume = Math.min(1, Math.max(0, volumen))
    this.audio.muted = silenciado
  }

  /** Reproduce la pista; si es la misma que ya está cargada, la reanuda (o sigue) en lugar de reiniciarla. */
  async reproducir(url: string, seg: Segmento, misma = false) {
    const g = ++this.generacion
    window.clearTimeout(this.temporizador)
    this.parado = false
    const a = this.audio
    if (misma && a.src === url && a.readyState > 0) {
      this.seg = seg
      if (!a.paused) {
        this.informar('sonando', '')
        return
      }
      if (seg.fin != null && a.currentTime * 1000 >= seg.fin - MARGEN_MS) a.currentTime = (seg.inicio ?? 0) / 1000
      await a.play().catch(() => this.informar('pausa', 'El navegador no ha dejado empezar el sonido. Pulsa «Reanudar».'))
      return
    }
    this.seg = seg
    if (a.src !== url) {
      a.src = url
      await new Promise<void>((resolver, rechazar) => {
        const ok = () => (limpiar(), resolver())
        const mal = () => (limpiar(), rechazar(new Error('carga')))
        const limpiar = () => {
          a.removeEventListener('loadedmetadata', ok)
          a.removeEventListener('error', mal)
        }
        a.addEventListener('loadedmetadata', ok)
        a.addEventListener('error', mal)
      }).catch(() => undefined)
    }
    if (g !== this.generacion) return // se ha pedido otra pista mientras cargaba
    a.loop = this.repetir && seg.fin == null && !seg.inicio
    a.currentTime = (seg.inicio ?? 0) / 1000
    try {
      await a.play()
    } catch (e) {
      if (e instanceof DOMException && e.name === 'NotAllowedError') this.informar('pausa', 'El navegador no ha dejado empezar el sonido. Pulsa «Reanudar».')
    }
  }

  alternar() {
    if (this.audio.paused) {
      if (this.seg.fin != null && this.audio.currentTime * 1000 >= this.seg.fin - MARGEN_MS) this.audio.currentTime = (this.seg.inicio ?? 0) / 1000
      void this.audio.play()
    } else this.audio.pause()
  }

  detener() {
    this.generacion++
    this.parado = true
    window.clearTimeout(this.temporizador)
    this.audio.pause()
  }

  /** Detiene y suelta el archivo (libera memoria y conexión). */
  liberar() {
    this.detener()
    this.audio.removeAttribute('src')
    this.audio.load()
  }

  fijarRepetir(valor: boolean) {
    this.repetir = valor
    this.audio.loop = valor && this.seg.fin == null && !this.seg.inicio
  }

  private programarFin() {
    window.clearTimeout(this.temporizador)
    if (this.seg.fin == null || this.audio.paused) return
    const resto = (this.seg.fin - this.audio.currentTime * 1000) / (this.audio.playbackRate || 1)
    this.temporizador = window.setTimeout(() => this.comprobarFin(), Math.max(0, resto - MARGEN_MS))
  }

  private comprobarFin() {
    if (this.seg.fin == null || this.audio.paused) return
    if (this.audio.currentTime * 1000 >= this.seg.fin - MARGEN_MS) this.alTerminar()
    else this.programarFin()
  }

  private alTerminar() {
    window.clearTimeout(this.temporizador)
    if (this.repetir) {
      this.audio.currentTime = (this.seg.inicio ?? 0) / 1000
      void this.audio.play()
      return
    }
    this.audio.pause()
    this.audio.currentTime = (this.seg.inicio ?? 0) / 1000
    this.informar('pausa')
    this.alFin?.()
  }
}
