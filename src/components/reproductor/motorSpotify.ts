import { cargarSpotify, type SpotifyController } from '../../lib/apis'
import { spotifyConfigurado } from '../../lib/spotifyAuth'
import type { EnlaceSpotify } from '../../lib/enlaces'
import type { Informe, Segmento } from './motor'

// Controla el reproductor oficial de Spotify (iFrame API).
// Un único reproductor se reutiliza: cambiar de personaje solo cambia la canción (loadUri).

// Spotify da 30 s cuando el reproductor no recibe la sesión: o no se ha iniciado sesión,
// o el navegador bloquea las cookies de terceros (Brave y Safari lo hacen por defecto).
const esBrave = typeof navigator !== 'undefined' && 'brave' in navigator
const esMovil = typeof navigator !== 'undefined' && /Android|iPhone|iPad/i.test(navigator.userAgent)
const AVISO_PREVIEW = esMovil
  ? spotifyConfigurado
    ? 'En el móvil, Spotify solo da 30 segundos dentro de otras páginas. Pulsa «Conectar Spotify» arriba y sonará completa en tu app de Spotify.'
    : 'En el móvil, Spotify solo da 30 segundos dentro de otras páginas. Pulsa «Abrir en Spotify» para oírla completa.'
  : esBrave
    ? 'Spotify solo da 30 segundos porque Brave le bloquea tu sesión. Pulsa el león de Brave, permite todas las cookies en esta página y recárgala, o usa Chrome o Edge.'
    : spotifyConfigurado
      ? 'Spotify solo da 30 segundos porque no recibe tu sesión. Pulsa «Conectar Spotify» arriba para oírla completa en tu app de Spotify.'
      : 'Spotify solo da 30 segundos porque no recibe tu sesión. Inicia sesión en open.spotify.com en este navegador, permite las cookies de terceros para esta página y recárgala.'
const AVISO_BLOQUEO = 'El navegador no ha dejado empezar la música. Pulsa ▶ en el reproductor de Spotify.'

export class MotorSpotify {
  repetir = true
  private ctrl: SpotifyController | null = null
  private pendiente = false
  private haSonado = false
  private ultimaPos = 0
  private tipo: EnlaceSpotify['tipo'] = 'track'
  private seg: Segmento = { inicio: null, fin: null }
  private inicioAplicado = false
  private avisoPreviewDado = false
  private temporizadores: number[] = []
  private uriActual = ''
  private pausado = true
  private generacion = 0

  constructor(
    private host: HTMLElement,
    private informar: Informe,
  ) {}

  async reproducir(e: EnlaceSpotify, seg: Segmento, misma = false) {
    const g = ++this.generacion
    // Misma pista ya cargada: si suena se deja; si está en pausa se reanuda (no se reinicia).
    if (misma && this.ctrl && this.uriActual === e.uri && this.haSonado) {
      if (!this.pausado) return this.informar('sonando', '')
      this.ctrl.resume()
      return
    }
    const api = await cargarSpotify()
    if (g !== this.generacion) return
    this.uriActual = e.uri
    this.limpiarTemporizadores()
    this.tipo = e.tipo
    this.seg = seg
    this.pendiente = true
    this.haSonado = false
    this.inicioAplicado = !seg.inicio
    this.ultimaPos = 0
    this.avisoPreviewDado = false
    const inicioSeg = seg.inicio ? seg.inicio / 1000 : undefined

    if (!this.ctrl) {
      this.ctrl = await new Promise<SpotifyController>((resolver) => {
        const el = document.createElement('div')
        this.host.replaceChildren(el)
        api.createController(el, { uri: e.uri, width: '100%', height: 80 }, resolver)
      })
      this.escuchar(this.ctrl)
    } else {
      this.ctrl.loadUri(e.uri, false, inicioSeg)
    }

    // Respaldo: si el evento «ready» no llega, se insiste en reproducir.
    this.programar(1500, () => this.pendiente && this.ctrl?.play())
    this.programar(5000, () => this.pendiente && this.informar('pausa', AVISO_BLOQUEO))
  }

  alternar() {
    this.ctrl?.togglePlay()
  }

  detener() {
    this.generacion++
    this.limpiarTemporizadores()
    this.pendiente = false
    this.ctrl?.pause()
  }

  private volverAlInicio(c: SpotifyController) {
    if (this.seg.inicio) c.seek(this.seg.inicio / 1000)
    else c.play()
  }

  private escuchar(c: SpotifyController) {
    c.addListener('ready', () => {
      if (this.pendiente) c.play()
    })
    c.addListener('playback_update', ({ data }) => {
      if (!data) return
      const { isPaused, isBuffering, duration, position } = data
      this.pausado = isPaused

      // Inicio del tramo: si Spotify empezó antes de lo pedido, se salta una vez (aprox. ±1 s).
      if (!isPaused && !this.inicioAplicado && this.seg.inicio && position < this.seg.inicio - 1500) {
        this.inicioAplicado = true
        c.seek(this.seg.inicio / 1000)
        return
      }
      // Fin del tramo (aproximado: Spotify informa de la posición cada poco).
      if (!isPaused && this.seg.fin != null && position >= this.seg.fin) {
        if (this.repetir) this.volverAlInicio(c)
        else {
          c.pause()
          this.informar('pausa')
        }
        return
      }
      // Fin de la canción: el reproductor se queda en pausa al final.
      const termino = isPaused && this.haSonado && duration > 0 && this.ultimaPos >= duration - 1500
      this.ultimaPos = position
      if (termino && this.repetir && this.tipo === 'track') {
        this.haSonado = false
        this.volverAlInicio(c)
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
