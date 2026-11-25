import { create } from 'zustand'

// Modo selección: tocar una tarjeta la marca (no reproduce) para organizarla en bloque.

interface Seleccion {
  activo: boolean
  ids: string[]
  /** Sesión propuesta para «Añadir a la sesión» (p. ej. al traer tarjetas a una sesión desde la biblioteca). */
  destino: string | null
  empezar: (destino?: string | null) => void
  terminar: () => void
  alternar: (id: string) => void
  poner: (ids: string[]) => void
}

export const useSeleccion = create<Seleccion>()((set) => ({
  activo: false,
  ids: [],
  destino: null,
  empezar: (destino = null) => set({ activo: true, ids: [], destino }),
  terminar: () => set({ activo: false, ids: [], destino: null }),
  alternar: (id) => set((s) => ({ ids: s.ids.includes(id) ? s.ids.filter((x) => x !== id) : [...s.ids, id] })),
  poner: (ids) => set({ ids }),
}))
