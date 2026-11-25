import { duracionAudio, extension, huella, tipoAudio, validarAudio } from '../lib/archivos'
import { interpretarEnlace } from '../lib/enlaces'
import { claveEnlace, recursoVacio } from './convertir'
import { crearCarpeta, moverACarpeta } from './carpetas'
import { repositorio } from './repositorio'
import { asignar, crearSesion, marcarComun, marcarFinalizada, sesionVigente, useSesionActiva } from './sesiones'
import { ordenNuevo, useDatos } from './store'
import { carpeta, type Biblioteca, type Elemento, type Pista, type Recurso, type Tipo } from './types'

// Operaciones de varias filas: guardar un elemento con sus pistas, añadir un sonido compartido
// e importar copias. Cada paso que se completa se refleja al momento en la app; si uno falla,
// se lanza el error con un mensaje claro y lo ya guardado queda bien reflejado.

/** Enlace (Spotify, YouTube o audio en internet; de este último se puede saber ya la duración) o archivo para subir. */
export type FuenteNueva =
  | { tipo: 'enlace'; enlace: string; duracion_ms?: number | null; descripcion?: string }
  | { tipo: 'archivo'; archivo: File }

export interface BorradorPista {
  /** Pista ya guardada (si se está editando). */
  id?: string
  /** Recurso existente de la biblioteca… */
  recursoId?: string
  /** …o sonido nuevo (enlace o archivo). */
  nueva?: FuenteNueva
  titulo: string
  etiqueta: string
  inicio_ms: number | null
  fin_ms: number | null
  bucle: boolean
}

export type CambioRetrato = { accion: 'mantener' } | { accion: 'quitar' } | { accion: 'nuevo'; imagen: Blob }

export interface Borrador {
  id?: string
  tipo: Tipo
  nombre: string
  descripcion: string
  retrato: CambioRetrato
  pistas: BorradorPista[]
}

const est = () => useDatos.getState()

/** Devuelve el recurso de la biblioteca para un enlace o archivo, reutilizándolo si ya existe. */
export async function resolverRecurso(f: FuenteNueva, titulo: string): Promise<Recurso> {
  if (f.tipo === 'enlace') {
    const clave = claveEnlace(f.enlace)
    const e = interpretarEnlace(f.enlace)
    if (!clave || typeof e === 'string') throw new Error(typeof e === 'string' ? e : 'Enlace no válido.')
    const ya = est().recursos.find((r) => r.origen !== 'archivo' && claveEnlace(r.enlace) === clave)
    if (ya) return ya
    const { id: _id, ...datos } = recursoVacio({
      origen: e.servicio,
      // Enlace de audio: se guarda ya normalizado (Dropbox con raw=1; Freesound con su #freesound=ID).
      enlace: e.servicio === 'url' ? e.web : f.enlace.trim(),
      // Créditos (p. ej. de Freesound): autor, licencia y página de origen.
      descripcion: (f.descripcion ?? '').slice(0, 500),
      titulo: (titulo || (e.servicio === 'url' ? e.nombre : '')).slice(0, 200),
      duracion_ms: e.servicio === 'url' ? (f.duracion_ms ?? null) : null,
    })
    const r = await repositorio.crear('recursos', datos)
    est().fusionar({ recursos: [r] })
    return r
  }
  validarAudio(f.archivo)
  const hash = await huella(f.archivo)
  const ya = est().recursos.find((r) => r.archivo_hash === hash)
  if (ya) return ya
  const tipo = tipoAudio(f.archivo)
  const conTipo = f.archivo.type === tipo ? f.archivo : new Blob([f.archivo], { type: tipo })
  const [ruta, duracion] = await Promise.all([repositorio.subir('audio', conTipo, extension(f.archivo.name)), duracionAudio(f.archivo)])
  try {
    const { id: _id, ...datos } = recursoVacio({
      origen: 'archivo',
      titulo: (titulo || f.archivo.name.replace(/\.[^.]+$/, '')).slice(0, 200),
      archivo_ruta: ruta,
      archivo_nombre: f.archivo.name.slice(0, 200),
      archivo_tipo: tipo,
      archivo_bytes: f.archivo.size,
      archivo_hash: hash,
      duracion_ms: duracion,
    })
    const r = await repositorio.crear('recursos', datos)
    est().fusionar({ recursos: [r] })
    return r
  } catch (e) {
    await repositorio.borrarArchivos('audio', [ruta]).catch(() => {})
    throw e
  }
}

/**
 * Guarda un elemento nuevo o editado con todas sus pistas. Devuelve el elemento guardado.
 * `progreso` sobrevive entre reintentos: si un guardado falla a mitad, el siguiente actualiza
 * el elemento ya creado en lugar de duplicarlo.
 */
