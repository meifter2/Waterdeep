import { create } from 'zustand'
import { repositorio } from './repositorio'
import { almacenamientoSeguro } from './storage'
import { useDatos } from './store'
import type { Elemento, ElementoComun, Sesion, SesionElemento } from './types'

// Organización por sesiones de juego (bd/004). SOLO organiza: guarda en qué sesiones aparece cada tarjeta y cuáles
// son comunes. Nunca copia ni borra tarjetas, pistas, sonidos, retratos ni archivos.
// Todas las acciones son optimistas: la pantalla cambia al momento y, si algo falla, se restaura y se avisa.
// Elegir sesión NO reproduce ni detiene nada.

const est = () => useDatos.getState()
const poner = useDatos.setState
const mensaje = (e: unknown, porDefecto: string) => (e instanceof Error && e.message ? e.message : porDefecto)
const temporal = () => `tmp-${Math.random().toString(36).slice(2)}`

/** Sin bd/004 (o si no se pudieron leer) no se guarda nada de sesiones: se avisa en vez de intentarlo. */
function disponible(): boolean {
  const motivo = est().sinSesiones
  if (!motivo) return true
  est().avisar(motivo)
  return false
}

// ───── Sesión activa (por navegador; no se sincroniza: cada dispositivo elige la suya) ─────

const CLAVE_ACTIVA = 'banda-sonora:sesion-activa'

interface Activa {
  /** null = «Toda la biblioteca». */
  activa: string | null
  elegir: (id: string | null) => void
}

export const useSesionActiva = create<Activa>()((set) => ({
  activa: almacenamientoSeguro.getItem(CLAVE_ACTIVA) || null,
  elegir: (activa) => {
    if (activa) almacenamientoSeguro.setItem(CLAVE_ACTIVA, activa)
    else almacenamientoSeguro.removeItem(CLAVE_ACTIVA)
    set({ activa })
  },
}))

/** La sesión elegida si existe (una guardada de otra cuenta o ya borrada cuenta como «Toda la biblioteca»). */
export function sesionVigente(activa: string | null, sesiones: Sesion[]): Sesion | null {
  return (activa && sesiones.find((s) => s.id === activa)) || null
}

/** Ids de las tarjetas que se ven en una sesión: las asignadas a ella y las comunes. */
export function visiblesEn(sesionId: string, rel: SesionElemento[], comunes: ElementoComun[]): Set<string> {
  const ids = new Set(comunes.map((c) => c.elemento_id))
  for (const r of rel) if (r.sesion_id === sesionId) ids.add(r.elemento_id)
  return ids
}

/** Sesiones en pantalla: por orden y, a igualdad, por nombre con números naturales («Sesión 2» antes que «Sesión 10»). */
export const compararSesiones = (a: Sesion, b: Sesion) => a.orden - b.orden || a.nombre.localeCompare(b.nombre, 'es', { numeric: true })

/** Nombre propuesto para la siguiente: «Sesión N+1» según las que ya hay. */
export function siguienteNombre(sesiones: Sesion[]): string {
  const n = Math.max(0, ...sesiones.map((s) => Number(/^sesi[oó]n\s+(\d+)\b/i.exec(s.nombre.trim())?.[1] ?? 0)))
  return `Sesión ${n + 1}`
}

// ───── Sesiones ─────

export async function crearSesion(nombre: string): Promise<Sesion | null> {
  const limpio = nombre.trim().slice(0, 60)
  if (!limpio || !disponible()) return null
  const orden = Math.max(0, ...est().sesiones.map((s) => s.orden)) + 1
  try {
    const s = await repositorio.crear('sesiones', { nombre: limpio, finalizada: false, orden })
    poner((st) => ({ sesiones: [...st.sesiones, s] }))
    return s
  } catch (e) {
    est().avisar(mensaje(e, 'No se ha podido crear la sesión. Inténtalo de nuevo.'))
    return null
  }
}

