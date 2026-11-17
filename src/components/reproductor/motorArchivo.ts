import type { Informe, Segmento } from './motor'

// Reproduce archivos propios con el reproductor de audio del navegador.
// Tramo preciso y reproducible: se coloca en el inicio antes de sonar y un temporizador
// (recalculado con cada «timeupdate») corta o repite exactamente en el fin.

const MARGEN_MS = 12

export class MotorArchivo {
  repetir = false
  private audio: HTMLAudioElement
  private seg: Segmento = { inicio: null, fin: null }
  private temporizador = 0
  private parado = true

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

  async reproducir(url: string, seg: Segmento) {
    window.clearTimeout(this.temporizador)
    this.parado = false
    this.seg = seg
    const a = this.audio
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
    this.parado = true
    window.clearTimeout(this.temporizador)
    this.audio.pause()
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
  }
}
