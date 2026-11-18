import type { Informe, Segmento } from './motor'

// Reproduce archivos propios con el reproductor de audio del navegador.
// Tramo preciso y reproducible: se coloca en el inicio antes de sonar y un temporizador
// (recalculado con cada «timeupdate») corta o repite exactamente en el fin.
//
// Fundidos (fase 2B): el volumen real es volumen × fundido. El fundido es un factor 0–1 que se mueve por TIEMPO
// transcurrido (si el navegador espacia los temporizadores, la duración se respeta), con curvas de igual potencia
// para que al cruzar dos pistas el volumen conjunto no baje. Cambiar el volumen o silenciar durante un fundido se
// aplica al momento; detener cancela el fundido.

const MARGEN_MS = 12
const PASO_FUNDIDO_MS = 30
const limitar = (v: number) => Math.min(1, Math.max(0, v))

export class MotorArchivo {
  repetir = false
  /** Aviso opcional al terminar la pista sin repetir (lo usan los efectos de la mezcla). */
  alFin?: () => void
  private audio: HTMLAudioElement
  private seg: Segmento = { inicio: null, fin: null }
  private temporizador = 0
  private parado = true
  private generacion = 0
  private base = 1
  private factor = 1
  private fundido = 0
  private finFundido: ((completo: boolean) => void) | null = null
  /** Fundido de entrada pendiente: se aplica cuando el audio empieza a sonar de verdad. */
  private entradaPendiente = 0

  constructor(private informar: Informe) {
    const a = new Audio()
    a.preload = 'auto'
    a.addEventListener('playing', () => {
      if (this.entradaPendiente > 0) {
        const ms = this.entradaPendiente
        this.entradaPendiente = 0
        void this.fundir(1, ms)
      }
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
          ? 'No se puede reproducir este audio: el formato no es compatible o el enlace ya no funciona (ha caducado, ya no existe o su web no permite usarlo desde otras páginas).'
          : 'No se ha podido cargar el audio. Revisa la conexión.',
      )
    })
    this.audio = a
  }

  /** Para las pruebas: el elemento de audio interno. */
  get elemento() {
    return this.audio
  }

  /** Volumen 0–1 y silencio: se aplican al instante, también mientras suena (y durante un fundido). */
  fijarVolumen(volumen: number, silenciado: boolean) {
    this.base = limitar(volumen)
    this.audio.muted = silenciado
    this.aplicar()
  }

  private aplicar() {
    this.audio.volume = limitar(this.base * this.factor)
  }

  /** Nivel actual del fundido (0–1). */
  get nivel() {
    return this.factor
  }

  /** ¿Está sonando ahora mismo (no en pausa ni detenido)? */
  get suena() {
    return !this.parado && !this.audio.paused
  }

  /**
   * Lleva el fundido hasta `hasta` (0–1) en `ms`, desde donde esté. Cancela el fundido anterior.
   * Devuelve true si llega al final y false si se cancela (otra orden, detener, liberar).
   */
  fundir(hasta: number, ms: number): Promise<boolean> {
    this.cancelarFundido()
    const desde = this.factor
    if (ms <= 0 || desde === hasta) {
      this.factor = hasta
      this.aplicar()
      return Promise.resolve(true)
    }
    const inicio = performance.now()
    return new Promise((resolver) => {
      this.finFundido = resolver
      const paso = () => {
        const t = Math.min(1, (performance.now() - inicio) / ms)
        // Igual potencia: sube con seno y baja con coseno.
        const forma = hasta > desde ? Math.sin((t * Math.PI) / 2) : 1 - Math.cos((t * Math.PI) / 2)
        this.factor = desde + (hasta - desde) * forma
        this.aplicar()
        if (t < 1) {
          this.fundido = window.setTimeout(paso, PASO_FUNDIDO_MS)
          return
        }
        this.fundido = 0
        const fin = this.finFundido
        this.finFundido = null
        fin?.(true)
      }
      paso()
    })
  }

  cancelarFundido() {
    window.clearTimeout(this.fundido)
    this.fundido = 0
    const fin = this.finFundido
    this.finFundido = null
    fin?.(false)
  }

  /** La próxima vez que empiece a sonar, entra con un fundido de `ms` (0 = a volumen completo, sin fundido). */
  entrarCon(ms: number) {
    this.cancelarFundido()
    this.entradaPendiente = Math.max(0, ms)
    this.factor = ms > 0 ? 0 : 1
    this.aplicar()
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
    // Distinta dirección, o la misma que falló antes (reintento): se vuelve a pedir al servidor.
    if (a.src !== url || a.error) {
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

  /** Para al instante (cancela cualquier fundido) y deja el volumen listo para la próxima vez. */
  detener() {
    this.generacion++
    this.parado = true
    window.clearTimeout(this.temporizador)
    this.cancelarFundido()
    this.entradaPendiente = 0
    this.audio.pause()
    this.factor = 1
    this.aplicar()
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
