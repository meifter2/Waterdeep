// Modelo de datos: cada personaje tiene su canción (enlace de Spotify o YouTube).

export interface Personaje {
  id: string
  nombre: string
  /** Enlace tal como lo pega el máster (Spotify o YouTube). */
  enlace: string
  /** Agrupa los personajes en pantalla (facción, lugar, escena…). Opcional. */
  grupo: string
  /** Recordatorio breve: quién es o cuándo sonar. Opcional. */
  nota: string
  creado: number
  actualizado: number
}

export interface Datos {
  version: 2
  personajes: Personaje[]
}
