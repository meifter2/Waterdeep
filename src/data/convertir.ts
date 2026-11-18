import { interpretarEnlace } from '../lib/enlaces'
import { nuevoId } from '../lib/id'
import { almacenamientoSeguro } from './storage'
import { TIPOS, carpeta, vacia, type Biblioteca, type Elemento, type Pista, type Recurso, type Tipo } from './types'

// Conversión de formatos antiguos (v2 y v3: una canción por tarjeta) al modelo v4 y copias de seguridad.

export interface CancionAntigua {
  tipo: string
  nombre: string
  enlace: string
  nota: string
}

/** Identidad de un enlace para no duplicar recursos: «spotify:track:ID», «youtube:video:ID»… */
export function claveEnlace(enlace: string): string | null {
  const e = interpretarEnlace(enlace)
  if (typeof e === 'string') return null
  if (e.servicio === 'spotify') return e.uri
  if (e.servicio === 'url') return e.freesoundId ? `freesound:${e.freesoundId}` : `url:${e.url}`
  return e.videoId ? `youtube:video:${e.videoId}` : `youtube:lista:${e.listaId}`
}

export const recursoVacio = (r: Partial<Recurso> & Pick<Recurso, 'origen'>): Recurso => ({
  id: nuevoId(),
  titulo: '',
  descripcion: '',
  enlace: '',
  archivo_ruta: null,
  archivo_nombre: '',
  archivo_tipo: '',
  archivo_bytes: null,
  archivo_hash: null,
  duracion_ms: null,
  ...r,
})

/** Canciones antiguas → biblioteca v4 (un elemento + recurso reutilizado + pista por canción). */
export function desdeCanciones(lista: CancionAntigua[]): Biblioteca {
  const b = vacia()
  const porClave = new Map<string, Recurso>()
  for (const c of lista) {
    if (!c.nombre?.trim()) continue
    const tipo = (TIPOS.includes(c.tipo as Tipo) ? c.tipo : 'personaje') as Tipo
    const el: Elemento = { id: nuevoId(), tipo, nombre: c.nombre.trim().slice(0, 120), descripcion: '', retrato_ruta: null, orden: 0 }
    b.elementos.push(el)
    const clave = claveEnlace(c.enlace ?? '')
    if (!clave) continue
    let r = porClave.get(clave)
    if (!r) {
      r = recursoVacio({ origen: clave.startsWith('spotify:') ? 'spotify' : clave.startsWith('url:') || clave.startsWith('freesound:') ? 'url' : 'youtube', enlace: c.enlace.trim(), titulo: (c.nota ?? '').slice(0, 200) })
      porClave.set(clave, r)
      b.recursos.push(r)
    }
    b.pistas.push({ id: nuevoId(), elemento_id: el.id, recurso_id: r.id, etiqueta: 'Tema principal', inicio_ms: null, fin_ms: null, bucle: carpeta(tipo).bucle, orden: 0 })
  }
  return b
}

const CLAVE_V2 = 'banda-sonora:datos'
const CLAVE_V3 = 'banda-sonora:canciones'
export const CLAVE_V4 = 'banda-sonora:biblioteca'

/** Datos guardados en este navegador por versiones anteriores (o por el modo local v4). */
export function leerDelNavegador(): Biblioteca | null {
  try {
    const v4 = almacenamientoSeguro.getItem(CLAVE_V4)
    if (v4) {
      const r = leerCopia(v4)
      if (typeof r !== 'string') return r
    }
    const v3 = JSON.parse(almacenamientoSeguro.getItem(CLAVE_V3) ?? 'null')
    if (Array.isArray(v3) && v3.length) return desdeCanciones(v3)
    const v2 = JSON.parse(almacenamientoSeguro.getItem(CLAVE_V2) ?? 'null')
    const lista = v2?.state?.personajes
    if (Array.isArray(lista) && lista.length) return desdeCanciones(lista.map((p: CancionAntigua) => ({ ...p, tipo: 'personaje' })))
  } catch {
    /* datos dañados: se ignoran */
  }
  return null
}

