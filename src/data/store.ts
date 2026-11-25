import { create } from 'zustand'
import { repositorio, type Bucket } from './repositorio'
import { interpretarEnlace } from '../lib/enlaces'
import { enlaceFreesound, freesoundIdDe, resolverSonido } from '../lib/freesound'
import { vacia, type Biblioteca, type Elemento, type Pista, type Recurso, type Tipo } from './types'

// Biblioteca del usuario en memoria. Las operaciones complejas (guardar un elemento con sus pistas)
// están en guardar.ts; aquí, la carga, los borrados y las direcciones de archivos privados.

type Carga = 'pendiente' | 'cargando' | 'lista' | 'error'

interface Parcial {
  elementos?: Elemento[]
  recursos?: Recurso[]
  pistas?: Pista[]
  quitarPistas?: string[]
}

interface Estado extends Biblioteca {
  carga: Carga
  error: string
  /** Por qué no se pueden usar las sesiones ('' = disponibles). P. ej. bd/004 sin ejecutar en Supabase. */
  sinSesiones: string
  /** Por qué no se pueden usar las carpetas de Main ('' = disponibles). P. ej. bd/005 sin ejecutar. */
  sinCarpetas: string
  /** Direcciones temporales de archivos privados (ruta → url). */
  urls: Record<string, string>
  cargar: () => Promise<void>
  vaciar: () => void
  avisar: (mensaje: string) => void
  limpiarError: () => void
  /** Inserta o sustituye filas (por id) y quita pistas. */
  fusionar: (p: Parcial) => void
  /** Dirección de un archivo privado. `renovar` pide una nueva aunque haya una guardada (p. ej. tras un error). */
  urlDe: (bucket: Bucket, ruta: string, renovar?: boolean) => Promise<string | null>
  /** Dirección para reproducir un sonido propio: archivo subido (URL firmada) o enlace de audio (tal cual). */
  urlDeRecurso: (r: Recurso, renovar?: boolean) => Promise<string | null>
  eliminarElemento: (id: string) => Promise<void>
  quitarPista: (id: string) => Promise<void>
  eliminarRecurso: (id: string) => Promise<void>
  actualizarRecurso: (id: string, cambios: Partial<Pick<Recurso, 'titulo' | 'descripcion'>>) => Promise<void>
  /** Nuevo orden manual de una carpeta (ids en orden). Se guarda solo lo que cambia; si falla, se restaura y avisa. */
  reordenar: (tipo: Tipo, ids: string[]) => Promise<boolean>
}

const mezclar = <T extends { id: string }>(lista: T[], nuevos: T[] = []) => {
  if (!nuevos.length) return lista
  const ids = new Set(nuevos.map((n) => n.id))
  return [...lista.filter((x) => !ids.has(x.id)), ...nuevos]
}

// Las direcciones firmadas caducan a las 6 h: se piden de nuevo pasadas 5 h.
const VIGENCIA_MS = 5 * 3600 * 1000
const pedidas = new Map<string, number>()

const mensaje = (e: unknown, porDefecto: string) => (e instanceof Error && e.message ? e.message : porDefecto)

