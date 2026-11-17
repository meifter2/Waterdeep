import type { EnlaceSpotify } from '../../lib/enlaces'
import { ErrorSpotify, elegirDispositivo, estadoActual, modoRepetir, pausar, reanudar, reproducirEn, type Dispositivo } from '../../lib/spotifyApi'
import type { Informe, Segmento } from './motor'

// Controla la app de Spotify del usuario (móvil u ordenador) con la Web API: canciones completas.

const SONDEO_MS = 5000

export class MotorSpotifyConnect {
  private repetir = true
  private dispositivo: Dispositivo | null = null
  private actual: EnlaceSpotify | null = null
  private seg: Segmento = { inicio: null, fin: null }
  private sonando = false
  private sondeo = 0
  private corte = 0

  constructor(
    private informar: Informe,
    private alDispositivo: (nombre: string) => void,
  ) {}

  private get suelta() {
    return this.actual?.tipo === 'track' || this.actual?.tipo === 'episode'
  }

  async reproducir(e: EnlaceSpotify, seg: Segmento) {
    this.actual = e
    this.seg = seg
    window.clearTimeout(this.corte)
    const d = await elegirDispositivo()
    if (!d) throw new ErrorSpotify('sin-dispositivo')
    this.dispositivo = d
    await reproducirEn(d, e, seg.inicio)
    this.sonando = true
    this.alDispositivo(d.nombre)
    this.informar('sonando', '')
    this.aplicarRepetir()
    this.programarCorte(seg.inicio ?? 0)
    this.empezarSondeo()
  }

  alternar() {
    const id = this.dispositivo?.id
    const accion = this.sonando ? pausar(id) : reanudar(id)
    const siguiente = !this.sonando
    window.clearTimeout(this.corte)
    accion
      .then(async () => {
        this.sonando = siguiente
        this.informar(siguiente ? 'sonando' : 'pausa')
        if (siguiente && this.seg.fin != null) {
          const s = await estadoActual().catch(() => null)
          this.programarCorte(s?.progreso ?? this.seg.inicio ?? 0)
        }
      })
      .catch((err: unknown) => this.informar('error', err instanceof ErrorSpotify ? err.message : 'Spotify no ha respondido.'))
  }

  detener() {
    window.clearInterval(this.sondeo)
    window.clearTimeout(this.corte)
    if (this.sonando) pausar(this.dispositivo?.id).catch(() => {})
    this.sonando = false
  }

  fijarRepetir(valor: boolean) {
    this.repetir = valor
    if (this.sonando) this.aplicarRepetir()
  }

  private aplicarRepetir() {
    if (!this.actual) return
    // Con tramo, la repetición la hace la app (Spotify repetiría la canción entera).
    const modo = !this.repetir || (this.suelta && this.seg.fin != null) ? 'off' : this.suelta ? 'track' : 'context'
    modoRepetir(modo, this.dispositivo?.id).catch(() => {})
  }

  /** Fin del tramo (aproximado): un temporizador desde la posición actual. */
  private programarCorte(posicion: number) {
    window.clearTimeout(this.corte)
    if (this.seg.fin == null || !this.suelta) return
    this.corte = window.setTimeout(() => {
      if (!this.sonando || !this.dispositivo || !this.actual) return
      if (this.repetir)
        reproducirEn(this.dispositivo, this.actual, this.seg.inicio)
          .then(() => this.programarCorte(this.seg.inicio ?? 0))
          .catch(() => {})
      else
        pausar(this.dispositivo.id)
          .then(() => {
            this.sonando = false
            this.informar('pausa')
          })
          .catch(() => {})
    }, Math.max(0, this.seg.fin - posicion))
  }

  /** Si se pausa o reanuda desde la app de Spotify, la barra lo refleja. */
  private empezarSondeo() {
    window.clearInterval(this.sondeo)
    this.sondeo = window.setInterval(() => {
      estadoActual()
        .then((s) => {
          if (!s || s.sonando === this.sonando) return
          this.sonando = s.sonando
          if (!s.sonando) window.clearTimeout(this.corte)
          this.informar(s.sonando ? 'sonando' : 'pausa')
        })
        .catch(() => {})
    }, SONDEO_MS)
  }
}
