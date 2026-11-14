// Modelo de datos de la campaña.
// Regla: todo campo cuyo nombre esté marcado como `secreto` en entities.ts
// NUNCA sale hacia la vista de jugadores (ver publico.ts, que usa lista blanca).

export type Coleccion = 'pj' | 'pnj' | 'facciones' | 'lugares' | 'pistas' | 'sesiones'

/** Registro genérico: cada colección añade sus propios campos. */
export interface Entidad {
  id: string
  nombre: string
  /** true = los jugadores conocen esta entidad (aparece en su vista). */
  visible: boolean
  creado: number
  actualizado: number
  [campo: string]: string | number | boolean | undefined
}

export interface Campana {
  nombre: string
  diaJuego: string
  notasRapidas: string
}

export type TipoCombatiente = 'pj' | 'aliado' | 'enemigo'

export interface Combatiente {
  id: string
  nombre: string
  tipo: TipoCombatiente
  iniciativa: number
  ca: number
  pg: number
  pgMax: number
  condiciones: string[]
  /** Si viene de un PJ, su id (para no duplicarlo). */
  pjId?: string
}

export interface Combate {
  activo: boolean
  ronda: number
  turno: number
  combatientes: Combatiente[]
}

export interface Tirada {
  id: string
  expresion: string
  detalle: string
  total: number
  momento: number
}

export interface Datos {
  version: 1
  campana: Campana
  pj: Entidad[]
  pnj: Entidad[]
  facciones: Entidad[]
  lugares: Entidad[]
  pistas: Entidad[]
  sesiones: Entidad[]
  combate: Combate
  tiradas: Tirada[]
}
