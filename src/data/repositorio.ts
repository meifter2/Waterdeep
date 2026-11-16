import { nuevoId } from '../lib/id'
import { supabase } from '../lib/supabase'
import { almacenamientoSeguro } from './storage'
import { TIPOS, type Cancion, type DatosCancion } from './types'

// Dónde se guardan las canciones: Supabase (con cuenta) o el navegador (modo local).
// El resto de la app no sabe cuál se usa.

export interface Repositorio {
  listar(): Promise<Cancion[]>
  crear(d: DatosCancion): Promise<Cancion>
  actualizar(id: string, cambios: Partial<DatosCancion>): Promise<void>
  eliminar(id: string): Promise<void>
}

const COLUMNAS = 'id, tipo, nombre, enlace, nota, orden, creado, actualizado'

function repoSupabase(): Repositorio {
  const sb = supabase!
  return {
    async listar() {
      const { data, error } = await sb.from('canciones').select(COLUMNAS).order('nombre')
      if (error) throw error
      return data as Cancion[]
    },
    async crear(d) {
      const { data, error } = await sb.from('canciones').insert(d).select(COLUMNAS).single()
      if (error) throw error
      return data as Cancion
    },
    async actualizar(id, cambios) {
      const { error } = await sb.from('canciones').update(cambios).eq('id', id)
      if (error) throw error
    },
    async eliminar(id) {
      const { error } = await sb.from('canciones').delete().eq('id', id)
      if (error) throw error
    },
  }
}

export const CLAVE_LOCAL = 'banda-sonora:canciones'

function repoLocal(): Repositorio {
  const leer = (): Cancion[] => {
    try {
      const guardadas = almacenamientoSeguro.getItem(CLAVE_LOCAL)
      if (guardadas !== null) return JSON.parse(guardadas) as Cancion[]
      // Primera vez con esta versión: se convierten los personajes de la versión anterior.
      const ahora = new Date().toISOString()
      const convertidas = cancionesAntiguasDelNavegador().map((d) => ({ ...d, id: nuevoId(), orden: 0, creado: ahora, actualizado: ahora }))
      if (convertidas.length) escribir(convertidas)
      return convertidas
    } catch {
      return []
    }
  }
  const escribir = (l: Cancion[]) => almacenamientoSeguro.setItem(CLAVE_LOCAL, JSON.stringify(l))
  return {
    async listar() {
      return leer()
    },
    async crear(d) {
      const ahora = new Date().toISOString()
      const c: Cancion = { ...d, id: nuevoId(), orden: 0, creado: ahora, actualizado: ahora }
      escribir([...leer(), c])
      return c
    },
    async actualizar(id, cambios) {
      escribir(leer().map((c) => (c.id === id ? { ...c, ...cambios, actualizado: new Date().toISOString() } : c)))
    },
    async eliminar(id) {
      escribir(leer().filter((c) => c.id !== id))
    },
  }
}

export const repositorio: Repositorio = supabase ? repoSupabase() : repoLocal()

/** Canciones de la versión anterior (solo personajes, guardados en este navegador). */
export function cancionesAntiguasDelNavegador(): DatosCancion[] {
  const fuentes: DatosCancion[] = []
  try {
    const v2 = JSON.parse(almacenamientoSeguro.getItem('banda-sonora:datos') ?? 'null')
    for (const p of v2?.state?.personajes ?? [])
      if (p?.nombre) fuentes.push({ tipo: 'personaje', nombre: String(p.nombre), enlace: String(p.enlace ?? ''), nota: String(p.nota ?? '') })
  } catch {
    /* sin datos antiguos */
  }
  if (supabase) {
    try {
      for (const c of JSON.parse(almacenamientoSeguro.getItem(CLAVE_LOCAL) ?? '[]'))
        if (c?.nombre && TIPOS.includes(c.tipo)) fuentes.push({ tipo: c.tipo, nombre: c.nombre, enlace: c.enlace ?? '', nota: c.nota ?? '' })
    } catch {
      /* nada */
    }
  }
  return fuentes
}

export function olvidarCancionesAntiguas() {
  almacenamientoSeguro.removeItem('banda-sonora:datos')
  if (supabase) almacenamientoSeguro.removeItem(CLAVE_LOCAL)
}
