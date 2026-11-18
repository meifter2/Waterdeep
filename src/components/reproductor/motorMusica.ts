import type { Informe, Segmento } from './motor'
import { MotorArchivo } from './motorArchivo'

// Música del canal principal con fundidos (fase 2B). Dos reproductores de archivo que se turnan:
// - Al cambiar de una música propia (archivo o enlace de audio) a otra, la nueva entra con fundido y la anterior
//   sale con fundido A LA VEZ (crossfade). La anterior empieza a bajar solo cuando la nueva SUENA de verdad:
//   si la nueva falla al cargar, la anterior sigue sonando.
// - Nunca hay más de dos: si llega una tercera durante un cruce, la más antigua se corta y se suelta.
// - Detener, liberar y pausar son instantáneos (Detener todo es el botón de emergencia).
// Mismo uso que MotorArchivo, para que el Reproductor no tenga que cambiar su lógica.

export interface Fundidos {
  entrada: number
  salida: number
}

export class MotorMusica {
  repetir = false
  alFin?: () => void
  private a: MotorArchivo
  private b: MotorArchivo
  /** La que manda (la que informa al reproductor). */
  private actual: MotorArchivo
  /** La que se está apagando en un cruce. */
  private saliente: MotorArchivo | null = null
  /** La que está cargando para entrar en un cruce (la actual sigue sonando mientras). */
  private entrante: MotorArchivo | null = null
  private turno = 0

  constructor(
    private informar: Informe,
    private fundidos: () => Fundidos = () => ({ entrada: 0, salida: 0 }),
  ) {
    const crear = () => {
      const m: MotorArchivo = new MotorArchivo((e, aviso) => this.avisoDe(m, e, aviso))
      m.alFin = () => {
        if (m === this.actual) this.alFin?.()
      }
      return m
    }
    this.a = crear()
    this.b = crear()
    this.actual = this.a
  }

  /** Solo informa quien manda: la que entra (mientras carga) o la actual. La que sale no dice nada. */
  private avisoDe(m: MotorArchivo, e: Parameters<Informe>[0], aviso?: string) {
    if (m === this.entrante) {
      if (e === 'sonando') this.completarEntrada(m)
      else if (e === 'error') {
        // La nueva no carga: la anterior sigue sonando; se informa del error de la nueva.
        this.entrante = null
        m.liberar()
      }
      this.informar(e, aviso)
      return
    }
    if (m === this.actual && !this.entrante) this.informar(e, aviso)
  }

  /** La nueva ya suena: la anterior sale con fundido y la nueva pasa a mandar. */
  private completarEntrada(nueva: MotorArchivo) {
    const anterior = this.actual
    this.entrante = null
    this.actual = nueva
    this.cortarSaliente()
    this.saliente = anterior
    const t = ++this.turno
    void anterior.fundir(0, this.fundidos().salida).then((completo) => {
      if (completo && t === this.turno && this.saliente === anterior) this.cortarSaliente()
    })
  }

  private cortarSaliente() {
    const s = this.saliente
    this.saliente = null
    if (s && s !== this.actual) s.liberar()
  }

  private otra(m: MotorArchivo) {
    return m === this.a ? this.b : this.a
  }

  /** Para las pruebas y el reproductor: el elemento de audio de la música que manda. */
  get elemento() {
    return (this.entrante ?? this.actual).elemento
  }

  fijarVolumen(volumen: number, silenciado: boolean) {
    this.a.fijarVolumen(volumen, silenciado)
    this.b.fijarVolumen(volumen, silenciado)
  }

  fijarRepetir(valor: boolean) {
    this.repetir = valor
    this.a.fijarRepetir(valor)
    this.b.fijarRepetir(valor)
  }

  async reproducir(url: string, seg: Segmento, misma = false) {
    const { entrada } = this.fundidos()
    // La misma pista (reanudar) o nada sonando: un solo reproductor, entrando con fundido si se pidió.
    if (misma && !this.entrante) {
      this.cortarSaliente()
      return this.actual.reproducir(url, seg, true)
    }
    if (!this.actual.suena || (entrada <= 0 && this.fundidos().salida <= 0)) {
      this.cancelarCruce()
      const m = this.actual
      for (const x of [this.a, this.b]) if (x !== m) x.liberar()
      m.repetir = this.repetir
      m.entrarCon(entrada)
      return m.reproducir(url, seg)
    }
    // Cruce: la nueva carga en el otro reproductor mientras la actual sigue sonando.
    if (this.entrante) {
      // Ya había una cargando: se descarta (cambios muy rápidos).
      this.entrante.liberar()
      this.entrante = null
    }
    if (this.saliente) this.cortarSaliente() // la más antigua de un cruce anterior: fuera
    const nueva = this.otra(this.actual)
    nueva.repetir = this.repetir
    nueva.entrarCon(entrada)
    this.entrante = nueva
    return nueva.reproducir(url, seg)
  }

  /** Termina cualquier cruce al instante: suelta la que sale y la que entra (la actual queda a volumen completo). */
  private cancelarCruce() {
    this.turno++
    if (this.entrante) {
      this.entrante.liberar()
      this.entrante = null
    }
    this.cortarSaliente()
  }

  alternar() {
    // Pausar o reanudar en mitad de un cruce: el cruce se resuelve al momento y se actúa sobre la que manda.
    if (this.entrante) {
      const e = this.entrante
      if (e.suena) this.completarEntrada(e)
      else {
        this.entrante = null
        e.liberar()
      }
    }
    this.cortarSaliente()
    void this.actual.fundir(1, 0)
    this.actual.alternar()
  }

  /** Para todo al instante (también el cruce). */
  detener() {
    this.cancelarCruce()
    this.a.detener()
    this.b.detener()
  }

  liberar() {
    this.cancelarCruce()
    this.a.liberar()
    this.b.liberar()
  }

  /** Para las pruebas: estado de los dos reproductores. */
  diagnostico() {
    return [this.a, this.b].map((m) => ({
      rol: m === this.entrante ? 'entrante' : m === this.saliente ? 'saliente' : m === this.actual ? 'actual' : 'libre',
      src: m.elemento.getAttribute('src') ?? '',
      pausado: m.elemento.paused,
      volumen: m.elemento.volume,
      silenciado: m.elemento.muted,
      nivel: m.nivel,
    }))
  }
}
