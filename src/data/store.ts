import { create } from 'zustand'
import { nuevoId } from '../lib/id'
import { repositorio } from './repositorio'
import { TIPOS, type Cancion, type DatosCancion } from './types'

// Canciones del usuario. Los cambios se ven al instante (optimista) y se guardan
// en segundo plano; si el guardado falla, se deshacen y se avisa.

type Carga = 'pendiente' | 'cargando' | 'lista' | 'error'

interface Estado {
  canciones: Cancion[]
  carga: Carga
  error: string
  cargar: () => Promise<void>
  vaciar: () => void
  crear: (d: DatosCancion) => Promise<string | null>
  actualizar: (id: string, cambios: Partial<DatosCancion>) => Promise<void>
  eliminar: (id: string) => Promise<void>
  importar: (lista: DatosCancion[]) => Promise<number>
  limpiarError: () => void
}

const ERROR_GUARDAR = 'No se ha podido guardar el cambio. Revisa la conexión e inténtalo de nuevo.'

export const useDatos = create<Estado>()((set, get) => ({
  canciones: [],
  carga: 'pendiente',
  error: '',

  cargar: async () => {
    set({ carga: 'cargando', error: '' })
    try {
      set({ canciones: await repositorio.listar(), carga: 'lista' })
    } catch {
      set({ carga: 'error', error: 'No se han podido cargar tus canciones. Revisa la conexión y recarga la página.' })
    }
  },

  vaciar: () => set({ canciones: [], carga: 'pendiente', error: '' }),

  crear: async (d) => {
    const temporal: Cancion = { ...d, id: `tmp-${nuevoId()}`, orden: 0, creado: '', actualizado: '' }
    set((s) => ({ canciones: [...s.canciones, temporal] }))
    try {
      const real = await repositorio.crear(d)
      set((s) => ({ canciones: s.canciones.map((c) => (c.id === temporal.id ? real : c)) }))
      return real.id
    } catch {
      set((s) => ({ canciones: s.canciones.filter((c) => c.id !== temporal.id), error: ERROR_GUARDAR }))
      return null
    }
  },

  actualizar: async (id, cambios) => {
    const antes = get().canciones.find((c) => c.id === id)
    if (!antes) return
    set((s) => ({ canciones: s.canciones.map((c) => (c.id === id ? { ...c, ...cambios } : c)) }))
    try {
      await repositorio.actualizar(id, cambios)
    } catch {
      set((s) => ({ canciones: s.canciones.map((c) => (c.id === id ? antes : c)), error: ERROR_GUARDAR }))
    }
  },

  eliminar: async (id) => {
    const antes = get().canciones
    set({ canciones: antes.filter((c) => c.id !== id) })
    try {
      await repositorio.eliminar(id)
    } catch {
      set({ canciones: antes, error: 'No se ha podido eliminar. Revisa la conexión e inténtalo de nuevo.' })
    }
  },

  importar: async (lista) => {
    let ok = 0
    for (const d of lista) if (await get().crear(d)) ok++
    return ok
  },

  limpiarError: () => set({ error: '' }),
}))

/** Valida una copia (versión 3, o la 2 antigua con solo personajes). Devuelve la lista o un error. */
export function validarImportacion(texto: string): DatosCancion[] | string {
  let bruto: unknown
  try {
    bruto = JSON.parse(texto)
  } catch {
    return 'El texto no es una copia válida. Usa una copia hecha desde «Copias».'
  }
  const d = bruto as { version?: number; canciones?: unknown[]; personajes?: unknown[] }
  const lista = d?.version === 3 ? d.canciones : d?.version === 2 ? d.personajes : null
  if (!Array.isArray(lista)) return 'Esta copia no es de la banda sonora.'
  return lista
    .filter((x): x is Record<string, unknown> => !!x && typeof x === 'object' && typeof (x as { nombre?: unknown }).nombre === 'string')
    .map((x) => ({
      tipo: TIPOS.includes(x.tipo as Cancion['tipo']) ? (x.tipo as Cancion['tipo']) : 'personaje',
      nombre: String(x.nombre).slice(0, 120),
      enlace: String(x.enlace ?? '').slice(0, 500),
      nota: String(x.nota ?? '').slice(0, 300),
    }))
    .filter((x) => x.nombre.trim())
}

export function exportar(canciones: Cancion[]): string {
  const limpias = canciones.map(({ tipo, nombre, enlace, nota }) => ({ tipo, nombre, enlace, nota }))
  return JSON.stringify({ version: 3, canciones: limpias }, null, 2)
}