export const useDatos = create<Estado>()((set, get) => ({
  ...vacia(),
  carga: 'pendiente',
  error: '',
  sinSesiones: '',
  sinCarpetas: '',
  urls: {},

  cargar: async () => {
    set({ carga: 'cargando', error: '' })
    try {
      const { sinSesiones = '', sinCarpetas = '', ...b } = await repositorio.listar()
      set({ ...b, sinSesiones, sinCarpetas, carga: 'lista' })
      const rutas = b.elementos.map((e) => e.retrato_ruta).filter((r): r is string => !!r)
      if (rutas.length) {
        const urls = await repositorio.urls('retratos', rutas).catch(() => ({}))
        set((s) => ({ urls: { ...s.urls, ...urls } }))
      }
    } catch (e) {
      set({ carga: 'error', error: mensaje(e, 'No se ha podido cargar tu biblioteca. Revisa la conexión y recarga.') })
    }
  },

  vaciar: () => {
    pedidas.clear()
    set({ ...vacia(), carga: 'pendiente', error: '', sinSesiones: '', sinCarpetas: '', urls: {} })
  },
  avisar: (error) => set({ error }),
  limpiarError: () => set({ error: '' }),

  fusionar: (p) =>
    set((s) => ({
      elementos: mezclar(s.elementos, p.elementos),
      recursos: mezclar(s.recursos, p.recursos),
      pistas: mezclar(s.pistas, p.pistas).filter((x) => !p.quitarPistas?.includes(x.id)),
    })),

  urlDe: async (bucket, ruta, renovar = false) => {
    const ya = get().urls[ruta]
    const desde = pedidas.get(ruta)
    if (ya && !renovar && (desde == null || Date.now() - desde < VIGENCIA_MS)) return ya
    try {
      const u = (await repositorio.urls(bucket, [ruta]))[ruta]
      if (u) {
        pedidas.set(ruta, Date.now())
        set((s) => ({ urls: { ...s.urls, [ruta]: u } }))
      }
      return u ?? null
    } catch {
      return null
    }
  },

  urlDeRecurso: async (r, renovar = false) => {
    if (r.origen === 'url') {
      const e = interpretarEnlace(r.enlace)
      const actual = typeof e !== 'string' && e.servicio === 'url' ? e.url : null
      // Sonido de Freesound que ha fallado: su MP3 de escucha puede haber cambiado. Se pide el vigente por su id.
      const id = freesoundIdDe(r.enlace)
      if (!renovar || id == null) return actual
      try {
        const s = await resolverSonido(id)
        if (s.preview === actual) return actual
        const enlace = enlaceFreesound(s)
        set((st) => ({ recursos: st.recursos.map((x) => (x.id === r.id ? { ...x, enlace } : x)) }))
        await repositorio.actualizar('recursos', r.id, { enlace }).catch(() => {})
        return s.preview
      } catch {
        return actual
      }
    }
    return r.origen === 'archivo' && r.archivo_ruta ? get().urlDe('audio', r.archivo_ruta, renovar) : null
  },

  eliminarElemento: async (id) => {
    const s0 = get()
    const antes = { elementos: s0.elementos, pistas: s0.pistas, sesion_elementos: s0.sesion_elementos, elementos_comunes: s0.elementos_comunes, carpeta_elementos: s0.carpeta_elementos }
    const el = antes.elementos.find((e) => e.id === id)
    set({
      elementos: antes.elementos.filter((e) => e.id !== id),
      pistas: antes.pistas.filter((p) => p.elemento_id !== id),
      // Sus relaciones con sesiones desaparecen con ella (igual que en la base de datos).
      sesion_elementos: antes.sesion_elementos.filter((x) => x.elemento_id !== id),
      elementos_comunes: antes.elementos_comunes.filter((x) => x.elemento_id !== id),
      carpeta_elementos: antes.carpeta_elementos.filter((x) => x.elemento_id !== id),
    })
    try {
      await repositorio.eliminar('elementos', id)
      if (el?.retrato_ruta) await repositorio.borrarArchivos('retratos', [el.retrato_ruta]).catch(() => {})
    } catch (e) {
      set({ ...antes, error: mensaje(e, 'No se ha podido eliminar. Inténtalo de nuevo.') })
    }
  },

  quitarPista: async (id) => {
    const antes = get().pistas
    set({ pistas: antes.filter((p) => p.id !== id) })
    try {
      await repositorio.eliminar('pistas', id)
    } catch (e) {
      set({ pistas: antes, error: mensaje(e, 'No se ha podido quitar la pista. Inténtalo de nuevo.') })
    }
  },

  // Borra el sonido de la biblioteca: sus pistas desaparecen de todos los elementos y se borra el archivo.
  eliminarRecurso: async (id) => {
    const antes = { recursos: get().recursos, pistas: get().pistas }
    const r = antes.recursos.find((x) => x.id === id)
    set({ recursos: antes.recursos.filter((x) => x.id !== id), pistas: antes.pistas.filter((p) => p.recurso_id !== id) })
    try {
      await repositorio.eliminar('recursos', id)
      if (r?.archivo_ruta) await repositorio.borrarArchivos('audio', [r.archivo_ruta]).catch(() => {})
    } catch (e) {
      set({ ...antes, error: mensaje(e, 'No se ha podido eliminar el sonido. Inténtalo de nuevo.') })
    }
  },

  reordenar: async (tipo, ids) => {
    const antes = get().elementos
    // `ids` puede ser solo una parte de la carpeta (la vista de una sesión): esas tarjetas se recolocan en los
    // huecos que ocupan dentro del orden completo, y las demás no se mueven. Luego se numera toda la carpeta 1..n.
    const todas = antes.filter((e) => e.tipo === tipo).sort(compararElementos).map((e) => e.id)
    const enCarpeta = new Set(todas)
    const parte = ids.filter((id) => enCarpeta.has(id))
    const enParte = new Set(parte)
    let k = 0
    const completo = todas.map((id) => (enParte.has(id) ? parte[k++] : id))
    const nuevos = new Map(completo.map((id, i) => [id, i + 1]))
    const cambios = antes.filter((e) => e.tipo === tipo && nuevos.has(e.id) && e.orden !== nuevos.get(e.id))
    if (!cambios.length) return true
    // Optimista: el orden cambia al momento en pantalla (sin tocar lo que esté sonando).
    set({ elementos: antes.map((e) => (e.tipo === tipo && nuevos.has(e.id) ? { ...e, orden: nuevos.get(e.id)! } : e)) })
    try {
      await Promise.all(cambios.map((e) => repositorio.actualizar('elementos', e.id, { orden: nuevos.get(e.id)! })))
      return true
    } catch {
      // Lo que llegó a guardarse se devuelve a su valor para no dejar el orden a medias.
      await Promise.allSettled(cambios.map((e) => repositorio.actualizar('elementos', e.id, { orden: e.orden })))
      set({ elementos: antes, error: 'No se ha podido guardar el nuevo orden. Se ha restaurado el anterior: revisa la conexión e inténtalo de nuevo.' })
      return false
    }
  },

  actualizarRecurso: async (id, cambios) => {
    const antes = get().recursos
    set({ recursos: antes.map((r) => (r.id === id ? { ...r, ...cambios } : r)) })
    try {
      await repositorio.actualizar('recursos', id, cambios)
    } catch (e) {
      set({ recursos: antes, error: mensaje(e, 'No se ha podido guardar el cambio.') })
    }
  },
}))

/** ¿Lo reproduce DFY con su propio reproductor de audio? (archivo subido o enlace de audio: puede ir a la mezcla) */
export const esLocal = (r: Pick<Recurso, 'origen'> | null | undefined) => r?.origen === 'archivo' || r?.origen === 'url'

/** Orden en pantalla de una carpeta: el manual (`orden`) y, a igualdad, por nombre (así lo existente no cambia). */
export const compararElementos = (a: Elemento, b: Elemento) => a.orden - b.orden || a.nombre.localeCompare(b.nombre, 'es')

/**
 * Posición de un elemento nuevo: si la carpeta nunca se ha ordenado a mano (todo a 0), sigue el orden alfabético (0);
 * si ya se ordenó, va al final.
 */
export function ordenNuevo(elementos: Elemento[], tipo: Tipo): number {
  const max = Math.max(0, ...elementos.filter((e) => e.tipo === tipo).map((e) => e.orden))
  return max > 0 ? max + 1 : 0
}

/** Pistas de un elemento, en su orden. */
export const pistasDe = (pistas: Pista[], elementoId: string) =>
  pistas.filter((p) => p.elemento_id === elementoId).sort((a, b) => a.orden - b.orden)
