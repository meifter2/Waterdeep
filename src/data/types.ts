// Modelo de datos: cada canción vive en una carpeta (tipo) y tiene un enlace de Spotify o YouTube.

export type Tipo = 'opening' | 'ending' | 'personaje' | 'lugar' | 'momento'

export interface Cancion {
  id: string
  tipo: Tipo
  nombre: string
  /** Enlace tal como lo pega el máster (Spotify o YouTube). */
  enlace: string
  /** Recordatorio breve: quién es o cuándo sonar. Opcional. */
  nota: string
  orden: number
  creado: string
  actualizado: string
}

export type DatosCancion = Pick<Cancion, 'tipo' | 'nombre' | 'enlace' | 'nota'>

export interface Carpeta {
  tipo: Tipo
  titulo: string
  /** Texto del botón de añadir, con su género. */
  nuevo: string
  vacio: string
}

/** Orden en pantalla. Opening y Ending van juntos arriba. */
export const CARPETAS: Carpeta[] = [
  { tipo: 'opening', titulo: 'Opening', nuevo: 'Añadir opening', vacio: 'La música con la que empiezas la sesión.' },
  { tipo: 'ending', titulo: 'Ending', nuevo: 'Añadir ending', vacio: 'La música con la que cierras la sesión.' },
  { tipo: 'personaje', titulo: 'Personajes', nuevo: 'Añadir personaje', vacio: 'El tema de cada personaje, para cuando entre en escena.' },
  { tipo: 'lugar', titulo: 'Lugares', nuevo: 'Añadir lugar', vacio: 'La música de tabernas, calles y escondites.' },
  { tipo: 'momento', titulo: 'Momentos', nuevo: 'Añadir momento', vacio: 'Combate, persecución, misterio, despedida…' },
]

export const TIPOS = CARPETAS.map((c) => c.tipo)
export const carpeta = (t: Tipo) => CARPETAS.find((c) => c.tipo === t)!