async function cambiarSesion(id: string, cambios: Partial<Pick<Sesion, 'nombre' | 'finalizada'>>) {
  if (!disponible()) return
  const antes = est().sesiones
  poner({ sesiones: antes.map((s) => (s.id === id ? { ...s, ...cambios } : s)) })
  try {
    await repositorio.actualizar('sesiones', id, cambios)
  } catch (e) {
    poner({ sesiones: antes })
    est().avisar(mensaje(e, 'No se ha podido guardar el cambio de la sesión.'))
  }
}

export const renombrarSesion = (id: string, nombre: string) => {
  const limpio = nombre.trim().slice(0, 60)
  return limpio ? cambiarSesion(id, { nombre: limpio }) : Promise.resolve()
}

export const marcarFinalizada = (id: string, finalizada: boolean) => cambiarSesion(id, { finalizada })

/** Borra la sesión y SOLO sus relaciones. Las tarjetas, sus sonidos y archivos siguen en «Toda la biblioteca». */
export async function eliminarSesion(id: string) {
  if (!disponible()) return
  const { sesiones, sesion_elementos } = est()
  poner({ sesiones: sesiones.filter((s) => s.id !== id), sesion_elementos: sesion_elementos.filter((r) => r.sesion_id !== id) })
  if (useSesionActiva.getState().activa === id) useSesionActiva.getState().elegir(null)
  try {
    await repositorio.eliminar('sesiones', id)
  } catch (e) {
    poner({ sesiones, sesion_elementos })
    est().avisar(mensaje(e, 'No se ha podido eliminar la sesión. Inténtalo de nuevo.'))
  }
}

// ───── Tarjetas en sesiones ─────

/** Añade tarjetas a una sesión (las que ya estaban no se repiten). Devuelve cuántas se han añadido. */
export async function asignar(elementoIds: string[], sesionId: string): Promise<number> {
  if (!disponible()) return 0
  const ya = new Set(est().sesion_elementos.filter((r) => r.sesion_id === sesionId).map((r) => r.elemento_id))
  const nuevas = [...new Set(elementoIds)].filter((id) => !ya.has(id)).map((elemento_id) => ({ id: temporal(), sesion_id: sesionId, elemento_id }))
  if (!nuevas.length) return 0
  poner((st) => ({ sesion_elementos: [...st.sesion_elementos, ...nuevas] }))
  const res = await Promise.allSettled(nuevas.map(({ id: _id, ...fila }) => repositorio.crear('sesion_elementos', fila)))
  // Cada fila provisional se sustituye por la guardada; las que fallan se quitan.
  const cambio = new Map(nuevas.map((n, i) => [n.id, res[i].status === 'fulfilled' ? (res[i] as PromiseFulfilledResult<SesionElemento>).value : null]))
  poner((st) => ({ sesion_elementos: st.sesion_elementos.flatMap((r) => (cambio.has(r.id) ? (cambio.get(r.id) ? [cambio.get(r.id)!] : []) : [r])) }))
  const fallo = res.find((r): r is PromiseRejectedResult => r.status === 'rejected')
  if (fallo) est().avisar(mensaje(fallo.reason, 'No se han podido añadir todas las tarjetas a la sesión. Inténtalo de nuevo.'))
  return res.filter((r) => r.status === 'fulfilled').length
}

/** Quita tarjetas de una sesión. No borra la tarjeta ni sus sonidos: siguen en la biblioteca y en sus otras sesiones. */
export async function quitarDeSesion(elementoIds: string[], sesionId: string): Promise<boolean> {
  if (!disponible()) return false
  const ids = new Set(elementoIds)
  const quitar = est().sesion_elementos.filter((r) => r.sesion_id === sesionId && ids.has(r.elemento_id))
  if (!quitar.length) return true
  const fuera = new Set(quitar.map((r) => r.id))
  poner((st) => ({ sesion_elementos: st.sesion_elementos.filter((r) => !fuera.has(r.id)) }))
  const res = await Promise.allSettled(quitar.map((r) => repositorio.eliminar('sesion_elementos', r.id)))
  const vuelven = quitar.filter((_, i) => res[i].status === 'rejected')
  if (vuelven.length) {
    poner((st) => ({ sesion_elementos: [...st.sesion_elementos, ...vuelven] }))
    est().avisar(mensaje((res.find((r) => r.status === 'rejected') as PromiseRejectedResult).reason, 'No se ha podido quitar de la sesión.'))
    return false
  }
  return true
}

