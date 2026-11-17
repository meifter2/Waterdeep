import type { EnlaceSpotify } from '../../lib/enlaces'
import {
  ErrorSpotify,
  elegirDispositivo,
  estadoActual,
  fijarVolumenSpotify,
  modoRepetir,
  pausar,
  reanudar,
  reproducirEn,
  suenaEsto,
  type Dispositivo,
} from '../../lib/spotifyApi'
import type { Informe, Segmento } from './motor'

// Controla la app de Spotify del usuario (móvil u ordenador) con la Web API: canciones completas.
// Reglas:
// - Cada orden tiene un turno («generacion»). Lo que llega tarde de un turno anterior se descarta.
// - Las órdenes de reproducir van en cola: si se pulsan varias tarjetas seguidas, solo se ejecuta la última.
// - DFY no supone lo que suena: lo pregunta a Spotify (canción, contexto, dispositivo, progreso).

const SONDEO_MS = 4000
const COMPROBAR_MS = 1500
const VOLUMEN_CADA_MS = 350

export interface InfoVolumen {
  valor?: number | null
  soporta?: boolean
  dispositivo?: string
}

const AVISO_OTRA = 'En Spotify está sonando otra cosa. Pulsa la tarjeta para volver a su canción.'
const AVISO_NO_EMPIEZA = 'Spotify ha recibido la orden pero no ha empezado a sonar. Revisa la app de Spotify.'

export class MotorSpotifyConnect {
  private repetir = true
  private dispositivo: Dispositivo | null = null
  private actual: EnlaceSpotify | null = null
  private seg: Segmento = { inicio: null, fin: null }
  private sonando = false
  private generacion = 0
  private cola: Promise<unknown> = Promise.resolve()
  private sondeo = 0
  private corte = 0
  private comprobacion = 0
  // Volumen: se envía como mucho cada VOLUMEN_CADA_MS y siempre el último valor pedido.
  private volumenPendiente: number | null = null
  private volumenOcupado = false
  private ultimoCambioVolumen = 0

  constructor(
    private informar: Informe,
    private alDispositivo: (nombre: string) => void,
    private alVolumen: (v: InfoVolumen) => void,
  ) {}

  private get suelta() {
    return this.actual?.tipo === 'track' || this.actual?.tipo === 'episode'
  }

  private vigente(g: number) {
    return g === this.generacion
  }

  /**
   * Reproduce SIEMPRE la pista pedida. Si es la misma que ya se pidió y Spotify la tiene sonando, no la reinicia;
   * si la tiene en pausa, la reanuda; si Spotify cambió a otra cosa, la vuelve a poner.
   */
  reproducir(e: EnlaceSpotify, seg: Segmento, misma: boolean): Promise<void> {
    const g = ++this.generacion
    this.actual = e
    this.seg = seg
    this.limpiarTemporizadores()
    const tarea = this.cola
      .then(() => this.ejecutar(g, e, seg, misma))
      .catch((err) => {
        // El error de una orden ya sustituida por otra no se muestra.
        if (this.vigente(g)) throw err
      })
    this.cola = tarea.catch(() => {})
    return tarea
  }

  private async ejecutar(g: number, e: EnlaceSpotify, seg: Segmento, misma: boolean) {
    if (!this.vigente(g)) return // ya hay una orden más nueva
    if (misma) {
      const s = await estadoActual().catch(() => null)
      if (!this.vigente(g)) return
      if (suenaEsto(s, e)) {
        if (s!.dispositivo) this.usarDispositivo(s!.dispositivo)
        if (!s!.sonando) await reanudar(this.dispositivo?.id)
        if (!this.vigente(g)) return
        this.sonando = true
        this.informar('sonando', '')
        this.programarCorte(g, s!.progreso ?? seg.inicio ?? 0)
        this.empezarSondeo(g)
        return
      }
    }
    const d = await elegirDispositivo()
    if (!this.vigente(g)) return
    if (!d) throw new ErrorSpotify('sin-dispositivo')
    this.usarDispositivo(d)
    await reproducirEn(d, e, seg.inicio)
    if (!this.vigente(g)) return
    this.sonando = true
    this.informar('sonando', '')
    this.aplicarRepetir()
    this.programarCorte(g, seg.inicio ?? 0)
    this.empezarSondeo(g)
    // Spotify acepta la orden antes de sonar: se comprueba que de verdad suena lo pedido.
    this.comprobacion = window.setTimeout(() => {
      void estadoActual()
        .then((s) => {
          if (!this.vigente(g)) return
          if (s && s.sonando && suenaEsto(s, e)) return
          this.sonando = false
          this.informar('pausa', s && s.uri && !suenaEsto(s, e) ? AVISO_OTRA : AVISO_NO_EMPIEZA)
        })
        .catch(() => {})
    }, COMPROBAR_MS)
  }

  private usarDispositivo(d: Dispositivo) {
    const cambia = this.dispositivo?.id !== d.id
    this.dispositivo = d
    this.alDispositivo(d.nombre)
    // El volumen se LEE del dispositivo; nunca se fuerza un valor al conectar.
    if (cambia || Date.now() - this.ultimoCambioVolumen > 2500)
      this.alVolumen({ valor: d.volumen, soporta: d.soportaVolumen, dispositivo: d.nombre })
  }

