import { cargarYoutube, type YTPlayer } from '../../lib/apis'
import type { EnlaceYoutube } from '../../lib/enlaces'
import type { Informe, Segmento } from './motor'

// Controla el reproductor oficial de YouTube (IFrame Player API).

const ESTADO = { SIN_EMPEZAR: -1, TERMINADO: 0, SONANDO: 1, PAUSA: 2, CARGANDO: 3, PREPARADO: 5 }

const ERRORES: Record<number, string> = {
  2: 'El enlace de YouTube no es válido. Revisa que esté completo.',
  5: 'Este vídeo no se puede reproducir en este navegador.',
  100: 'El vídeo ya no existe o es privado. Elige otro enlace.',
  101: 'El dueño del vídeo no permite reproducirlo fuera de YouTube. Elige otra versión de la canción.',
  150: 'El dueño del vídeo no permite reproducirlo fuera de YouTube. Elige otra versión de la canción.',
}

const AVISO_BLOQUEO = 'El navegador no ha dejado empezar la música. Pulsa ▶ en el vídeo.'

export class MotorYoutube {
  repetir = true
  private player: YTPlayer | null = null
  private actual: EnlaceYoutube | null = null
  private seg: Segmento = { inicio: null, fin: null }
  private volumen = { valor: 70, silenciado: false }
  private generacion = 0
  private estado = ESTADO.SIN_EMPEZAR
  private temporizador = 0

  constructor(
    private host: HTMLElement,
    private informar: Informe,
  ) {}

  /** Volumen 0–100 y silencio (API oficial). Se guarda y se aplica en cuanto el reproductor está listo. */
  fijarVolumen(valor: number, silenciado: boolean) {
    this.volumen = { valor, silenciado }
    this.aplicarVolumen()
  }

  private aplicarVolumen() {
    const p = this.player
    if (!p || typeof p.setVolume !== 'function') return
    p.setVolume(this.volumen.valor)
    if (this.volumen.silenciado) p.mute()
    else p.unMute()
  }

  async reproducir(e: EnlaceYoutube, seg: Segmento, misma = false) {
    const g = ++this.generacion
    // Misma pista ya cargada: si suena, se deja; si está en pausa, se reanuda.
    if (misma && this.player && this.actual?.web === e.web) {
      if (this.estado === ESTADO.SONANDO) return this.informar('sonando', '')
      if (this.estado === ESTADO.PAUSA) return this.player.playVideo()
    }
    const YT = await cargarYoutube()
    if (g !== this.generacion) return
    this.actual = e
    // El tramo de la pista manda; si no hay, se respeta el ?t= del enlace.
    this.seg = { inicio: seg.inicio ?? (e.inicio ? e.inicio * 1000 : null), fin: seg.fin }
    window.clearTimeout(this.temporizador)

    if (!this.player) {
      await new Promise<void>((resolver) => {
        const el = document.createElement('div')
        this.host.replaceChildren(el)
        const vars: Record<string, string | number> = { autoplay: 1, playsinline: 1, rel: 0 }
        if (e.videoId && this.seg.inicio) vars.start = Math.floor(this.seg.inicio / 1000)
        if (e.videoId && this.seg.fin) vars.end = Math.ceil(this.seg.fin / 1000)
        if (!e.videoId && e.listaId) Object.assign(vars, { listType: 'playlist', list: e.listaId })
        this.player = new YT.Player(el, {
          width: '100%',
          height: '100%',
          videoId: e.videoId,
          playerVars: vars,
          events: {
            onReady: (ev) => {
              this.aplicarVolumen()
              ev.target.playVideo()
              resolver()
            },
            onStateChange: (ev) => this.alCambiar(ev.data),
            onError: (ev) => this.informar('error', ERRORES[ev.data] ?? 'YouTube no ha podido reproducir este vídeo.'),
          },
        })
      })
    } else {
      this.cargar(e)
    }
    this.aplicarVolumen()

    this.temporizador = window.setTimeout(() => {
      if (this.estado !== ESTADO.SONANDO) this.informar('pausa', AVISO_BLOQUEO)
    }, 5000)
  }

  alternar() {
    if (!this.player) return
    if (this.estado === ESTADO.SONANDO) this.player.pauseVideo()
    else this.player.playVideo()
  }

  detener() {
    this.generacion++
    window.clearTimeout(this.temporizador)
    this.player?.stopVideo()
  }

  private cargar(e: EnlaceYoutube) {
    if (!this.player) return
    if (e.videoId)
      this.player.loadVideoById({
        videoId: e.videoId,
        startSeconds: this.seg.inicio != null ? this.seg.inicio / 1000 : undefined,
        endSeconds: this.seg.fin != null ? this.seg.fin / 1000 : undefined,
      })
    else if (e.listaId) this.player.loadPlaylist({ list: e.listaId, listType: 'playlist' })
  }

  private alCambiar(estado: number) {
    this.estado = estado
    if (estado === ESTADO.TERMINADO) {
      if (this.repetir && this.actual) this.cargar(this.actual)
      else this.informar('pausa')
      return
    }
    if (estado === ESTADO.SONANDO) {
      window.clearTimeout(this.temporizador)
      this.informar('sonando', '')
    } else if (estado === ESTADO.PAUSA) this.informar('pausa')
    else if (estado === ESTADO.CARGANDO) this.informar('cargando')
  }
}
