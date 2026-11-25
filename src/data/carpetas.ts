import { create } from 'zustand'
import { repositorio } from './repositorio'
import { almacenamientoSeguro } from './storage'
import { compararElementos, useDatos } from './store'
import type { CarpetaElemento, CarpetaTematica, Elemento, Tipo } from './types'

// Carpetas temáticas de Main (bd/005): un nivel dentro de cada categoría. SOLO organizan: guardan en qué carpeta está
// cada tarjeta. Nunca copian ni borran tarjetas, pistas, sonidos o archivos, y NO tocan las sesiones (son independientes).
// Optimistas: la pantalla cambia al momento y, si algo falla, se restaura y se avisa. Nada interrumpe lo que suena.

const est = () => useDatos.getState()
const poner = useDatos.setState
const mensaje = (e: unknown, porDefecto: string) => (e instanceof Error && e.message ? e.message : porDefecto)
const temporal = () => `tmp-${Math.random().toString(36).slice(2)}`
const mismoNombre = (a: string, b: string) => a.trim().toLocaleLowerCase('es') === b.trim().toLocaleLowerCase('es')

function disponible(): boolean {
  const motivo = est().sinCarpetas
  if (!motivo) return true
  est().avisar(motivo)
  return false
}

/** Carpetas de una categoría en su orden (y, a igualdad, por nombre con números naturales). */
export const carpetasDe = (tipo: Tipo, carpetas: CarpetaTematica[]) =>
  carpetas.filter((c) => c.tipo === tipo).sort((a, b) => a.orden - b.orden || a.nombre.localeCompare(b.nombre, 'es', { numeric: true }))

/** Carpeta de una tarjeta, o null («Sin carpeta»). Una relación con una carpeta de otra categoría no cuenta. */
export function carpetaDe(el: Pick<Elemento, 'id' | 'tipo'>, rel: CarpetaElemento[], carpetas: CarpetaTematica[]): string | null {
  const r = rel.find((x) => x.elemento_id === el.id)
  const c = r && carpetas.find((x) => x.id === r.carpeta_id)
  return c && c.tipo === el.tipo ? c.id : null
}

// ───── Abiertas / cerradas (por navegador: es solo cómo la ves) ─────

const CLAVE_CERRADAS = 'banda-sonora:carpetas-cerradas'
const leerCerradas = (): string[] => {
  try {
    const v = JSON.parse(almacenamientoSeguro.getItem(CLAVE_CERRADAS) ?? '[]')
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : []
  } catch {
    return []
  }
}

/** Clave del grupo «Sin carpeta» de una categoría (para abrirlo o cerrarlo como una carpeta más). */
export const sinCarpeta = (tipo: Tipo) => `sin-${tipo}`

export const useCarpetasCerradas = create<{ cerradas: string[]; alternar: (id: string) => void }>()((set) => ({
  cerradas: leerCerradas(),
  alternar: (id) =>
    set((s) => {
      const cerradas = s.cerradas.includes(id) ? s.cerradas.filter((x) => x !== id) : [...s.cerradas, id]
      almacenamientoSeguro.setItem(CLAVE_CERRADAS, JSON.stringify(cerradas))
      return { cerradas }
    }),
}))

// ───── Carpetas ─────

export async function crearCarpeta(tipo: Tipo, nombre: string): Promise<CarpetaTematica | null> {
  const limpio = nombre.trim().slice(0, 60)
  if (!limpio || !disponible()) return null
  const hermanas = carpetasDe(tipo, est().carpetas)
  if (hermanas.some((c) => mismoNombre(c.nombre, limpio))) {
    est().avisar(`Ya hay una carpeta «${limpio}» en esta categoría.`)
    return null
  }
  try {
    const c = await repositorio.crear('carpetas', { tipo, nombre: limpio, orden: Math.max(0, ...hermanas.map((x) => x.orden)) + 1 })
    poner((s) => ({ carpetas: [...s.carpetas, c] }))
    return c
  } catch (e) {
    est().avisar(mensaje(e, 'No se ha podido crear la carpeta. Inténtalo de nuevo.'))
    return null
  }
}