  alternar() {
    const g = this.generacion
    const id = this.dispositivo?.id
    const siguiente = !this.sonando
    window.clearTimeout(this.corte)
    ;(siguiente ? reanudar(id) : pausar(id))
      .then(async () => {
        if (!this.vigente(g)) return
        this.sonando = siguiente
        this.informar(siguiente ? 'sonando' : 'pausa')
        if (siguiente && this.seg.fin != null) {
          const s = await estadoActual().catch(() => null)
          if (this.vigente(g)) this.programarCorte(g, s?.progreso ?? this.seg.inicio ?? 0)
        }
      })
      .catch((err: unknown) => this.informar('error', err instanceof ErrorSpotify ? err.message : 'Spotify no ha respondido.'))
  }

  detener() {
    this.generacion++
    this.limpiarTemporizadores()
    if (this.sonando) pausar(this.dispositivo?.id).catch(() => {})
    this.sonando = false
  }

  fijarRepetir(valor: boolean) {
    this.repetir = valor
    if (this.sonando) this.aplicarRepetir()
  }

  /** Cambia el volumen del dispositivo de Spotify (limitado en frecuencia; siempre el último valor). */
  fijarVolumen(valor: number) {
    this.ultimoCambioVolumen = Date.now()
    this.volumenPendiente = valor
    if (!this.volumenOcupado) void this.enviarVolumen()
  }

  private async enviarVolumen() {
    const valor = this.volumenPendiente
    if (valor == null || !this.dispositivo) return
    this.volumenOcupado = true
    this.volumenPendiente = null
    let espera = VOLUMEN_CADA_MS
    try {
      await fijarVolumenSpotify(valor, this.dispositivo.id)
    } catch (err) {
      if (err instanceof ErrorSpotify && err.codigo === 'limite') {
        if (this.volumenPendiente == null) this.volumenPendiente = valor
        espera = err.esperar * 1000
      } else if (err instanceof ErrorSpotify && err.codigo === 'sin-volumen') {
        this.volumenPendiente = null
        this.alVolumen({ soporta: false })
        this.informar(this.sonando ? 'sonando' : 'pausa', err.message)
      } else this.informar(this.sonando ? 'sonando' : 'pausa', err instanceof ErrorSpotify ? err.message : 'No se ha podido cambiar el volumen de Spotify.')
    }
    window.setTimeout(() => {
      this.volumenOcupado = false
      if (this.volumenPendiente != null) void this.enviarVolumen()
    }, espera)
  }

  private aplicarRepetir() {
    if (!this.actual) return
    // Con tramo, la repetición la hace la app (Spotify repetiría la canción entera).
    const modo = !this.repetir || (this.suelta && this.seg.fin != null) ? 'off' : this.suelta ? 'track' : 'context'
    modoRepetir(modo, this.dispositivo?.id).catch(() => {})
  }

  /** Fin del tramo (aproximado). Antes de actuar, comprueba que Spotify sigue con ESTA canción. */
  private programarCorte(g: number, posicion: number) {
    window.clearTimeout(this.corte)
    if (this.seg.fin == null || !this.suelta) return
    this.corte = window.setTimeout(async () => {
      if (!this.vigente(g) || !this.sonando || !this.dispositivo || !this.actual) return
      const s = await estadoActual().catch(() => null)
      if (!this.vigente(g) || !s || !suenaEsto(s, this.actual)) return
      if (this.repetir)
        reproducirEn(this.dispositivo, this.actual, this.seg.inicio)
          .then(() => this.vigente(g) && this.programarCorte(g, this.seg.inicio ?? 0))
          .catch(() => {})
      else
        pausar(this.dispositivo.id)
          .then(() => {
            if (!this.vigente(g)) return
            this.sonando = false
            this.informar('pausa')
          })
          .catch(() => {})
    }, Math.max(0, this.seg.fin - posicion))
  }

  /** Refleja lo que pasa en la app de Spotify: pausas, otra canción, cambio de dispositivo o de volumen. */
  private empezarSondeo(g: number) {
    window.clearInterval(this.sondeo)
    this.sondeo = window.setInterval(() => {
      if (!this.vigente(g) || !this.actual) return
      const e = this.actual
      estadoActual()
        .then((s) => {
          if (!this.vigente(g)) return
          if (s?.dispositivo) this.usarDispositivo(s.dispositivo)
          if (s && s.uri && !suenaEsto(s, e)) {
            // Han cambiado la canción desde fuera: DFY deja de considerarla suya.
            this.sonando = false
            window.clearTimeout(this.corte)
            this.informar('otra', AVISO_OTRA)
            return
          }
          const sonando = !!s?.sonando
          if (sonando === this.sonando) return
          this.sonando = sonando
          if (!sonando) window.clearTimeout(this.corte)
          this.informar(sonando ? 'sonando' : 'pausa')
        })
        .catch(() => {})
    }, SONDEO_MS)
  }

  private limpiarTemporizadores() {
    window.clearInterval(this.sondeo)
    window.clearTimeout(this.corte)
    window.clearTimeout(this.comprobacion)
  }
}
