// Modelo de datos (v4). Elemento = lo que el máster pulsa (personaje, lugar…).
// Recurso = un sonido de la biblioteca. Pista = un recurso usado en un elemento (tramo, bucle, etiqueta).

export type Tipo = 'opening' | 'ending' | 'personaje' | 'lugar' | 'momento' | 'ambiente' | 'efecto'
export type Origen = 'spotify' | 'youtube' | 'archivo'

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

export interface Biblioteca {
  elementos: Elemento[]
  recursos: Recurso[]
  pistas: Pista[]
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

export const vacia = (): Biblioteca => ({ elementos: [], recursos: [], pistas: [] })