export async function renombrarCarpeta(id: string, nombre: string): Promise<boolean> {
  const limpio = nombre.trim().slice(0, 60)
  const c = est().carpetas.find((x) => x.id === id)
  if (!limpio || !c || c.nombre === limpio || !disponible()) return false
  if (est().carpetas.some((x) => x.id !== id && x.tipo === c.tipo && mismoNombre(x.nombre, limpio))) {
    est().avisar(`Ya hay una carpeta «${limpio}» en esta categoría.`)
    return false
  }
  const antes = est().carpetas
  poner({ carpetas: antes.map((x) => (x.id === id ? { ...x, nombre: limpio } : x)) })
  try {
    await repositorio.actualizar('carpetas', id, { nombre: limpio })
    return true
  } catch (e) {
    poner({ carpetas: antes })
    est().avisar(mensaje(e, 'No se ha podido renombrar la carpeta.'))
    return false
  }
}

/** Sube (-1) o baja (+1) una carpeta entre las de su categoría. */
export async function moverCarpeta(id: string, paso: -1 | 1) {
  const c = est().carpetas.find((x) => x.id === id)
  if (!c || !disponible()) return
  const lista = carpetasDe(c.tipo, est().carpetas)
  const i = lista.findIndex((x) => x.id === id)
  const j = i + paso
  if (j < 0 || j >= lista.length) return
  ;[lista[i], lista[j]] = [lista[j], lista[i]]
  const nuevo = new Map(lista.map((x, k) => [x.id, k + 1]))
  const antes = est().carpetas
  const cambios = antes.filter((x) => nuevo.has(x.id) && x.orden !== nuevo.get(x.id))
  poner({ carpetas: antes.map((x) => (nuevo.has(x.id) ? { ...x, orden: nuevo.get(x.id)! } : x)) })
  try {
    await Promise.all(cambios.map((x) => repositorio.actualizar('carpetas', x.id, { orden: nuevo.get(x.id)! })))
  } catch {
    await Promise.allSettled(cambios.map((x) => repositorio.actualizar('carpetas', x.id, { orden: x.orden })))
    poner({ carpetas: antes })
    est().avisar('No se ha podido cambiar el orden de las carpetas. Inténtalo de nuevo.')
  }
}

/** Elimina la carpeta. Sus tarjetas pasan a «Sin carpeta»: no se borra ninguna tarjeta, sonido ni sesión. */
export async function eliminarCarpeta(id: string): Promise<boolean> {
  if (!disponible()) return false
  const { carpetas, carpeta_elementos } = est()
  poner({ carpetas: carpetas.filter((c) => c.id !== id), carpeta_elementos: carpeta_elementos.filter((r) => r.carpeta_id !== id) })
  try {
    await repositorio.eliminar('carpetas', id)
    return true
  } catch (e) {
    poner({ carpetas, carpeta_elementos })
    est().avisar(mensaje(e, 'No se ha podido eliminar la carpeta. Inténtalo de nuevo.'))
    return false
  }
}

// ───── Tarjetas en carpetas ─────

/**
 * Mueve tarjetas a una carpeta (o a «Sin carpeta» con null). Solo las de la misma categoría que la carpeta; las demás se
 * quedan donde estaban. Las movidas se colocan al final de su nuevo grupo. Sus sesiones no cambian.
 * Devuelve cuántas se han movido y cuántas no eran de esa categoría (null si falló todo).
 */