/** Marca o desmarca tarjetas como comunes a todas las sesiones. */
export async function marcarComun(elementoIds: string[], comun: boolean): Promise<boolean> {
  if (!disponible()) return false
  const actuales = est().elementos_comunes
  const ids = new Set(elementoIds)
  if (comun) {
    const ya = new Set(actuales.map((c) => c.elemento_id))
    const nuevas = [...ids].filter((id) => !ya.has(id)).map((elemento_id) => ({ id: temporal(), elemento_id }))
    if (!nuevas.length) return true
    poner((st) => ({ elementos_comunes: [...st.elementos_comunes, ...nuevas] }))
    const res = await Promise.allSettled(nuevas.map(({ elemento_id }) => repositorio.crear('elementos_comunes', { elemento_id })))
    const cambio = new Map(nuevas.map((n, i) => [n.id, res[i].status === 'fulfilled' ? (res[i] as PromiseFulfilledResult<ElementoComun>).value : null]))
    poner((st) => ({ elementos_comunes: st.elementos_comunes.flatMap((c) => (cambio.has(c.id) ? (cambio.get(c.id) ? [cambio.get(c.id)!] : []) : [c])) }))
    const fallo = res.find((r): r is PromiseRejectedResult => r.status === 'rejected')
    if (fallo) est().avisar(mensaje(fallo.reason, 'No se han podido marcar todas como comunes.'))
    return !fallo
  }
  const quitar = actuales.filter((c) => ids.has(c.elemento_id))
  if (!quitar.length) return true
  const fuera = new Set(quitar.map((c) => c.id))
  poner((st) => ({ elementos_comunes: st.elementos_comunes.filter((c) => !fuera.has(c.id)) }))
  const res = await Promise.allSettled(quitar.map((c) => repositorio.eliminar('elementos_comunes', c.id)))
  const vuelven = quitar.filter((_, i) => res[i].status === 'rejected')
  if (vuelven.length) {
    poner((st) => ({ elementos_comunes: [...st.elementos_comunes, ...vuelven] }))
    est().avisar('No se ha podido quitar la marca de común. Inténtalo de nuevo.')
    return false
  }
  return true
}

/** Organización de una tarjeta desde el editor: deja exactamente esas sesiones y esa marca de común. */
export async function fijarOrganizacion(elementoId: string, sesionIds: string[], comun: boolean) {
  const { sesion_elementos, elementos_comunes, sinSesiones } = est()
  if (sinSesiones) return
  const actuales = new Set(sesion_elementos.filter((r) => r.elemento_id === elementoId).map((r) => r.sesion_id))
  const deseadas = new Set(sesionIds)
  const tareas: Promise<unknown>[] = []
  for (const s of deseadas) if (!actuales.has(s)) tareas.push(asignar([elementoId], s))
  for (const s of actuales) if (!deseadas.has(s)) tareas.push(quitarDeSesion([elementoId], s))
  const eraComun = elementos_comunes.some((c) => c.elemento_id === elementoId)
  if (eraComun !== comun) tareas.push(marcarComun([elementoId], comun))
  await Promise.all(tareas)
}

/** Resumen de la organización de una tarjeta (para el editor y la tarjeta). */
export function organizacionDe(el: Pick<Elemento, 'id'>, rel: SesionElemento[], comunes: ElementoComun[]) {
  return { sesiones: rel.filter((r) => r.elemento_id === el.id).map((r) => r.sesion_id), comun: comunes.some((c) => c.elemento_id === el.id) }
}
