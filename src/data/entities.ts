import type { Coleccion, Entidad } from './types'

// Configuración declarativa de cada tipo de ficha.
// Añadir un campo aquí lo muestra automáticamente en el formulario.
// `secreto: true` → solo máster; nunca llega a la vista de jugadores.
// `publico: true` → se muestra en la vista de jugadores si la ficha es visible.

export type TipoCampo = 'texto' | 'textoLargo' | 'numero' | 'opcion' | 'referencia' | 'fecha'

export interface Campo {
  clave: string
  etiqueta: string
  tipo: TipoCampo
  secreto?: boolean
  publico?: boolean
  opciones?: string[]
  referencia?: Coleccion
  ayuda?: string
  ancho?: 'medio' | 'completo'
}

export interface ConfigColeccion {
  clave: Coleccion
  singular: string
  plural: string
  /** Texto del botón de crear, con su género: «Nueva pista». */
  nuevo: string
  ruta: string
  /** Texto del interruptor de visibilidad. */
  etiquetaVisible: string
  campos: Campo[]
  /** Línea secundaria en la lista. */
  resumen: (e: Entidad) => string
  vacio: string
}

export const ACTITUDES = ['Aliada', 'Amistosa', 'Indiferente', 'Recelosa', 'Hostil']

const actitud = (clave = 'actitud'): Campo => ({
  clave,
  etiqueta: 'Actitud hacia el grupo',
  tipo: 'opcion',
  opciones: ACTITUDES,
  ancho: 'medio',
})

