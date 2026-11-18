// Carga (una sola vez) las APIs oficiales de reproductor embebido de Spotify y YouTube.

export interface SpotifyController {
  loadUri(uri: string, preferVideo?: boolean, startAt?: number): void
  play(): void
  pause(): void
  resume(): void
  togglePlay(): void
  seek(segundos: number): void
  destroy(): void
  addListener(evento: 'ready', cb: () => void): void
  addListener(evento: 'playback_update', cb: (e: { data: SpotifyPlayback }) => void): void
}

export interface SpotifyPlayback {
  isPaused: boolean
  isBuffering: boolean
  duration: number
  position: number
}

export interface SpotifyIFrameAPI {
  createController(
    el: HTMLElement,
    /** startAt: segundo en el que debe empezar al reproducir (opción oficial del iFrame API). */
    opciones: { uri: string; width?: string | number; height?: string | number; startAt?: number },
    listo: (c: SpotifyController) => void,
  ): void
}

export interface YTPlayer {
  loadVideoById(o: { videoId: string; startSeconds?: number; endSeconds?: number }): void
  loadPlaylist(o: { list: string; listType: 'playlist'; index?: number }): void
  playVideo(): void
  pauseVideo(): void
  stopVideo(): void
  getPlayerState(): number
  setVolume(v: number): void
  mute(): void
  unMute(): void
  destroy(): void
}

export interface YTNamespace {
  Player: new (
    el: HTMLElement,
    opciones: {
      width?: string | number
      height?: string | number
      videoId?: string
      host?: string
      playerVars?: Record<string, string | number>
      events?: {
        onReady?: (e: { target: YTPlayer }) => void
        onStateChange?: (e: { data: number }) => void
        onError?: (e: { data: number }) => void
      }
    },
  ) => YTPlayer
  PlayerState: { PLAYING: number; PAUSED: number; ENDED: number; BUFFERING: number; CUED: number }
}

declare global {
  interface Window {
    onSpotifyIframeApiReady?: (api: SpotifyIFrameAPI) => void
    onYouTubeIframeAPIReady?: () => void
    YT?: YTNamespace
  }
}

const ESPERA_MS = 10000

function cargarScript(src: string): void {
  if (document.querySelector(`script[src="${src}"]`)) return
  const s = document.createElement('script')
  s.src = src
  s.async = true
  document.head.appendChild(s)
}

function conLimite<T>(promesa: Promise<T>, servicio: string): Promise<T> {
  return Promise.race([
    promesa,
    new Promise<T>((_, rechazar) =>
      setTimeout(() => rechazar(new Error(`No se ha podido cargar el reproductor de ${servicio}.`)), ESPERA_MS),
    ),
  ])
}

let spotify: Promise<SpotifyIFrameAPI> | null = null

export function cargarSpotify(): Promise<SpotifyIFrameAPI> {
  if (!spotify) {
    spotify = conLimite(
      new Promise<SpotifyIFrameAPI>((resolver) => {
        window.onSpotifyIframeApiReady = (api) => resolver(api)
        cargarScript('https://open.spotify.com/embed/iframe-api/v1')
      }),
      'Spotify',
    ).catch((e) => {
      spotify = null // permite reintentar
      throw e
    })
  }
  return spotify
}

let youtube: Promise<YTNamespace> | null = null

export function cargarYoutube(): Promise<YTNamespace> {
  if (!youtube) {
    youtube = conLimite(
      new Promise<YTNamespace>((resolver) => {
        if (window.YT?.Player) return resolver(window.YT)
        const previo = window.onYouTubeIframeAPIReady
        window.onYouTubeIframeAPIReady = () => {
          previo?.()
          if (window.YT) resolver(window.YT)
        }
        cargarScript('https://www.youtube.com/iframe_api')
      }),
      'YouTube',
    ).catch((e) => {
      youtube = null
      throw e
    })
  }
  return youtube
}

/** Precarga ambas APIs en segundo plano para que el primer clic suene antes. */
export function precargar() {
  cargarSpotify().catch(() => {})
  cargarYoutube().catch(() => {})
}
