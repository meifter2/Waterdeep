import { ErrorArchivo, localBorrar, localGuardar, localLeer } from '../lib/archivos'
import { nuevoId } from '../lib/id'
import { supabase } from '../lib/supabase'
import { CLAVE_V4, exportarCopia, leerCopia, leerDelNavegador } from './convertir'
import { almacenamientoSeguro } from './storage'
import { TABLAS_CARPETAS, TABLAS_SESIONES, vacia, type Biblioteca, type Tabla } from './types'

// Dónde se guarda la biblioteca: Supabase (tablas + Storage privado) o el navegador (modo local).
// El resto de la app usa esta interfaz y no sabe cuál hay detrás.

export type Fila<T extends Tabla> = Biblioteca[T][number]
export type Bucket = 'audio' | 'retratos'

/**
 * Biblioteca cargada. `sinSesiones` = por qué no se pueden usar las sesiones (bd/004 sin ejecutar u otro fallo al
 * leerlas): la biblioteca carga y funciona igual; solo la organización por sesiones queda en pausa.
 */
export type Cargada = Biblioteca & { sinSesiones?: string; sinCarpetas?: string }

export const FALTA_005 = 'Para crear carpetas en Main falta un paso en la base de datos: ejecuta bd/005-carpetas-biblioteca.sql en Supabase (SQL Editor) y recarga.'
export const FALTA_004 = 'Para organizar por sesiones falta un paso en la base de datos: ejecuta bd/004-sesiones.sql en Supabase (SQL Editor) y recarga.'

export interface Repositorio {
  listar(): Promise<Cargada>
  crear<T extends Tabla>(t: T, d: Omit<Fila<T>, 'id'>): Promise<Fila<T>>
  actualizar<T extends Tabla>(t: T, id: string, cambios: Partial<Fila<T>>): Promise<void>
  eliminar(t: Tabla, id: string): Promise<void>
  /** Sube un archivo y devuelve su ruta. */
  subir(bucket: Bucket, archivo: Blob, extension: string): Promise<string>
  borrarArchivos(bucket: Bucket, rutas: string[]): Promise<void>
  /** Direcciones temporales para reproducir o mostrar archivos privados. */
  urls(bucket: Bucket, rutas: string[]): Promise<Record<string, string>>
}

export class ErrorDatos extends Error {}

const COLUMNAS: Record<Tabla, string> = {
  elementos: 'id, tipo, nombre, descripcion, retrato_ruta, orden',
  recursos: 'id, origen, titulo, descripcion, enlace, archivo_ruta, archivo_nombre, archivo_tipo, archivo_bytes, archivo_hash, duracion_ms',
  pistas: 'id, elemento_id, recurso_id, etiqueta, inicio_ms, fin_ms, bucle, orden',
  sesiones: 'id, nombre, finalizada, orden',
  sesion_elementos: 'id, sesion_id, elemento_id',
  elementos_comunes: 'id, elemento_id',
  carpetas: 'id, tipo, nombre, orden',
  carpeta_elementos: 'id, carpeta_id, elemento_id',
}

const esSesiones = (t?: Tabla) => !!t && (TABLAS_SESIONES as readonly string[]).includes(t)
const esCarpetas = (t?: Tabla) => !!t && (TABLAS_CARPETAS as readonly string[]).includes(t)
const FALTA_TABLA = /PGRST205|42P01|does not exist|schema cache/i

const DURACION_URL = 6 * 60 * 60 // 6 h: una sesión de juego larga

function traducir(error: { code?: string; message?: string }, tabla?: Tabla): ErrorDatos {
  const m = `${error.code ?? ''} ${error.message ?? ''}`
  if (esSesiones(tabla) && FALTA_TABLA.test(m))
    return new ErrorDatos(FALTA_004)
  if (esCarpetas(tabla) && FALTA_TABLA.test(m)) return new ErrorDatos(FALTA_005)
  if (tabla === 'carpetas' && /23505|duplicate key/i.test(m)) return new ErrorDatos('Ya hay una carpeta con ese nombre en esta categoría.')
  if (tabla === 'carpeta_elementos' && /23514|categor/i.test(m)) return new ErrorDatos('Una tarjeta solo puede ir a una carpeta de su misma categoría.')
  if (esSesiones(tabla) && /23505|duplicate key/i.test(m)) return new ErrorDatos('Esa tarjeta ya estaba en esa sesión.')
  if (FALTA_TABLA.test(m))
    return new ErrorDatos('Falta preparar la base de datos: ejecuta bd/002-biblioteca.sql en Supabase (SQL Editor) y recarga.')
  if (/23514|recursos_origen_check|recursos_url_https_check/i.test(m))
    return new ErrorDatos('Para guardar enlaces de audio falta un paso en la base de datos: ejecuta bd/003-enlaces-audio.sql en Supabase (SQL Editor).')
  if (/JWT|401|permission|42501/i.test(m)) return new ErrorDatos('Tu sesión ha caducado o no tienes permiso. Sal y vuelve a entrar.')
  return new ErrorDatos('No se ha podido guardar. Revisa la conexión e inténtalo de nuevo.')
}