export async function guardarElemento(b: Borrador, progreso: { elementoId?: string } = {}): Promise<Elemento> {
  // 1) Recursos: nuevos (subidas incluidas) y títulos editados.
  const recursoIds: string[] = []
  for (const p of b.pistas) {
    if (p.nueva) recursoIds.push((await resolverRecurso(p.nueva, p.titulo)).id)
    else recursoIds.push(p.recursoId!)
  }
  for (const [i, p] of b.pistas.entries()) {
    const r = est().recursos.find((x) => x.id === recursoIds[i])
    if (r && p.titulo.trim() && r.titulo !== p.titulo.trim()) {
      await repositorio.actualizar('recursos', r.id, { titulo: p.titulo.trim().slice(0, 200) })
      est().fusionar({ recursos: [{ ...r, titulo: p.titulo.trim().slice(0, 200) }] })
    }
  }

  // 2) Retrato.
  const idPrevio = b.id ?? progreso.elementoId
  const anterior = idPrevio ? est().elementos.find((e) => e.id === idPrevio) : undefined
  let retrato_ruta = anterior?.retrato_ruta ?? null
  if (b.retrato.accion === 'nuevo') {
    retrato_ruta = await repositorio.subir('retratos', b.retrato.imagen, 'webp')
    useDatos.setState((s) => ({ urls: { ...s.urls, [retrato_ruta!]: URL.createObjectURL((b.retrato as { imagen: Blob }).imagen) } }))
  } else if (b.retrato.accion === 'quitar') retrato_ruta = null

  // 3) Elemento.
  const datos = { tipo: b.tipo, nombre: b.nombre.trim().slice(0, 120), descripcion: b.descripcion.trim().slice(0, 500), retrato_ruta }
  let elemento: Elemento
  try {
    if (anterior) {
      // Si cambia de carpeta, entra en la nueva como un elemento nuevo (al final si esa carpeta está ordenada a mano).
      const conOrden = anterior.tipo === datos.tipo ? datos : { ...datos, orden: ordenNuevo(est().elementos, datos.tipo) }
      await repositorio.actualizar('elementos', anterior.id, conOrden)
      elemento = { ...anterior, ...conOrden }
    } else elemento = await repositorio.crear('elementos', { ...datos, orden: ordenNuevo(est().elementos, datos.tipo) })
  } catch (e) {
    if (b.retrato.accion === 'nuevo' && retrato_ruta) await repositorio.borrarArchivos('retratos', [retrato_ruta]).catch(() => {})
    throw e
  }
  progreso.elementoId = elemento.id
  est().fusionar({ elementos: [elemento] })
  if (anterior?.retrato_ruta && anterior.retrato_ruta !== retrato_ruta)
    await repositorio.borrarArchivos('retratos', [anterior.retrato_ruta]).catch(() => {})

  // 4) Pistas: quitar las que ya no están, actualizar las cambiadas y crear las nuevas.
  const existentes = est().pistas.filter((p) => p.elemento_id === elemento.id)
  const quedan = new Set(b.pistas.map((p) => p.id).filter(Boolean))
  for (const p of existentes.filter((x) => !quedan.has(x.id))) {
    await repositorio.eliminar('pistas', p.id)
    est().fusionar({ quitarPistas: [p.id] })
  }
  for (const [orden, p] of b.pistas.entries()) {
    const valores = { recurso_id: recursoIds[orden], etiqueta: p.etiqueta.trim().slice(0, 60), inicio_ms: p.inicio_ms, fin_ms: p.fin_ms, bucle: p.bucle, orden }
    const previa = p.id ? existentes.find((x) => x.id === p.id) : undefined
    if (previa) {
      const cambiada = (Object.keys(valores) as (keyof typeof valores)[]).some((k) => previa[k] !== valores[k])
      if (cambiada) {
        await repositorio.actualizar('pistas', previa.id, valores)
        est().fusionar({ pistas: [{ ...previa, ...valores }] })
      }
    } else {
      const nueva = await repositorio.crear('pistas', { elemento_id: elemento.id, ...valores })
      est().fusionar({ pistas: [nueva] })
    }
  }
  return elemento
}

/** Añade un sonido (compartido desde otra app) a un elemento existente o a uno nuevo. */
export async function anadirSonido(o: {
  fuente: FuenteNueva
  titulo: string
  etiqueta: string
  elementoId?: string
  nuevo?: { tipo: Tipo; nombre: string }
}): Promise<Elemento> {
  const recurso = await resolverRecurso(o.fuente, o.titulo)
  let el = o.elementoId ? est().elementos.find((e) => e.id === o.elementoId) : undefined
  if (!el) {
    el = await repositorio.crear('elementos', { tipo: o.nuevo!.tipo, nombre: o.nuevo!.nombre.trim().slice(0, 120), descripcion: '', retrato_ruta: null, orden: ordenNuevo(est().elementos, o.nuevo!.tipo) })
    est().fusionar({ elementos: [el] })
    // Creada dentro de una sesión: queda en esa sesión (si falla, la tarjeta sigue en la biblioteca y se avisa).
    const activa = sesionVigente(useSesionActiva.getState().activa, est().sesiones)
    if (activa) await asignar([el.id], activa.id)
  }
  const orden = est().pistas.filter((p) => p.elemento_id === el!.id).length
  const pista = await repositorio.crear('pistas', {
    elemento_id: el.id,
    recurso_id: recurso.id,
    etiqueta: o.etiqueta.trim().slice(0, 60),
    inicio_ms: null,
    fin_ms: null,
    bucle: carpeta(el.tipo).bucle,
    orden,
  })
  est().fusionar({ pistas: [pista] })
  return el
}

