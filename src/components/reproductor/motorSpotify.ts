import { cargarSpotify, type SpotifyController } from '../../lib/apis'
import type { EnlaceSpotify } from '../../lib/enlaces'
import type { Informe } from './motor'

// Controla el reproductor oficial de Spotify (iFrame API).
// Un único reproductor se reutiliza: cambiar de personaje solo cambia la canción (loadUri).

const AVISO_PREVIEW =
  'Spotify solo reproduce 30 segundos porque no hay sesión iniciada en este navegador. Entra en open.spotify.com con tu cuenta Premium y vuelve a pulsar el personaje.'
const AVISO_BLOQUEO = 'El navegador no ha dejado empezar la música. Pulsa ▶ en el reproductor de Spotify.'

export class MotorSpotify {
  repetir = true
  private ctrl: SpotifyController | null = null
  private pendiente = false
  private haSonado = false
  private ultimaPos = 0
  private tipo: EnlaceSpotify['tipo'] = 'track'
  private avisoPreviewDado = false
  private temporizadores: number[] = []

  constructor(
    private host: HTMLElement,
    private informar: Informe,
  ) {}

  async reproducir(e: EnlaceSpotify) {
    const api = await cargarSpotify()
    this.limpiarTemporizadores()
    this.tipo = e.tipo
    this.pendiente = true
    this.haSonado = false
    this.ultimaPos = 0
    this.avisoPreviewDado = false

    if (!this.ctrl) {
      this.ctrl = await new Promise<SpotifyController>((resolver) => {
        const el = document.createElement('div')
        this.host.replaceChildren(el)
        api.createController(el, { uri: e.uri, width: '100%', height: 80 }, resolver)
      })
      this.escuchar(this.ctrl)
    } else {
      this.ctrl.loadUri(e.uri)
    }

    // Respaldo: si el evento «ready» no llega, se insiste en reproducir.
    this.programar(1500, () => this.pendiente && this.ctrl?.play())
    this.programar(5000, () => this.pendiente && this.informar('pausa', AVISO_BLOQUEO))
  }

  alternar() {
    this.ctrl?.togglePlay()
  }

  detener() {
    this.limpiarTemporizadores()
    this.pendiente = false
    this.ctrl?.pause()
  }

  private escuchar(c: SpotifyController) {
    c.addListener('ready', () => {
      if (this.pendiente) c.play()
    })
    c.addListener('playback_update', ({ data }) => {
      if (!data) return
      const { isPaused, isBuffering, duration, position } = data

      // Fin de la canción: el reproductor se queda en pausa al final.
      const termino = isPaused && this.haSonado && duration > 0 && this.ultimaPos >= duration - 1500
      this.ultimaPos = position
      if (termino && this.repetir && this.tipo === 'track') {
        this.haSonado = false
        c.play()
        return
      }

      if (!isPaused && !isBuffering) {
        this.pendiente = false
        this.haSonado = true
      }

      let aviso: string | undefined
      if (!this.avisoPreviewDado && this.tipo === 'track' && duration > 0 && duration <= 30500) {
        this.avisoPreviewDado = true
        aviso = AVISO_PREVIEW
      }
      this.informar(isBuffering || (isPaused && this.pendiente) ? 'cargando' : isPaused ? 'pausa' : 'sonando', aviso)
    })
  }

  private programar(ms: number, fn: () => unknown) {
    this.temporizadores.push(window.setTimeout(fn, ms))
  }

  private limpiarTemporizadores() {
    this.temporizadores.forEach(clearTimeout)
    this.temporizadores = []
  }
}
