// Modelo de datos (v4). Elemento = lo que el máster pulsa (personaje, lugar…).
// Recurso = un sonido de la biblioteca. Pista = un recurso usado en un elemento (tramo, bucle, etiqueta).

export type Tipo = 'opening' | 'ending' | 'personaje' | 'lugar' | 'momento' | 'ambiente' | 'efecto'
/** 'url' = enlace https directo a un archivo de audio (fase 2, requiere bd/003). */
export type Origen = 'spotify' | 'youtube' | 'archivo' | 'url'

export interface Elemento {
  id: string
  tipo: Tipo
  nombre: string
  descripcion: string
  retrato_ruta: string | null
  orden: number
}

export interface Recurso {
  id: string
  origen: Origen
  titulo: string
  descripcion: string
  enlace: string
  archivo_ruta: string | null
  archivo_nombre: string
  archivo_tipo: string
  archivo_bytes: number | null
  archivo_hash: string | null
  duracion_ms: number | null
}

export interface Pista {
  id: string
  elemento_id: string
  recurso_id: string
  etiqueta: string
  inicio_ms: number | null
  fin_ms: number | null
  bucle: boolean
  orden: number
}

/** Carpeta de una sesión de juego («Sesión 1»…). Solo organiza: no copia tarjetas ni sonidos (bd/004). */
export interface Sesion {
  id: string
  nombre: string
  finalizada: boolean
  orden: number
}

/** Una tarjeta está en una sesión (muchos a muchos: la misma tarjeta puede estar en varias). */
export interface SesionElemento {
  id: string
  sesion_id: string
  elemento_id: string
}

/** Tarjeta común: aparece en todas las sesiones. */
export interface ElementoComun {
  id: string
  elemento_id: string
}

/** Carpeta temática de Main dentro de una categoría («Xanathar» en Personajes, «Drama» en Momentos). Un nivel (bd/005). */
export interface CarpetaTematica {
  id: string
  tipo: Tipo
  nombre: string
  orden: number
}

/** En qué carpeta temática está una tarjeta (como mucho una). Sin fila = «Sin carpeta». */
export interface CarpetaElemento {
  id: string
  carpeta_id: string
  elemento_id: string
}

export interface Biblioteca {
  elementos: Elemento[]
  recursos: Recurso[]
  pistas: Pista[]
  sesiones: Sesion[]
  sesion_elementos: SesionElemento[]
  elementos_comunes: ElementoComun[]
  carpetas: CarpetaTematica[]
  carpeta_elementos: CarpetaElemento[]
}

export type Tabla = keyof Biblioteca

export interface Carpeta {
  tipo: Tipo
  titulo: string
  /** Nombre de un solo elemento de la carpeta (para elegir carpeta). */
  singular: string
  /** Texto del botón de añadir, con su género. */
  nuevo: string
  vacio: string
  /** ¿Las pistas nuevas se repiten en bucle por defecto? */
  bucle: boolean
  /** Etiqueta propuesta para la primera pista. */
  etiqueta: string
}

/** Orden en pantalla. */
export const CARPETAS: Carpeta[] = [
  { tipo: 'opening', titulo: 'Opening', singular: 'Opening', nuevo: 'Añadir opening', vacio: 'La música con la que empiezas la sesión.', bucle: true, etiqueta: '' },
  { tipo: 'ending', titulo: 'Ending', singular: 'Ending', nuevo: 'Añadir ending', vacio: 'La música con la que cierras la sesión.', bucle: true, etiqueta: '' },
  { tipo: 'personaje', titulo: 'Personajes', singular: 'Personaje', nuevo: 'Añadir personaje', vacio: 'El tema de cada personaje: principal, tensión, combate…', bucle: true, etiqueta: 'Tema principal' },
  { tipo: 'lugar', titulo: 'Lugares', singular: 'Lugar', nuevo: 'Añadir lugar', vacio: 'La música de tabernas, calles y escondites.', bucle: true, etiqueta: 'Tema principal' },
  { tipo: 'momento', titulo: 'Momentos', singular: 'Momento', nuevo: 'Añadir momento', vacio: 'Combate, persecución, misterio, despedida…', bucle: true, etiqueta: '' },
  { tipo: 'ambiente', titulo: 'Ambientes', singular: 'Ambiente', nuevo: 'Añadir ambiente', vacio: 'Lluvia, taberna llena, bosque, mazmorra… Suenan en bucle.', bucle: true, etiqueta: '' },
  { tipo: 'efecto', titulo: 'Efectos', singular: 'Efecto', nuevo: 'Añadir efecto', vacio: 'Puertas, golpes, explosiones, gritos… Suenan una vez.', bucle: false, etiqueta: '' },
]

export const TIPOS = CARPETAS.map((c) => c.tipo)
export const carpeta = (t: Tipo) => CARPETAS.find((c) => c.tipo === t)!

export const ETIQUETAS_SUGERIDAS = ['Tema principal', 'Tensión', 'Combate', 'Calma', 'Misterio', 'Victoria', 'Tristeza', 'Huida']

export const vacia = (): Biblioteca => ({ elementos: [], recursos: [], pistas: [], sesiones: [], sesion_elementos: [], elementos_comunes: [], carpetas: [], carpeta_elementos: [] })

/** Tablas de la organización por sesiones (bd/004): opcionales, la app funciona sin ellas. */
export const TABLAS_SESIONES = ['sesiones', 'sesion_elementos', 'elementos_comunes'] as const

/** Tablas de las carpetas temáticas de Main (bd/005): opcionales, la app funciona sin ellas. */
export const TABLAS_CARPETAS = ['carpetas', 'carpeta_elementos'] as const