/** Importa una biblioteca (copia o datos antiguos) sin duplicar sonidos. */
export async function importarBiblioteca(b: Biblioteca): Promise<{ elementos: number; omitidos: number; sesiones: number; carpetas: number }> {
  const mapa = new Map<string, string>()
  let omitidos = 0
  for (const r of b.recursos) {
    if (r.origen !== 'archivo') {
      mapa.set(r.id, (await resolverRecurso({ tipo: 'enlace', enlace: r.enlace, descripcion: r.descripcion, duracion_ms: r.duracion_ms }, r.titulo)).id)
      continue
    }
    // Un archivo propio solo se puede enlazar si ya está en esta cuenta (misma huella o ruta).
    const ya = est().recursos.find((x) => (r.archivo_hash && x.archivo_hash === r.archivo_hash) || (r.archivo_ruta && x.archivo_ruta === r.archivo_ruta))
    if (ya) mapa.set(r.id, ya.id)
    else omitidos++
  }
  let elementos = 0
  const nuevosIds = new Map<string, string>()
  for (const e of b.elementos) {
    const nuevo = await repositorio.crear('elementos', { tipo: e.tipo, nombre: e.nombre, descripcion: e.descripcion, retrato_ruta: null, orden: e.orden })
    est().fusionar({ elementos: [nuevo] })
    nuevosIds.set(e.id, nuevo.id)
    elementos++
    const suyas: Pista[] = b.pistas.filter((p) => p.elemento_id === e.id && mapa.has(p.recurso_id))
    for (const p of suyas) {
      const { id: _id, ...resto } = p
      const creada = await repositorio.crear('pistas', { ...resto, elemento_id: nuevo.id, recurso_id: mapa.get(p.recurso_id)! })
      est().fusionar({ pistas: [creada] })
    }
  }
  const sesiones = await importarSesiones(b, nuevosIds)
  return { elementos, omitidos, sesiones, carpetas: await importarCarpetas(b, nuevosIds) }
}

/**
 * Carpetas de Main de una copia (todas, también las vacías): se reutiliza la de igual categoría y nombre o se crea, y se
 * meten en ella sus tarjetas importadas. Sin bd/005 se omite (las tarjetas quedan en «Sin carpeta»).
 */
async function importarCarpetas(b: Biblioteca, ids: Map<string, string>): Promise<number> {
  if (!b.carpetas.length || est().sinCarpetas) return 0
  for (const c of [...b.carpetas].sort((x, y) => x.orden - y.orden)) {
    const misma = est().carpetas.find((x) => x.tipo === c.tipo && x.nombre.trim().toLowerCase() === c.nombre.trim().toLowerCase())
    const destino = misma ?? (await crearCarpeta(c.tipo, c.nombre))
    if (!destino) continue
    const suyas = b.carpeta_elementos.filter((r) => r.carpeta_id === c.id).map((r) => ids.get(r.elemento_id)).filter((x): x is string => !!x)
    if (suyas.length) await moverACarpeta(suyas, destino.id)
  }
  return b.carpetas.length
}

/**
 * Sesiones de una copia (si las trae): se reutiliza la sesión con el mismo nombre o se crea, y se enlazan las tarjetas
 * importadas. Sin bd/004 se omite (las tarjetas ya están añadidas). Devuelve cuántas sesiones se han usado.
 */
async function importarSesiones(b: Biblioteca, ids: Map<string, string>): Promise<number> {
  const usadas = b.sesiones.filter((s) => b.sesion_elementos.some((r) => r.sesion_id === s.id && ids.has(r.elemento_id)))
  const comunes = b.elementos_comunes.map((c) => ids.get(c.elemento_id)).filter((x): x is string => !!x)
  if ((!usadas.length && !comunes.length) || est().sinSesiones) return 0
  for (const s of usadas) {
    const misma = est().sesiones.find((x) => x.nombre.trim().toLowerCase() === s.nombre.trim().toLowerCase())
    const destino = misma ?? (await crearSesion(s.nombre))
    if (!destino) continue
    if (!misma && s.finalizada) await marcarFinalizada(destino.id, true)
    const suyas = b.sesion_elementos.filter((r) => r.sesion_id === s.id).map((r) => ids.get(r.elemento_id)).filter((x): x is string => !!x)
    await asignar(suyas, destino.id)
  }
  if (comunes.length) await marcarComun(comunes, true)
  return usadas.length
}