function errorSubida(e: { message?: string; statusCode?: string | number } | null): ErrorArchivo {
  const m = `${e?.statusCode ?? ''} ${e?.message ?? ''}`
  if (/413|too large|maximum allowed size|exceeded/i.test(m)) return new ErrorArchivo('El archivo supera el tamaño máximo permitido (50 MB) o se ha llenado tu espacio en Supabase.')
  if (/mime|not supported|invalid_mime/i.test(m)) return new ErrorArchivo('Supabase no acepta ese formato. Usa MP3, M4A, OGG, WAV, WEBM o FLAC.')
  if (/bucket not found|404/i.test(m)) return new ErrorArchivo('Falta crear el almacenamiento: ejecuta bd/002-biblioteca.sql en Supabase.')
  if (/403|row-level|policy|unauthorized/i.test(m)) return new ErrorArchivo('No tienes permiso para subir archivos. Sal y vuelve a entrar.')
  return new ErrorArchivo('No se ha podido subir el archivo. Revisa la conexión e inténtalo de nuevo.')
}

function repoSupabase(): Repositorio {
  const sb = supabase!
  const uid = async () => {
    const { data } = await sb.auth.getSession()
    const id = data.session?.user.id
    if (!id) throw new ErrorDatos('Tu sesión ha caducado. Sal y vuelve a entrar.')
    return id
  }
  return {
    async listar() {
      const [e, r, p] = await Promise.all(
        (['elementos', 'recursos', 'pistas'] as Tabla[]).map((t) => sb.from(t).select(COLUMNAS[t]).order('creado')),
      )
      const error = e.error ?? r.error ?? p.error
      if (error) throw traducir(error)
      const b = { ...vacia(), elementos: e.data, recursos: r.data, pistas: p.data } as unknown as Cargada
      // Sesiones (bd/004) y carpetas de Main (bd/005) son opcionales: si faltan o fallan, la biblioteca carga igual y se
      // avisa al usarlas. Nunca se espera más de 8 s por ellas.
      const opcional = async (tablas: readonly Tabla[], falta: string, nombre: string): Promise<string> => {
        const fallo = `No se han podido cargar tus ${nombre} (tus tarjetas están bien). Recarga la página para organizarlas.`
        const espera = new Promise<null>((ok) => setTimeout(() => ok(null), 8000))
        const res = await Promise.race([Promise.all(tablas.map((t) => sb.from(t).select(COLUMNAS[t]).order('creado'))), espera])
        if (!res) return fallo
        const error = res.find((x) => x.error)?.error
        if (error) return FALTA_TABLA.test(`${error.code ?? ''} ${error.message ?? ''}`) ? falta : fallo
        tablas.forEach((t, i) => ((b as unknown as Record<string, unknown>)[t] = res[i].data))
        return ''
      }
      const [sinSesiones, sinCarpetas] = await Promise.all([opcional(TABLAS_SESIONES, FALTA_004, 'sesiones'), opcional(TABLAS_CARPETAS, FALTA_005, 'carpetas')])
      if (sinSesiones) b.sinSesiones = sinSesiones
      if (sinCarpetas) b.sinCarpetas = sinCarpetas
      return b
    },
    async crear(t, d) {
      const { data, error } = await sb.from(t).insert(d as never).select(COLUMNAS[t]).single()
      if (error) throw traducir(error, t)
      return data as never
    },
    async actualizar(t, id, cambios) {
      const { error } = await sb.from(t).update(cambios as never).eq('id', id)
      if (error) throw traducir(error, t)
    },
    async eliminar(t, id) {
      const { error } = await sb.from(t).delete().eq('id', id)
      if (error) throw traducir(error, t)
    },
    async subir(bucket, archivo, ext) {
      const ruta = `${await uid()}/${nuevoId()}${ext ? `.${ext}` : ''}`
      let res
      try {
        res = await sb.storage.from(bucket).upload(ruta, archivo, { contentType: archivo.type, upsert: false, cacheControl: '31536000' })
      } catch {
        throw errorSubida(null)
      }
      if (res.error) throw errorSubida(res.error as { message?: string; statusCode?: string })
      return ruta
    },
    async borrarArchivos(bucket, rutas) {
      if (rutas.length) await sb.storage.from(bucket).remove(rutas)
    },
    async urls(bucket, rutas) {
      if (!rutas.length) return {}
      const { data, error } = await sb.storage.from(bucket).createSignedUrls(rutas, DURACION_URL)
      if (error) throw errorSubida(error as { message?: string })
      const mapa: Record<string, string> = {}
      for (const x of data ?? []) if (x.path && x.signedUrl) mapa[x.path] = x.signedUrl
      return mapa
    },
  }
}

