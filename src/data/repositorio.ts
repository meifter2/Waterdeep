import { ErrorArchivo, localBorrar, localGuardar, localLeer } from '../lib/archivos'
import { nuevoId } from '../lib/id'
import { supabase } from '../lib/supabase'
import { CLAVE_V4, exportarCopia, leerCopia, leerDelNavegador } from './convertir'
import { almacenamientoSeguro } from './storage'
import { vacia, type Biblioteca, type Tabla } from './types'

// Dónde se guarda la biblioteca: Supabase (tablas + Storage privado) o el navegador (modo local).
// El resto de la app usa esta interfaz y no sabe cuál hay detrás.

export type Fila<T extends Tabla> = Biblioteca[T][number]
export type Bucket = 'audio' | 'retratos'

export interface Repositorio {
  listar(): Promise<Biblioteca>
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
}

const DURACION_URL = 6 * 60 * 60 // 6 h: una sesión de juego larga

function traducir(error: { code?: string; message?: string }): ErrorDatos {
  const m = `${error.code ?? ''} ${error.message ?? ''}`
  if (/PGRST205|42P01|does not exist|schema cache/i.test(m))
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
      return { elementos: e.data, recursos: r.data, pistas: p.data } as unknown as Biblioteca
    },
    async crear(t, d) {
      const { data, error } = await sb.from(t).insert(d as never).select(COLUMNAS[t]).single()
      if (error) throw traducir(error)
      return data as never
    },
    async actualizar(t, id, cambios) {
      const { error } = await sb.from(t).update(cambios as never).eq('id', id)
      if (error) throw traducir(error)
    },
    async eliminar(t, id) {
      const { error } = await sb.from(t).delete().eq('id', id)
      if (error) throw traducir(error)
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