export async function moverACarpeta(elementoIds: string[], carpetaId: string | null, tipoDestino?: Tipo): Promise<{ movidas: number; omitidas: number } | null> {
  if (!disponible()) return null
  const s0 = est()
  const destino = carpetaId ? s0.carpetas.find((c) => c.id === carpetaId) : null
  if (carpetaId && !destino) return null
  const tipo = destino?.tipo ?? tipoDestino
  const pedidas = s0.elementos.filter((e) => elementoIds.includes(e.id))
  const validas = pedidas.filter((e) => !tipo || e.tipo === tipo)
  const omitidas = pedidas.length - validas.length
  const mover = validas.filter((e) => carpetaDe(e, s0.carpeta_elementos, s0.carpetas) !== (carpetaId ?? null))
  if (!mover.length) return { movidas: 0, omitidas }

  const antes = s0.carpeta_elementos
  const ids = new Set(mover.map((e) => e.id))
  const previas = new Map(antes.filter((r) => ids.has(r.elemento_id)).map((r) => [r.elemento_id, r]))
  const nuevas = carpetaId ? mover.map((e) => ({ id: previas.get(e.id)?.id ?? temporal(), carpeta_id: carpetaId, elemento_id: e.id })) : []
  poner({ carpeta_elementos: [...antes.filter((r) => !ids.has(r.elemento_id)), ...nuevas] })

  const tareas = mover.map(async (e) => {
    const previa = previas.get(e.id)
    if (!carpetaId) return previa ? repositorio.eliminar('carpeta_elementos', previa.id).then(() => null) : null
    if (previa) return repositorio.actualizar('carpeta_elementos', previa.id, { carpeta_id: carpetaId }).then(() => null)
    return repositorio.crear('carpeta_elementos', { carpeta_id: carpetaId, elemento_id: e.id })
  })
  const res = await Promise.allSettled(tareas)
  // Las filas nuevas toman su id real; las que fallaron vuelven a su sitio anterior.
  const fallidas = new Set(mover.filter((_, i) => res[i].status === 'rejected').map((e) => e.id))
  const creadas = new Map<string, CarpetaElemento>()
  res.forEach((r, i) => {
    if (r.status === 'fulfilled' && r.value) creadas.set(mover[i].id, r.value)
  })
  poner((st) => ({
    carpeta_elementos: [
      ...st.carpeta_elementos.filter((r) => !fallidas.has(r.elemento_id)).map((r) => creadas.get(r.elemento_id) ?? r),
      ...antes.filter((r) => fallidas.has(r.elemento_id)),
    ],
  }))
  const fallo = res.find((r): r is PromiseRejectedResult => r.status === 'rejected')
  if (fallo) est().avisar(mensaje(fallo.reason, 'No se han podido mover todas las tarjetas. Inténtalo de nuevo.'))
  const movidas = mover.filter((e) => !fallidas.has(e.id))
  if (movidas.length) await alFinal(movidas, carpetaId)
  return { movidas: movidas.length, omitidas }
}

/** Coloca tarjetas al final de su grupo (carpeta o «Sin carpeta») sin cambiar el orden de las demás. */
async function alFinal(movidas: Elemento[], carpetaId: string | null) {
  const { elementos, carpeta_elementos, carpetas } = est()
  const porTipo = new Map<Tipo, Elemento[]>()
  for (const e of movidas) porTipo.set(e.tipo, [...(porTipo.get(e.tipo) ?? []), e])
  for (const [tipo, suyas] of porTipo) {
    const mias = new Set(suyas.map((e) => e.id))
    const grupo = elementos
      .filter((e) => e.tipo === tipo && !mias.has(e.id) && carpetaDe(e, carpeta_elementos, carpetas) === carpetaId)
      .sort(compararElementos)
      .map((e) => e.id)
    await est().reordenar(tipo, [...grupo, ...[...suyas].sort(compararElementos).map((e) => e.id)])
  }
}

/** Desde el editor: deja la tarjeta en esa carpeta (o sin carpeta). */
export async function fijarCarpeta(el: Pick<Elemento, 'id' | 'tipo'>, carpetaId: string | null) {
  const { carpeta_elementos, carpetas, sinCarpetas } = est()
  if (sinCarpetas) return
  const vieja = carpeta_elementos.find((r) => r.elemento_id === el.id)
  // Cambió de categoría: su relación con una carpeta de la categoría anterior ya no vale (vuelve a «Sin carpeta»).
  if (!carpetaId && vieja && carpetaDe(el, carpeta_elementos, carpetas) === null) {
    poner((s) => ({ carpeta_elementos: s.carpeta_elementos.filter((r) => r.id !== vieja.id) }))
    await repositorio.eliminar('carpeta_elementos', vieja.id).catch((e) => {
      poner((s) => ({ carpeta_elementos: [...s.carpeta_elementos, vieja] }))
      est().avisar(mensaje(e, 'No se ha podido sacar la tarjeta de su carpeta.'))
    })
    return
  }
  if (carpetaDe(el, carpeta_elementos, carpetas) !== carpetaId) await moverACarpeta([el.id], carpetaId, el.tipo)
}
