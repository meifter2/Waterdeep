import { create } from 'zustand'
import { pistasDe, useDatos } from './store'

// Estado del reproductor (no se guarda: al recargar, no suena nada). Suena una pista cada vez.
// Dos órdenes distintas:
// - reproducir(pista): SIEMPRE pone esa pista (o la recupera si estaba en pausa o la cambiaron desde fuera).
// - alternar(): pausar/reanudar lo que suena (solo desde la barra inferior).

export type EstadoReproduccion = 'parado' | 'cargando' | 'sonando' | 'pausa' | 'otra' | 'error'

interface Reproduccion {
  pistaId: string | null
  estado: EstadoReproduccion
  /** Mensaje para el máster cuando algo falla o hay que avisar. */
  aviso: string
  /** Incrementa en cada orden de reproducir (también al repetir la misma pista). */
  peticion: number
  /** Orden pendiente para el reproductor: alternar pausa o detener. */
  orden: { tipo: 'alternar' | 'detener'; n: number } | null
  /** Repetir la pista actual (empieza con el valor de la pista; se puede cambiar al vuelo). */
  repetir: boolean

  reproducir: (pistaId: string) => void
  /** Reproduce la pista principal (la primera según el orden) de un elemento. Devuelve false si no tiene. */
  reproducirElemento: (elementoId: string) => boolean
  alternar: () => void
  /** Botón principal ▶/❚❚: pausa o reanuda; si está detenido (o falló, o Spotify cambió), vuelve a poner la última pista. */
  principal: () => void
  /** Detiene, pero recuerda la última pista para poder volver a ponerla desde el principio. */
  detener: () => void
  /** Detiene y olvida la pista (al borrarla o al cerrar sesión). */
  olvidar: () => void
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
    const misma = get().pistaId === pistaId
    set((s) => ({ pistaId, estado: 'cargando', aviso: '', peticion: s.peticion + 1, repetir: misma ? s.repetir : (p?.bucle ?? false) }))
  },

  reproducirElemento: (elementoId) => {
    const principal = pistasDe(useDatos.getState().pistas, elementoId)[0]
    if (!principal) return false
    get().reproducir(principal.id)
    return true
  },

  alternar: () => set((s) => ({ orden: { tipo: 'alternar', n: (s.orden?.n ?? 0) + 1 } })),
  principal: () => {
    const { estado, pistaId } = get()
    if (!pistaId || estado === 'cargando') return // sin pista o con una orden en curso: nada (sin duplicados)
    if (!useDatos.getState().pistas.some((p) => p.id === pistaId)) return get().olvidar() // la pista ya no existe
    if (estado === 'sonando' || estado === 'pausa') get().alternar()
    else get().reproducir(pistaId) // parado, error u «otra» en Spotify: desde el principio
  },
  detener: () =>
    set((s) => (s.estado === 'parado' ? {} : { orden: { tipo: 'detener', n: (s.orden?.n ?? 0) + 1 }, estado: 'parado', aviso: '' })),
  olvidar: () => {
    get().detener()
    set({ pistaId: null, estado: 'parado', aviso: '' })
  },
  informar: (estado, aviso) => set((s) => ({ estado, aviso: aviso ?? s.aviso })),
  alternarRepetir: () => set((s) => ({ repetir: !s.repetir })),
}))
