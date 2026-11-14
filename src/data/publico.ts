import { COLECCIONES } from './entities'
import type { Coleccion, Datos, Entidad } from './types'

// Proyección pública: lo ÚNICO que la vista de jugadores puede leer.
// Funciona por LISTA BLANCA: solo copia campos marcados `publico: true`.
// Un campo nuevo es privado por defecto hasta que se marque como público.

export interface FichaPublica {
  id: string
  nombre: string
  resumen: string
  campos: { etiqueta: string; valor: string }[]
}

export type EstadoSalud = 'Ileso' | 'Herido' | 'Malherido' | 'Caído'

export interface CombatientePublico {
  id: string
  nombre: string
  tipo: 'pj' | 'aliado' | 'enemigo'
  /** PJ y aliados muestran PG exactos; enemigos solo un estado aproximado. */
  pg?: string
  salud: EstadoSalud
  condiciones: string[]
  enTurno: boolean
}

export interface VistaPublica {
  campana: { nombre: string; diaJuego: string }
  secciones: Record<Exclude<Coleccion, 'sesiones'>, FichaPublica[]>
  sesiones: FichaPublica[]
  combate: { activo: boolean; ronda: number; combatientes: CombatientePublico[] } | null
}

function proyectar(col: Coleccion, lista: Entidad[]): FichaPublica[] {
  const config = COLECCIONES[col]
  const camposPublicos = config.campos.filter((c) => c.publico && !c.secreto)
  return lista
    .filter((e) => e.visible && e.nombre.trim() !== '')
    .map((e) => ({
      id: e.id,
      nombre: e.nombre,
      resumen: '',
      campos: camposPublicos
        .map((c) => ({ etiqueta: c.etiqueta, valor: e[c.clave] == null ? '' : String(e[c.clave]).trim() }))
        .filter((c) => c.valor !== ''),
    }))
}

export function salud(pg: number, max: number): EstadoSalud {
  if (pg <= 0) return 'Caído'
  if (max <= 0 || pg >= max) return 'Ileso'
  return pg / max > 0.5 ? 'Herido' : 'Malherido'
}

export function proyeccionPublica(d: Datos): VistaPublica {
  const combate = d.combate.activo
    ? {
        activo: true,
        ronda: d.combate.ronda,
        combatientes: d.combate.combatientes.map((c, i) => ({
          id: c.id,
          nombre: c.nombre,
          tipo: c.tipo,
          pg: c.tipo === 'enemigo' ? undefined : `${c.pg}/${c.pgMax}`,
          salud: salud(c.pg, c.pgMax),
          condiciones: [...c.condiciones],
          enTurno: i === d.combate.turno,
        })),
      }
    : null

  return {
    campana: { nombre: d.campana.nombre, diaJuego: d.campana.diaJuego },
    secciones: {
      pj: proyectar('pj', d.pj),
      pistas: proyectar('pistas', d.pistas),
      pnj: proyectar('pnj', d.pnj),
      facciones: proyectar('facciones', d.facciones),
      lugares: proyectar('lugares', d.lugares),
    },
    sesiones: proyectar('sesiones', d.sesiones),
    combate,
  }
}
