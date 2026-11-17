import { create } from 'zustand'
import { pistasDe, useDatos } from './store'

// Estado del reproductor (no se guarda: al recargar, no suena nada).
// Suena una pista (un recurso dentro de un elemento) cada vez.

export type EstadoReproduccion = 'parado' | 'cargando' | 'sonando' | 'pausa' | 'error'

interface Reproduccion {
  pistaId: string | null
  estado: EstadoReproduccion
  /** Mensaje para el máster cuando algo falla o hay que avisar. */
  aviso: string
  /** Incrementa en cada pulsación para forzar «volver a empezar» al pulsar la misma pista. */
  peticion: number
  /** Orden pendiente para el reproductor: alternar pausa o detener. */
  orden: { tipo: 'alternar' | 'detener'; n: number } | null
  /** Repetir la pista actual (empieza con el valor de la pista; el máster puede cambiarlo al vuelo). */
  repetir: boolean

  reproducir: (pistaId: string) => void
  /** Pulsar un elemento: su primera pista (o pausa/reanuda si ya suena una suya). */
  pulsarElemento: (elementoId: string) => boolean
  alternar: () => void
  detener: () => void
  informar: (estado: EstadoReproduccion, aviso?: string) => void
  alternarRepetir: () => void
}

export const useReproduccion = create<Reproduccion>()((set, get) => ({
  pistaId: null,
  estado: 'parado',
  aviso: '',
  peticion: 0,
  orden: null,
  repetir: true,

  reproducir: (pistaId) => {
    const p = useDatos.getState().pistas.find((x) => x.id === pistaId)
    set((s) => ({ pistaId, estado: 'cargando', aviso: '', peticion: s.peticion + 1, repetir: p?.bucle ?? false }))
  },

  pulsarElemento: (elementoId) => {
    const pistas = pistasDe(useDatos.getState().pistas, elementoId)
    if (!pistas.length) return false
    const actual = pistas.find((p) => p.id === get().pistaId)
    if (actual && get().estado !== 'error') get().alternar()
    else get().reproducir(pistas[0].id)
    return true
  },

  alternar: () => set((s) => ({ orden: { tipo: 'alternar', n: (s.orden?.n ?? 0) + 1 } })),
  detener: () => set((s) => ({ orden: { tipo: 'detener', n: (s.orden?.n ?? 0) + 1 }, pistaId: null, estado: 'parado', aviso: '' })),
  informar: (estado, aviso) => set((s) => ({ estado, aviso: aviso ?? s.aviso })),
  alternarRepetir: () => set((s) => ({ repetir: !s.repetir })),
}))
