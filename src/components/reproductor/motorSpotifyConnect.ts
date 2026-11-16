import type { EnlaceSpotify } from '../../lib/enlaces'
import { ErrorSpotify, elegirDispositivo, estadoActual, modoRepetir, pausar, reanudar, reproducirEn, type Dispositivo } from '../../lib/spotifyApi'
import type { Informe } from './motor'

// Controla la app de Spotify del usuario (móvil u ordenador) con la Web API: canciones completas.

const SONDEO_MS = 5000

export class MotorSpotifyConnect {
  private repetir = true
  private dispositivo: Dispositivo | null = null
  private actual: EnlaceSpotify | null = null
  private sonando = false
  private sondeo = 0

  constructor(
    private informar: Informe,
    private alDispositivo: (nombre: string) => void,
  ) {}

  async reproducir(e: EnlaceSpotify) {
    this.actual = e
    const d = await elegirDispositivo()
    if (!d) throw new ErrorSpotify('sin-dispositivo')
    this.dispositivo = d
    await reproducirEn(d, e)
    this.sonando = true
    this.alDispositivo(d.nombre)
    this.informar('sonando', '')
    this.aplicarRepetir()
    this.empezarSondeo()
  }

  alternar() {
    const id = this.dispositivo?.id
    const accion = this.sonando ? pausar(id) : reanudar(id)
    const siguiente = !this.sonando
    accion
      .then(() => {
        this.sonando = siguiente
        this.informar(siguiente ? 'sonando' : 'pausa')
      })
      .catch((err: unknown) => this.informar('error', err instanceof ErrorSpotify ? err.message : 'Spotify no ha respondido.'))
  }

  detener() {
    window.clearInterval(this.sondeo)
    if (this.sonando) pausar(this.dispositivo?.id).catch(() => {})
    this.sonando = false
  }

  fijarRepetir(valor: boolean) {
    this.repetir = valor
    if (this.sonando) this.aplicarRepetir()
  }

  private aplicarRepetir() {
    if (!this.actual) return
    const modo = !this.repetir ? 'off' : this.actual.tipo === 'track' || this.actual.tipo === 'episode' ? 'track' : 'context'
    modoRepetir(modo, this.dispositivo?.id).catch(() => {})
  }

  /** Si se pausa o reanuda desde la app de Spotify, la barra lo refleja. */
  private empezarSondeo() {
    window.clearInterval(this.sondeo)
    this.sondeo = window.setInterval(() => {
      estadoActual()
        .then((s) => {
          if (!s || s.sonando === this.sonando) return
          this.sonando = s.sonando
          this.informar(s.sonando ? 'sonando' : 'pausa')
        })
        .catch(() => {})
    }, SONDEO_MS)
  }
}