export function olvidarDelNavegador() {
  for (const k of [CLAVE_V2, CLAVE_V3, CLAVE_V4]) almacenamientoSeguro.removeItem(k)
}

// ───── Copias de seguridad (v4) ─────

export function exportarCopia(b: Biblioteca): string {
  return JSON.stringify({ version: 4, ...b }, null, 2)
}

const texto = (v: unknown, max: number) => String(v ?? '').slice(0, max)
const ms = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.round(v) : null)

/** Lee una copia v4 (o v3/v2 antiguas). Devuelve la biblioteca o un mensaje de error. */
export function leerCopia(contenido: string): Biblioteca | string {
  let d: Record<string, unknown>
  try {
    d = JSON.parse(contenido)
  } catch {
    return 'El texto no es una copia válida. Usa una copia hecha desde «Copias».'
  }
  if (d?.version === 3 && Array.isArray(d.canciones)) return desdeCanciones(d.canciones as CancionAntigua[])
  if (d?.version === 2 && Array.isArray(d.personajes)) return desdeCanciones((d.personajes as CancionAntigua[]).map((p) => ({ ...p, tipo: 'personaje' })))
  if (d?.version !== 4 || !Array.isArray(d.elementos) || !Array.isArray(d.recursos) || !Array.isArray(d.pistas)) return 'Esta copia no es de DFY (ni de Banda sonora, su nombre anterior).'
  const elementos: Elemento[] = (d.elementos as Record<string, unknown>[])
    .filter((e) => typeof e?.id === 'string' && typeof e.nombre === 'string' && e.nombre.trim())
    .map((e) => ({
      id: e.id as string,
      tipo: (TIPOS.includes(e.tipo as Tipo) ? e.tipo : 'personaje') as Tipo,
      nombre: texto(e.nombre, 120),
      descripcion: texto(e.descripcion, 500),
      retrato_ruta: typeof e.retrato_ruta === 'string' ? e.retrato_ruta : null,
      orden: Number(e.orden) || 0,
    }))
  const recursos: Recurso[] = (d.recursos as Record<string, unknown>[])
    .filter((r) => typeof r?.id === 'string' && ['spotify', 'youtube', 'archivo', 'url'].includes(r.origen as string))
    .map((r) =>
      recursoVacio({
        id: r.id as string,
        origen: r.origen as Recurso['origen'],
        titulo: texto(r.titulo, 200),
        descripcion: texto(r.descripcion, 500),
        enlace: texto(r.enlace, 500),
        archivo_ruta: typeof r.archivo_ruta === 'string' ? r.archivo_ruta : null,
        archivo_nombre: texto(r.archivo_nombre, 200),
        archivo_tipo: texto(r.archivo_tipo, 100),
        archivo_bytes: ms(r.archivo_bytes),
        archivo_hash: typeof r.archivo_hash === 'string' ? r.archivo_hash : null,
        duracion_ms: ms(r.duracion_ms),
      }),
    )
    .filter((r) => (r.origen === 'archivo' ? !!r.archivo_ruta : !!r.enlace))
  const ids = { e: new Set(elementos.map((e) => e.id)), r: new Set(recursos.map((r) => r.id)) }
  const pistas: Pista[] = (d.pistas as Record<string, unknown>[])
    .filter((p) => typeof p?.id === 'string' && ids.e.has(p.elemento_id as string) && ids.r.has(p.recurso_id as string))
    .map((p) => {
      const inicio = ms(p.inicio_ms)
      const fin = ms(p.fin_ms)
      return {
        id: p.id as string,
        elemento_id: p.elemento_id as string,
        recurso_id: p.recurso_id as string,
        etiqueta: texto(p.etiqueta, 60),
        inicio_ms: inicio,
        fin_ms: fin != null && fin > (inicio ?? 0) ? fin : null,
        bucle: p.bucle === true,
        orden: Number(p.orden) || 0,
      }
    })
  return { elementos, recursos, pistas }
}
