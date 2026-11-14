import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { almacenamientoSeguro } from './storage'
import { nuevoId } from '../lib/id'
import type { Datos, Personaje } from './types'

export const CLAVE_DATOS = 'banda-sonora:datos'

type Cambios = Partial<Pick<Personaje, 'nombre' | 'enlace' | 'grupo' | 'nota'>>

interface Estado extends Datos {
  crear: (p: Cambios) => string
  actualizar: (id: string, cambios: Cambios) => void
  eliminar: (id: string) => void
  reemplazarTodo: (d: Datos) => void
}

export const useDatos = create<Estado>()(
  persist(
    (set) => ({
      version: 2,
      personajes: [],

      crear: (p) => {
        const ahora = Date.now()
        const id = nuevoId()
        const nuevo: Personaje = { nombre: '', enlace: '', grupo: '', nota: '', ...p, id, creado: ahora, actualizado: ahora }
        set((s) => ({ personajes: [...s.personajes, nuevo] }))
        return id
      },

      actualizar: (id, cambios) =>
        set((s) => ({
          personajes: s.personajes.map((p) => (p.id === id ? { ...p, ...cambios, actualizado: Date.now() } : p)),
        })),

      eliminar: (id) => set((s) => ({ personajes: s.personajes.filter((p) => p.id !== id) })),

      reemplazarTodo: (d) => set({ version: 2, personajes: d.personajes }),
    }),
    {
      name: CLAVE_DATOS,
      version: 2,
      storage: createJSONStorage(() => almacenamientoSeguro),
      partialize: (s) => extraerDatos(s),
    },
  ),
)

export function extraerDatos(s: Datos): Datos {
  return { version: 2, personajes: s.personajes }
}

/** Si la app está abierta en dos pestañas, ambas ven los mismos personajes. */
export function escucharOtrasPestanas() {
  const alCambiar = (e: StorageEvent) => {
    if (e.key === CLAVE_DATOS) void useDatos.persist.rehydrate()
  }
  window.addEventListener('storage', alCambiar)
  return () => window.removeEventListener('storage', alCambiar)
}

/** Valida una copia importada. Devuelve los datos o un mensaje de error. */
export function validarImportacion(texto: string): Datos | string {
  let bruto: unknown
  try {
    bruto = JSON.parse(texto)
  } catch {
    return 'El texto no es una copia válida. Usa una copia hecha desde «Copias de seguridad».'
  }
  const d = bruto as Partial<Datos>
  if (!d || d.version !== 2 || !Array.isArray(d.personajes)) {
    return 'Esta copia no es de la banda sonora o es de una versión antigua.'
  }
  const personajes = d.personajes
    .filter((p): p is Personaje => !!p && typeof p === 'object' && typeof p.nombre === 'string')
    .map((p) => ({
      id: typeof p.id === 'string' ? p.id : nuevoId(),
      nombre: p.nombre,
      enlace: String(p.enlace ?? ''),
      grupo: String(p.grupo ?? ''),
      nota: String(p.nota ?? ''),
      creado: Number(p.creado) || Date.now(),
      actualizado: Number(p.actualizado) || Date.now(),
    }))
  return { version: 2, personajes }
}

/** Grupos existentes, para sugerirlos al editar. */
export function gruposExistentes(personajes: Personaje[]): string[] {
  return [...new Set(personajes.map((p) => p.grupo.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'))
}
