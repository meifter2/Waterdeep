import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { almacenamientoSeguro } from './storage'
import { nuevoId } from '../lib/id'
import type { Campana, Coleccion, Combatiente, Datos, Entidad, Tirada } from './types'

export const CLAVE_DATOS = 'waterdeep-mesa:datos'

export function datosVacios(): Datos {
  return {
    version: 1,
    campana: { nombre: 'Mi campaña', diaJuego: '', notasRapidas: '' },
    pj: [],
    pnj: [],
    facciones: [],
    lugares: [],
    pistas: [],
    sesiones: [],
    combate: { activo: false, ronda: 1, turno: 0, combatientes: [] },
    tiradas: [],
  }
}

interface Acciones {
  actualizarCampana: (cambios: Partial<Campana>) => void
  crear: (col: Coleccion, inicial?: Partial<Entidad>) => string
  actualizar: (col: Coleccion, id: string, cambios: Partial<Entidad>) => void
  eliminar: (col: Coleccion, id: string) => void

  // Combate
  anadirCombatiente: (c: Omit<Combatiente, 'id'>) => void
  actualizarCombatiente: (id: string, cambios: Partial<Combatiente>) => void
  quitarCombatiente: (id: string) => void
  ordenarIniciativa: () => void
  siguienteTurno: () => void
  turnoAnterior: () => void
  iniciarCombate: () => void
  terminarCombate: (vaciar: boolean) => void

  registrarTirada: (t: Omit<Tirada, 'id' | 'momento'>) => void
  borrarTiradas: () => void

  reemplazarTodo: (d: Datos) => void
}

export type Estado = Datos & Acciones

const ordenar = (lista: Combatiente[]) =>
  [...lista].sort((a, b) => b.iniciativa - a.iniciativa || a.nombre.localeCompare(b.nombre, 'es'))

export const useDatos = create<Estado>()(
  persist(
    (set) => ({
      ...datosVacios(),

      actualizarCampana: (cambios) => set((s) => ({ campana: { ...s.campana, ...cambios } })),

      crear: (col, inicial = {}) => {
        const ahora = Date.now()
        const id = nuevoId()
        const entidad: Entidad = {
          nombre: '',
          visible: col === 'pj',
          ...inicial,
          id,
          creado: ahora,
          actualizado: ahora,
        }
        set((s) => ({ [col]: [entidad, ...s[col]] }) as Partial<Estado>)
        return id
      },

      actualizar: (col, id, cambios) =>
        set((s) => ({
          [col]: s[col].map((e) => (e.id === id ? { ...e, ...cambios, actualizado: Date.now() } : e)),
        }) as Partial<Estado>),

      eliminar: (col, id) => set((s) => ({ [col]: s[col].filter((e) => e.id !== id) }) as Partial<Estado>),

      anadirCombatiente: (c) =>
        set((s) => {
          const lista = [...s.combate.combatientes, { ...c, id: nuevoId() }]
          return { combate: { ...s.combate, combatientes: s.combate.activo ? lista : ordenar(lista) } }
        }),

      actualizarCombatiente: (id, cambios) =>
        set((s) => ({
          combate: {
            ...s.combate,
            combatientes: s.combate.combatientes.map((c) => (c.id === id ? { ...c, ...cambios } : c)),
          },
        })),

      quitarCombatiente: (id) =>
        set((s) => {
          const idx = s.combate.combatientes.findIndex((c) => c.id === id)
          const combatientes = s.combate.combatientes.filter((c) => c.id !== id)
          let turno = s.combate.turno
          if (idx !== -1 && idx < turno) turno -= 1
          if (turno >= combatientes.length) turno = 0
          return { combate: { ...s.combate, combatientes, turno } }
        }),

      ordenarIniciativa: () =>
        set((s) => {
          const actual = s.combate.combatientes[s.combate.turno]
          const combatientes = ordenar(s.combate.combatientes)
          const turno = actual ? Math.max(0, combatientes.findIndex((c) => c.id === actual.id)) : 0
          return { combate: { ...s.combate, combatientes, turno } }
        }),

      siguienteTurno: () =>
        set((s) => {
          const n = s.combate.combatientes.length
          if (n === 0) return {}
          const siguiente = s.combate.turno + 1
          return siguiente >= n
            ? { combate: { ...s.combate, turno: 0, ronda: s.combate.ronda + 1 } }
            : { combate: { ...s.combate, turno: siguiente } }
        }),

      turnoAnterior: () =>
        set((s) => {
          const n = s.combate.combatientes.length
          if (n === 0) return {}
          if (s.combate.turno > 0) return { combate: { ...s.combate, turno: s.combate.turno - 1 } }
          if (s.combate.ronda > 1) return { combate: { ...s.combate, turno: n - 1, ronda: s.combate.ronda - 1 } }
          return {}
        }),

      iniciarCombate: () =>
        set((s) => ({
          combate: { ...s.combate, activo: true, ronda: 1, turno: 0, combatientes: ordenar(s.combate.combatientes) },
        })),

      terminarCombate: (vaciar) =>
        set((s) => ({
          combate: {
            activo: false,
            ronda: 1,
            turno: 0,
            combatientes: vaciar ? [] : s.combate.combatientes,
          },
        })),

      registrarTirada: (t) =>
        set((s) => ({ tiradas: [{ ...t, id: nuevoId(), momento: Date.now() }, ...s.tiradas].slice(0, 30) })),

      borrarTiradas: () => set({ tiradas: [] }),

      reemplazarTodo: (d) => set({ ...datosVacios(), ...d }),
    }),
    {
      name: CLAVE_DATOS,
      version: 1,
      storage: createJSONStorage(() => almacenamientoSeguro),
      // Solo se guardan los datos, no las funciones.
      partialize: (s) => extraerDatos(s),
    },
  ),
)

export function extraerDatos(s: Estado | Datos): Datos {
  return {
    version: 1,
    campana: s.campana,
    pj: s.pj,
    pnj: s.pnj,
    facciones: s.facciones,
    lugares: s.lugares,
    pistas: s.pistas,
    sesiones: s.sesiones,
    combate: s.combate,
    tiradas: s.tiradas,
  }
}

/** Sincroniza pestañas: si la vista de jugadores está abierta en otra ventana, se actualiza sola. */
export function escucharOtrasPestanas() {
  const alCambiar = (e: StorageEvent) => {
    if (e.key === CLAVE_DATOS) void useDatos.persist.rehydrate()
  }
  window.addEventListener('storage', alCambiar)
  return () => window.removeEventListener('storage', alCambiar)
}

/** Valida un JSON importado. Devuelve los datos o un mensaje de error. */
export function validarImportacion(texto: string): Datos | string {
  let bruto: unknown
  try {
    bruto = JSON.parse(texto)
  } catch {
    return 'El archivo no es un JSON válido. Usa una copia exportada desde Ajustes.'
  }
  if (!bruto || typeof bruto !== 'object') return 'El archivo está vacío o no tiene el formato esperado.'
  const d = bruto as Partial<Datos>
  if (d.version !== 1) return 'Esta copia es de una versión desconocida de la app.'
  const colecciones: Coleccion[] = ['pj', 'pnj', 'facciones', 'lugares', 'pistas', 'sesiones']
  for (const c of colecciones) {
    if (!Array.isArray(d[c])) return `A la copia le falta la lista «${c}».`
  }
  return { ...datosVacios(), ...d } as Datos
}
