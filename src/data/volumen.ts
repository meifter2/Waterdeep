import { create } from 'zustand'
import { almacenamientoSeguro } from './storage'

// Volumen de DFY. Dos ámbitos, sin fingir uno solo:
// - «local»: MP3/archivos propios y YouTube (lo controla DFY; se guarda en el navegador).
// - «spotify»: volumen REAL del dispositivo de Spotify conectado (se lee de Spotify, no se inventa).
// Nada de esto toca el volumen general del sistema operativo.

const CLAVE = 'banda-sonora:volumen'
const POR_DEFECTO = 70

function leer(): { local: number; silenciado: boolean } {
  try {
    const d = JSON.parse(almacenamientoSeguro.getItem(CLAVE) ?? 'null')
    const local = Number(d?.local)
    return { local: Number.isFinite(local) ? Math.min(100, Math.max(0, Math.round(local))) : POR_DEFECTO, silenciado: d?.silenciado === true }
  } catch {
    return { local: POR_DEFECTO, silenciado: false }
  }
}

export interface VolumenSpotify {
  /** Volumen real del dispositivo (null = aún no se conoce). */
  valor: number | null
  /** Valor antes de silenciar (Spotify no tiene «silenciar»: se baja a 0 y se recupera). */
  antes: number | null
  soporta: boolean
  dispositivo: string
}

interface Volumen {
  local: number
  silenciado: boolean
  spotify: VolumenSpotify
  /** Petición pendiente para el dispositivo de Spotify (la atiende el reproductor). */
  pedidoSpotify: { valor: number; n: number } | null
  fijarLocal: (v: number) => void
  alternarSilencioLocal: () => void
  fijarSpotify: (v: number) => void
  alternarSilencioSpotify: () => void
  /** El reproductor informa del volumen real que tiene Spotify. */
  informarSpotify: (cambios: Partial<VolumenSpotify>) => void
}

const guardar = (local: number, silenciado: boolean) => almacenamientoSeguro.setItem(CLAVE, JSON.stringify({ local, silenciado }))

export const useVolumen = create<Volumen>()((set, get) => ({
  ...leer(),
  spotify: { valor: null, antes: null, soporta: true, dispositivo: '' },
  pedidoSpotify: null,

  fijarLocal: (v) => {
    const local = Math.min(100, Math.max(0, Math.round(v)))
    // Mover el deslizador por encima de 0 quita el silencio, como en cualquier reproductor.
    const silenciado = local === 0 ? get().silenciado : false
    set({ local, silenciado })
    guardar(local, silenciado)
  },

  alternarSilencioLocal: () => {
    const silenciado = !get().silenciado
    set({ silenciado })
    guardar(get().local, silenciado)
  },

  fijarSpotify: (v) => {
    const valor = Math.min(100, Math.max(0, Math.round(v)))
    set((s) => ({ spotify: { ...s.spotify, valor, antes: valor > 0 ? null : s.spotify.antes }, pedidoSpotify: { valor, n: (s.pedidoSpotify?.n ?? 0) + 1 } }))
  },

  alternarSilencioSpotify: () => {
    const { valor, antes } = get().spotify
    if (valor && valor > 0) {
      set((s) => ({ spotify: { ...s.spotify, valor: 0, antes: valor }, pedidoSpotify: { valor: 0, n: (s.pedidoSpotify?.n ?? 0) + 1 } }))
    } else {
      const recuperado = antes ?? 50
      set((s) => ({ spotify: { ...s.spotify, valor: recuperado, antes: null }, pedidoSpotify: { valor: recuperado, n: (s.pedidoSpotify?.n ?? 0) + 1 } }))
    }
  },

  informarSpotify: (cambios) => set((s) => ({ spotify: { ...s.spotify, ...cambios } })),
}))

/** Volumen efectivo local en 0–1 (con el silencio aplicado). */
export const volumenLocalEfectivo = () => {
  const { local, silenciado } = useVolumen.getState()
  return silenciado ? 0 : local / 100
}