export const COLECCIONES: Record<Coleccion, ConfigColeccion> = {
  pj: {
    clave: 'pj',
    nuevo: 'Nuevo personaje',
    singular: 'Personaje',
    plural: 'Personajes',
    ruta: '/personajes',
    etiquetaVisible: 'Mostrar en la vista de jugadores',
    vacio: 'Añade a los personajes del grupo para tener a mano su CA, sus PG y su percepción pasiva.',
    resumen: (e) => [e.clase, e.nivel ? `nivel ${e.nivel}` : '', e.jugador ? `(${e.jugador})` : ''].filter(Boolean).join(' '),
    campos: [
      { clave: 'jugador', etiqueta: 'Jugador o jugadora', tipo: 'texto', ancho: 'medio', publico: true },
      { clave: 'clase', etiqueta: 'Clase', tipo: 'texto', ancho: 'medio', publico: true },
      { clave: 'especie', etiqueta: 'Especie', tipo: 'texto', ancho: 'medio', publico: true },
      { clave: 'nivel', etiqueta: 'Nivel', tipo: 'numero', ancho: 'medio', publico: true },
      { clave: 'ca', etiqueta: 'Clase de armadura', tipo: 'numero', ancho: 'medio' },
      { clave: 'pgMax', etiqueta: 'PG máximos', tipo: 'numero', ancho: 'medio' },
      { clave: 'percepcion', etiqueta: 'Percepción pasiva', tipo: 'numero', ancho: 'medio' },
      { clave: 'perspicacia', etiqueta: 'Perspicacia pasiva', tipo: 'numero', ancho: 'medio' },
      { clave: 'notas', etiqueta: 'Notas', tipo: 'textoLargo' },
      { clave: 'secreto', etiqueta: 'Ganchos y secretos del personaje', tipo: 'textoLargo', secreto: true },
    ],
  },
  pnj: {
    clave: 'pnj',
    nuevo: 'Nuevo PNJ',
    singular: 'PNJ',
    plural: 'PNJ',
    ruta: '/pnj',
    etiquetaVisible: 'El grupo lo conoce',
    vacio: 'Crea tu primer PNJ. Lo que escribas en el bloque sellado nunca aparece en la vista de jugadores.',
    resumen: (e) => [e.rol, e.estado && e.estado !== 'Activo' ? `(${e.estado})` : ''].filter(Boolean).join(' '),
    campos: [
      { clave: 'rol', etiqueta: 'Ocupación o papel', tipo: 'texto', ancho: 'medio', publico: true },
      { clave: 'estado', etiqueta: 'Estado', tipo: 'opcion', opciones: ['Activo', 'Desaparecido', 'Encarcelado', 'Muerto'], ancho: 'medio' },
      { clave: 'faccion', etiqueta: 'Facción', tipo: 'referencia', referencia: 'facciones', ancho: 'medio' },
      { clave: 'lugar', etiqueta: 'Dónde encontrarlo', tipo: 'referencia', referencia: 'lugares', ancho: 'medio' },
      actitud(),
      { clave: 'voz', etiqueta: 'Voz y manierismos', tipo: 'texto', ancho: 'medio' },
      { clave: 'descripcion', etiqueta: 'Lo que sabe el grupo', tipo: 'textoLargo', publico: true },
      { clave: 'secreto', etiqueta: 'Motivaciones y secretos', tipo: 'textoLargo', secreto: true },
    ],
  },
  facciones: {
    clave: 'facciones',
    nuevo: 'Nueva facción',
    singular: 'Facción',
    plural: 'Facciones',
    ruta: '/facciones',
    etiquetaVisible: 'El grupo la conoce',
    vacio: 'Registra las facciones en juego para seguir su actitud y el renombre del grupo.',
    resumen: (e) => [e.actitud, e.renombre ? `renombre ${e.renombre}` : ''].filter(Boolean).join(', '),
    campos: [
      actitud(),
      { clave: 'renombre', etiqueta: 'Renombre del grupo', tipo: 'numero', ancho: 'medio', publico: true },
      { clave: 'contacto', etiqueta: 'Contacto del grupo', tipo: 'referencia', referencia: 'pnj', ancho: 'medio' },
      { clave: 'sede', etiqueta: 'Sede', tipo: 'referencia', referencia: 'lugares', ancho: 'medio' },
      { clave: 'descripcion', etiqueta: 'Lo que sabe el grupo', tipo: 'textoLargo', publico: true },
      { clave: 'secreto', etiqueta: 'Objetivos y planes ocultos', tipo: 'textoLargo', secreto: true },
    ],
  },
  lugares: {
    clave: 'lugares',
    nuevo: 'Nuevo lugar',
    singular: 'Lugar',
    plural: 'Lugares',
    ruta: '/lugares',
    etiquetaVisible: 'El grupo lo conoce',
    vacio: 'Anota tabernas, callejones y escondites para describirlos sin buscar entre papeles.',
    resumen: (e) => [e.tipoLugar, e.zona].filter(Boolean).join(', '),
    campos: [
      { clave: 'tipoLugar', etiqueta: 'Tipo de lugar', tipo: 'texto', ancho: 'medio', publico: true },
      { clave: 'zona', etiqueta: 'Barrio o zona', tipo: 'texto', ancho: 'medio', publico: true },
      { clave: 'descripcion', etiqueta: 'Descripción para leer en voz alta', tipo: 'textoLargo', publico: true },
      { clave: 'secreto', etiqueta: 'Lo que esconde', tipo: 'textoLargo', secreto: true },
    ],
  },
  pistas: {
    clave: 'pistas',
    nuevo: 'Nueva pista',
    singular: 'Pista',
    plural: 'Pistas',
    ruta: '/pistas',
    etiquetaVisible: 'Revelada a los jugadores',
    vacio: 'Prepara las pistas antes de la sesión y márcalas como reveladas cuando el grupo las descubra.',
    resumen: (e) => (e.visible ? 'Revelada' : 'Por descubrir'),
    campos: [
      { clave: 'origen', etiqueta: 'Dónde se encuentra', tipo: 'referencia', referencia: 'lugares', ancho: 'medio' },
      { clave: 'quien', etiqueta: 'Quién la da', tipo: 'referencia', referencia: 'pnj', ancho: 'medio' },
      { clave: 'texto', etiqueta: 'Lo que descubre el grupo', tipo: 'textoLargo', publico: true },
      { clave: 'secreto', etiqueta: 'Qué significa en realidad', tipo: 'textoLargo', secreto: true },
    ],
  },
  sesiones: {
    clave: 'sesiones',
    nuevo: 'Nueva sesión',
    singular: 'Sesión',
    plural: 'Sesiones',
    ruta: '/sesiones',
    etiquetaVisible: 'Compartir el resumen con el grupo',
    vacio: 'Prepara tu próxima sesión y guarda aquí lo que pasó para retomarla sin olvidar nada.',
    resumen: (e) => [e.fecha ? formatearFecha(String(e.fecha)) : '', e.diaJuego].filter(Boolean).join(', '),
    campos: [
      { clave: 'fecha', etiqueta: 'Fecha de juego real', tipo: 'fecha', ancho: 'medio' },
      { clave: 'diaJuego', etiqueta: 'Día en la campaña', tipo: 'texto', ancho: 'medio', publico: true },
      { clave: 'preparacion', etiqueta: 'Preparación', tipo: 'textoLargo', secreto: true, ayuda: 'Escenas, encuentros y pistas que quieres usar.' },
      { clave: 'resumen', etiqueta: 'Resumen para el grupo', tipo: 'textoLargo', publico: true },
      { clave: 'secreto', etiqueta: 'Notas privadas', tipo: 'textoLargo', secreto: true, ayuda: 'Hilos sueltos y consecuencias que el grupo aún no conoce.' },
    ],
  },
}

export const ORDEN_COLECCIONES: Coleccion[] = ['pistas', 'pnj', 'facciones', 'lugares', 'pj', 'sesiones']

export function formatearFecha(iso: string): string {
  const d = new Date(iso + 'T12:00:00')
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })
}

export function tieneSecreto(config: ConfigColeccion, e: Entidad): boolean {
  return config.campos.some((c) => c.secreto && typeof e[c.clave] === 'string' && (e[c.clave] as string).trim() !== '')
}