function repoLocal(): Repositorio {
  const leer = (): Biblioteca => {
    const guardado = almacenamientoSeguro.getItem(CLAVE_V4)
    if (guardado) {
      const r = leerCopia(guardado)
      return typeof r === 'string' ? vacia() : r
    }
    // Primera vez con esta versión: se convierten los datos de versiones anteriores (no se borran).
    const antiguo = leerDelNavegador() ?? vacia()
    escribir(antiguo)
    return antiguo
  }
  const escribir = (b: Biblioteca) => almacenamientoSeguro.setItem(CLAVE_V4, exportarCopia(b))
  const urlsCreadas = new Map<string, string>()
  return {
    async listar() {
      return leer()
    },
    async crear(t, d) {
      const b = leer()
      // Mismas reglas de unicidad que en la base de datos (bd/004).
      const x = d as { sesion_id?: string; elemento_id?: string }
      if (t === 'sesion_elementos' && b.sesion_elementos.some((r) => r.sesion_id === x.sesion_id && r.elemento_id === x.elemento_id))
        throw new ErrorDatos('Esa tarjeta ya estaba en esa sesión.')
      if (t === 'elementos_comunes' && b.elementos_comunes.some((r) => r.elemento_id === x.elemento_id)) throw new ErrorDatos('Esa tarjeta ya era común.')
      if (t === 'carpeta_elementos' && b.carpeta_elementos.some((r) => r.elemento_id === x.elemento_id)) throw new ErrorDatos('Esa tarjeta ya está en una carpeta.')
      const c = d as { tipo?: string; nombre?: string }
      if (t === 'carpetas' && b.carpetas.some((r) => r.tipo === c.tipo && r.nombre.trim().toLowerCase() === c.nombre?.trim().toLowerCase()))
        throw new ErrorDatos('Ya hay una carpeta con ese nombre en esta categoría.')
      const fila = { ...d, id: nuevoId() } as Fila<typeof t>
      ;(b[t] as Fila<typeof t>[]).push(fila)
      escribir(b)
      return fila as never
    },
    async actualizar(t, id, cambios) {
      const b = leer()
      b[t] = (b[t] as Fila<typeof t>[]).map((f) => (f.id === id ? { ...f, ...cambios } : f)) as never
      escribir(b)
    },
    async eliminar(t, id) {
      const b = leer()
      b[t] = (b[t] as { id: string }[]).filter((f) => f.id !== id) as never
      // Mismas cascadas que en la base de datos: las pistas dependen de elemento y recurso.
      if (t === 'elementos') b.pistas = b.pistas.filter((p) => p.elemento_id !== id)
      if (t === 'recursos') b.pistas = b.pistas.filter((p) => p.recurso_id !== id)
      // Sesiones: borrar una tarjeta o una sesión quita solo sus relaciones (nunca tarjetas ni sonidos).
      if (t === 'elementos') {
        b.sesion_elementos = b.sesion_elementos.filter((x) => x.elemento_id !== id)
        b.elementos_comunes = b.elementos_comunes.filter((x) => x.elemento_id !== id)
        b.carpeta_elementos = b.carpeta_elementos.filter((x) => x.elemento_id !== id)
      }
      // Borrar una carpeta: sus tarjetas vuelven a «Sin carpeta» (nunca se borran).
      if (t === 'carpetas') b.carpeta_elementos = b.carpeta_elementos.filter((x) => x.carpeta_id !== id)
      if (t === 'sesiones') b.sesion_elementos = b.sesion_elementos.filter((x) => x.sesion_id !== id)
      escribir(b)
    },
    async subir(_bucket, archivo, ext) {
      const ruta = `local/${nuevoId()}${ext ? `.${ext}` : ''}`
      await localGuardar(ruta, archivo)
      return ruta
    },
    async borrarArchivos(_bucket, rutas) {
      await Promise.all(rutas.map((r) => localBorrar(r).catch(() => {})))
    },
    async urls(_bucket, rutas) {
      const mapa: Record<string, string> = {}
      for (const r of rutas) {
        let u = urlsCreadas.get(r)
        if (!u) {
          const blob = await localLeer(r)
          if (!blob) continue
          u = URL.createObjectURL(blob)
          urlsCreadas.set(r, u)
        }
        mapa[r] = u
      }
      return mapa
    },
  }
}

export const repositorio: Repositorio = supabase ? repoSupabase() : repoLocal()
