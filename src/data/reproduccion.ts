import { create } from 'zustand'
import { almacenamientoSeguro } from './storage'

const CLAVE_REPETIR = 'banda-sonora:repetir'

// Estado del reproductor (no se guarda: al recargar, no suena nada).

export type EstadoReproduccion = 'parado' | 'cargando' | 'sonando' | 'pausa' | 'error'

interface Reproduccion {
  /** Personaje cuya canción está cargada. */
  personajeId: string | null
  estado: EstadoReproduccion
  /** Mensaje para el máster cuando algo falla o hay que avisar. */
  aviso: string
  /** Incrementa en cada pulsación para forzar «volver a empezar» al pulsar el mismo personaje. */
  peticion: number
  /** Orden pendiente para el reproductor: alternar pausa o detener. */
  orden: { tipo: 'alternar' | 'detener'; n: number } | null
  /** Al terminar la canción, vuelve a empezar (preferencia guardada). */
  repetir: boolean

  reproducir: (personajeId: string) => void
  alternar: () => void
  detener: () => void
  informar: (estado: EstadoReproduccion, aviso?: string) => void
  avisar: (aviso: string) => void
  alternarRepetir: () => void
}

export const useReproduccion = create<Reproduccion>()((set) => ({
  personajeId: null,
  estado: 'parado',
  aviso: '',
  peticion: 0,
  orden: null,
  repetir: almacenamientoSeguro.getItem(CLAVE_REPETIR) !== 'no',

  reproducir: (personajeId) => set((s) => ({ personajeId, estado: 'cargando', aviso: '', peticion: s.peticion + 1 })),
  alternar: () => set((s) => ({ orden: { tipo: 'alternar', n: (s.orden?.n ?? 0) + 1 } })),
  detener: () =>
    set((s) => ({ orden: { tipo: 'detener', n: (s.orden?.n ?? 0) + 1 }, personajeId: null, estado: 'parado', aviso: '' })),
  informar: (estado, aviso) => set((s) => ({ estado, aviso: aviso ?? s.aviso })),
  avisar: (aviso) => set({ aviso }),
  alternarRepetir: () =>
    set((s) => {
      almacenamientoSeguro.setItem(CLAVE_REPETIR, s.repetir ? 'no' : 'si')
      return { repetir: !s.repetir }
    }),
}))
