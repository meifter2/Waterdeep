import { create } from 'zustand'
import { MAX_AMBIENTES, MAX_EFECTOS, MotorMezcla, type Capa, type EstadoCapa } from '../components/reproductor/motorMezcla'
import { useReproduccion } from './reproduccion'
import { esLocal, pistasDe, useDatos } from './store'
import type { Pista } from './types'
import { interpretarEnlace } from '../lib/enlaces'
import { factorMaestro, fundidosMs, useVolumen } from './volumen'

// Mezcla (fase 2): capas de archivos propios que suenan a la vez que la música principal.
// - Canal principal: el reproductor de siempre (useReproduccion). Las tarjetas normales con archivo van ahí.
// - Ambientes: tarjetas de la carpeta Ambientes con archivo propio. Pulsar activa / detiene. Máximo 3.
// - Efectos: tarjetas de Efectos con archivo propio. Cada pulsación lanza el sonido una vez.
// Spotify y YouTube NUNCA se mezclan:
// - Elegir expresamente una música de Spotify/YouTube (o reanudarla) la pone y detiene ambientes y efectos (Reproductor).
// - Pulsar un ambiente o efecto mientras suena (o carga) Spotify/YouTube NO corta esa música: la capa no se lanza
//   y se avisa. Lo mismo si Spotify está con otra canción que el usuario puso desde fuera (estado `otra`).
// Nada de esto se guarda: al recargar no suena nada (los volúmenes sí se recuerdan, en volumen.ts).

export type EstadoCanal = 'cargando' | 'sonando' | 'pausa' | 'error'

export interface CanalAmbiente {
  id: string
  pistaId: string
  elementoId: string
  estado: EstadoCanal
  volumen: number
  silenciado: boolean
  bucle: boolean
  aviso: string
  /** Ya se ha probado con una dirección nueva tras un error (enlace caducado). */
  reintentado: boolean
}

export interface VozEfecto {
  id: string
  pistaId: string
  elementoId: string
  estado: 'cargando' | 'sonando'
  reintentado: boolean
}

export type Destino = 'principal' | 'ambiente' | 'efecto'

interface Mezcla {
  ambientes: CanalAmbiente[]
  efectos: VozEfecto[]
  efectosSilenciados: boolean
  aviso: string
  /** Capa que no pudo sonar por Spotify (puesto por DFY): «Abrir la canción en Spotify y seguir» la lanza. */
  pendiente: string | null
  panel: boolean

  alternarAmbiente: (pistaId: string) => void
  lanzarEfecto: (pistaId: string) => void
  /** ⏸/▶ de un canal de ambiente (si falló, lo vuelve a intentar). */
  pausarReanudar: (id: string) => void
  /** Quita un ambiente con fundido de salida (o al instante con `instantaneo`, p. ej. si se borra su sonido). */
  detenerAmbiente: (id: string, instantaneo?: boolean) => void
  volumenAmbiente: (id: string, v: number) => void
  silenciarAmbiente: (id: string) => void
  bucleAmbiente: (id: string) => void
  volumenEfectos: (v: number) => void
  silenciarEfectos: () => void
  detenerEfectos: () => void
  /** Detiene ambientes y efectos (no el canal principal). */
  detenerCapas: (aviso?: string) => void
  /** «Detener todo»: capas + canal principal (Spotify solo se pausa si suena lo de DFY). */
  detenerTodo: () => void
  /** Al cerrar sesión: detiene y suelta todo. */
  vaciar: () => void
  limpiarAviso: () => void
  /** Pasa la canción de Spotify que puso DFY a la app de Spotify (DFY la pausa y abre su página) y lanza la capa pendiente. */
  pasarASpotify: () => void
  abrirPanel: (abierto?: boolean) => void
  informar: (capa: Capa, id: string, estado: EstadoCapa, aviso?: string) => void
}

const ERROR_ABRIR = 'No se ha podido abrir el archivo. Puede que ya no exista: revisa el sonido en la biblioteca.'
const ANTIRREBOTE_MS = 80

let motor: MotorMezcla | null = null
const m = () => {
  if (!motor) {
    motor = new MotorMezcla((capa, id, estado, aviso) => useMezcla.getState().informar(capa, id, estado, aviso))
    ;(window as unknown as { __mezclaDFY?: MotorMezcla }).__mezclaDFY = motor
  }
  return motor
}

let contador = 0
const nuevoId = (p: string) => `${p}${++contador}`
let ultimoEfecto = { pistaId: '', t: 0 }

const datosDe = (pistaId: string) => {
  const d = useDatos.getState()
  const pista = d.pistas.find((p) => p.id === pistaId)
  const recurso = pista && d.recursos.find((r) => r.id === pista.recurso_id)
  const elemento = pista && d.elementos.find((e) => e.id === pista.elemento_id)
  return { pista, recurso, elemento }
}

/** ¿Dónde suena esta pista? Solo el audio propio (archivo subido o enlace de audio) de Ambientes y Efectos va a la mezcla. */
export function destinoDe(pistaId: string): Destino {
  const { recurso, elemento } = datosDe(pistaId)
  if (!esLocal(recurso) || !elemento) return 'principal'
  return elemento.tipo === 'ambiente' ? 'ambiente' : elemento.tipo === 'efecto' ? 'efecto' : 'principal'
}

const volAmbiente = (c: Pick<CanalAmbiente, 'volumen' | 'silenciado'>) => {
  const v = useVolumen.getState()
  return { volumen: (c.volumen / 100) * factorMaestro(v), silenciado: c.silenciado || v.maestroSilenciado }
}
const volEfectos = () => {
  const v = useVolumen.getState()
  return { volumen: (v.efecto / 100) * factorMaestro(v), silenciado: useMezcla.getState().efectosSilenciados || v.maestroSilenciado }
}

export const AVISO_EXTERNA = 'Para combinar ambientes y efectos, utiliza música en archivo propio.'
const AVISO_SPOTIFY = 'Para combinar ambientes y efectos, utiliza música en archivo propio o abre la canción en la app de Spotify.'
const AVISO_OTRA = 'Para combinar ambientes y efectos, utiliza música en archivo propio. Spotify está con otra canción: si quieres que DFY la suelte, pulsa ■ en la barra.'
const AVISO_YOUTUBE = 'Para combinar ambientes y efectos, utiliza música en archivo propio o activa «Permitir ambientes con YouTube» en la mezcla.'

/**
 * ¿Hay música externa sonando que impide lanzar una capa local? Spotify sonando o cargando (o con otra canción puesta
 * desde fuera, `otra`) y YouTube sonando o cargando, salvo que el usuario haya activado «Permitir ambientes con YouTube».
 * En pausa o detenida no molesta. Spotify NUNCA se mezcla dentro de DFY (su política lo prohíbe).
 */
export function musicaExternaSonando() {
  const r = useReproduccion.getState()
  if (!r.pistaId || (r.estado !== 'sonando' && r.estado !== 'cargando' && r.estado !== 'otra')) return false
  const { recurso } = datosDe(r.pistaId)
  if (!recurso || esLocal(recurso)) return false
  return !(recurso.origen === 'youtube' && useVolumen.getState().youtubeConCapas)
}

/** Si la música externa impide la capa, avisa (y recuerda la capa para «Abrir en Spotify y seguir») y devuelve true. */
function externaSonando(pistaId: string) {
  if (!musicaExternaSonando()) return false
  const r = useReproduccion.getState()
  const origen = datosDe(r.pistaId ?? '').recurso?.origen
  if (origen === 'youtube') useMezcla.setState({ aviso: AVISO_YOUTUBE, pendiente: null })
  else if (r.estado === 'otra') useMezcla.setState({ aviso: AVISO_OTRA, pendiente: null })
  else useMezcla.setState({ aviso: AVISO_SPOTIFY, pendiente: pistaId })
  return true
}

/** ¿Suenan ahora ambientes o efectos de la mezcla? */
const capasSonando = () => {
  const s = useMezcla.getState()
  return s.efectos.length > 0 || s.ambientes.some((c) => c.estado === 'sonando' || c.estado === 'cargando')
}

/** Página de Spotify de una pista (open.spotify.com/…), o null si no es de Spotify. */
function paginaSpotify(pistaId: string): string | null {
  const { recurso } = datosDe(pistaId)
  if (recurso?.origen !== 'spotify') return null
  const e = interpretarEnlace(recurso.enlace)
  return typeof e !== 'string' && e.servicio === 'spotify' ? e.web : null
}

/** Abre una página de Spotify fuera de DFY (pestaña nueva o, en el móvil, la app de Spotify). */
const abrirFuera = (url: string) => void window.open(url, '_blank', 'noopener,noreferrer')

const mmss = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, '0')}`

/** Aviso del tramo que Spotify externo NO puede aplicar (sus enlaces de canciones no admiten un minuto de inicio). */
export function avisoTramoExterno(pistaId: string): string {
  const { pista } = datosDe(pistaId)
  if (!pista || (!pista.inicio_ms && pista.fin_ms == null)) return ''
  const tramo = pista.inicio_ms ? `el inicio en ${mmss(pista.inicio_ms)}` : `el final en ${mmss(pista.fin_ms!)}`
  return ` Ojo: fuera de DFY empieza desde el principio; ${tramo} que tiene configurado no se puede aplicar.`
}

const AVISO_ABIERTA = (nombre: string, pistaId: string) =>
  `${nombre ? `«${nombre}»` : 'La canción'} se abre en Spotify (si no empieza sola, pulsa ▶ allí). DFY no la controla: los ambientes y efectos siguen aquí.${avisoTramoExterno(pistaId)}`

/**
 * Tarjeta de Spotify con ambientes o efectos sonando: en vez de reproducirla DFY (lo que la mezclaría), se abre en la
 * app oficial de Spotify. Lo que sonaba en el canal principal de DFY se detiene, como al elegir cualquier otra canción.
 */
function abrirEnSpotify(pistaId: string, url: string) {
  const r = useReproduccion.getState()
  if (r.pistaId && r.estado !== 'parado') r.detener()
  abrirFuera(url)
  useMezcla.setState({ aviso: AVISO_ABIERTA(datosDe(pistaId).elemento?.nombre ?? '', pistaId), pendiente: null })
}

const segDe = (p: Pista) => ({ inicio: p.inicio_ms, fin: p.fin_ms })

export const useMezcla = create<Mezcla>()((set, get) => {
  const cambiarCanal = (id: string, cambios: Partial<CanalAmbiente>) =>
    set((s) => ({ ambientes: s.ambientes.map((c) => (c.id === id ? { ...c, ...cambios } : c)) }))
  const canal = (id: string) => get().ambientes.find((c) => c.id === id)

  /** Pide la dirección del archivo y lo pone en el canal, salvo que el canal se haya quitado mientras tanto. */
  const iniciarAmbiente = async (id: string, renovar = false) => {
    const c = canal(id)
    const { pista, recurso } = datosDe(c?.pistaId ?? '')
    if (!c || !pista || !recurso) return
    const url = await useDatos.getState().urlDeRecurso(recurso, renovar)
    const ahora = canal(id)
    if (!ahora) return // se detuvo mientras cargaba: no suena nada
    if (!url) return cambiarCanal(id, { estado: 'error', aviso: ERROR_ABRIR })
    const v = volAmbiente(ahora)
    m().ambiente(id, pista.id, url, segDe(pista), ahora.bucle, v.volumen, v.silenciado, fundidosMs().entrada)
  }

  const iniciarEfecto = async (id: string, renovar = false) => {
    const voz = get().efectos.find((x) => x.id === id)
    const { pista, recurso } = datosDe(voz?.pistaId ?? '')
    if (!voz || !pista || !recurso) return
    const url = await useDatos.getState().urlDeRecurso(recurso, renovar)
    if (!get().efectos.some((x) => x.id === id)) return // cortado mientras cargaba
    if (!url) {
      set((s) => ({ efectos: s.efectos.filter((x) => x.id !== id), aviso: ERROR_ABRIR }))
      return
    }
    const v = volEfectos()
    m().efecto(id, url, segDe(pista), v.volumen, v.silenciado)
  }

  return {
    ambientes: [],
    efectos: [],
    efectosSilenciados: false,
    aviso: '',
    pendiente: null,
    panel: false,

    alternarAmbiente: (pistaId) => {
      const ya = get().ambientes.find((c) => c.pistaId === pistaId)
      if (ya) {
        // Sonando o cargando: pulsar otra vez lo detiene. En pausa: sigue. Con error: se vuelve a intentar.
        if (ya.estado === 'pausa' || ya.estado === 'error') return get().pausarReanudar(ya.id)
        return get().detenerAmbiente(ya.id)
      }
      const { pista } = datosDe(pistaId)
      if (!pista) return
      if (get().ambientes.length >= MAX_AMBIENTES) {
        set({ aviso: `Ya suenan ${MAX_AMBIENTES} ambientes. Detén uno para añadir otro.` })
        return
      }
      if (externaSonando(pistaId)) return
      const nuevo: CanalAmbiente = {
        id: nuevoId('a'),
        pistaId,
        elementoId: pista.elemento_id,
        estado: 'cargando',
        volumen: useVolumen.getState().ambiente,
        silenciado: false,
        bucle: pista.bucle,
        aviso: '',
        reintentado: false,
      }
      set((s) => ({ ambientes: [...s.ambientes, nuevo], aviso: s.aviso.startsWith('Ya suenan') || s.aviso.startsWith(AVISO_EXTERNA.slice(0, -1)) ? '' : s.aviso }))
      void iniciarAmbiente(nuevo.id)
    },

    lanzarEfecto: (pistaId) => {
      const ahora = performance.now()
      // Un mismo toque que llega dos veces (táctil + clic) no lanza dos copias; repetir a mano sí.
      if (ultimoEfecto.pistaId === pistaId && ahora - ultimoEfecto.t < ANTIRREBOTE_MS) return
      ultimoEfecto = { pistaId, t: ahora }
      const { pista } = datosDe(pistaId)
      if (!pista) return
      if (externaSonando(pistaId)) return
      let efectos = get().efectos
      if (efectos.length >= MAX_EFECTOS) {
        // Demasiadas voces: se corta la más antigua.
        m().cortarEfecto(efectos[0].id)
        efectos = efectos.slice(1)
      }
      const voz: VozEfecto = { id: nuevoId('e'), pistaId, elementoId: pista.elemento_id, estado: 'cargando', reintentado: false }
      set({ efectos: [...efectos, voz] })
      void iniciarEfecto(voz.id)
    },

    pausarReanudar: (id) => {
      const c = canal(id)
      if (!c) return
      if ((c.estado === 'error' || c.estado === 'pausa') && externaSonando(c.pistaId)) return // volver a sonar: misma regla
      if (c.estado === 'error') {
        cambiarCanal(id, { estado: 'cargando', aviso: '', reintentado: false })
        void iniciarAmbiente(id, true)
        return
      }
      if (c.estado === 'cargando') return // sin órdenes cruzadas mientras carga
      m().alternarAmbiente(id)
    },

    detenerAmbiente: (id, instantaneo = false) => {
      const c = canal(id)
      if (c) apagandose.set(c.pistaId, { volumen: c.volumen, silenciado: c.silenciado })
      // Sale de la mezcla al momento (la tarjeta deja de marcarse); el sonido se apaga con fundido y luego se suelta.
      m().quitarAmbiente(id, instantaneo ? 0 : fundidosMs().salida)
      set((s) => ({ ambientes: s.ambientes.filter((c) => c.id !== id) }))
    },

    volumenAmbiente: (id, valor) => {
      const volumen = Math.min(100, Math.max(0, Math.round(valor)))
      const c = canal(id)
      if (!c) return
      const silenciado = volumen === 0 ? c.silenciado : false
      cambiarCanal(id, { volumen, silenciado })
      useVolumen.getState().fijarPreferencia('ambiente', volumen)
      const v = volAmbiente({ volumen, silenciado })
      m().volumenAmbiente(id, v.volumen, v.silenciado)
    },

    silenciarAmbiente: (id) => {
      const c = canal(id)
      if (!c) return
      cambiarCanal(id, { silenciado: !c.silenciado })
      const v = volAmbiente({ volumen: c.volumen, silenciado: !c.silenciado })
      m().volumenAmbiente(id, v.volumen, v.silenciado)
    },

    bucleAmbiente: (id) => {
      const c = canal(id)
      if (!c) return
      cambiarCanal(id, { bucle: !c.bucle })
      m().bucleAmbiente(id, !c.bucle)
    },

    volumenEfectos: (valor) => {
      const v = Math.min(100, Math.max(0, Math.round(valor)))
      if (v > 0) set({ efectosSilenciados: false })
      useVolumen.getState().fijarPreferencia('efecto', v)
      aplicarVolumenes()
    },

    silenciarEfectos: () => {
      set((s) => ({ efectosSilenciados: !s.efectosSilenciados }))
      aplicarVolumenes()
    },

    detenerEfectos: () => {
      if (motor) motor.liberarEfectos()
      set({ efectos: [] })
    },

    detenerCapas: (aviso) => {
      const habia = get().ambientes.length + get().efectos.length > 0
      if (motor) motor.liberarTodo()
      set({ ambientes: [], efectos: [], ...(aviso && habia ? { aviso } : {}) })
    },

    detenerTodo: () => {
      get().detenerCapas()
      useReproduccion.getState().detener()
      set({ aviso: '' })
    },

    vaciar: () => {
      if (motor) motor.liberarTodo()
      set({ ambientes: [], efectos: [], efectosSilenciados: false, aviso: '', panel: false })
    },

    limpiarAviso: () => set({ aviso: '', pendiente: null }),

    pasarASpotify: () => {
      const capa = get().pendiente
      const r = useReproduccion.getState()
      const url = r.pistaId ? paginaSpotify(r.pistaId) : null
      const pistaSpotify = r.pistaId ?? ''
      const nombre = pistaSpotify ? (datosDe(pistaSpotify).elemento?.nombre ?? '') : ''
      set({ pendiente: null })
      if (!url) return
      r.detener() // Connect: solo pausa si suena la canción de DFY
      abrirFuera(url)
      if (capa) tocar(capa)
      set({ aviso: AVISO_ABIERTA(nombre, pistaSpotify) })
    },
    abrirPanel: (abierto) => set((s) => ({ panel: abierto ?? !s.panel })),

    informar: (capa, id, estado, aviso) => {
      if (capa === 'efecto') {
        const voz = get().efectos.find((x) => x.id === id)
        if (!voz) return
        if (estado === 'fin') set((s) => ({ efectos: s.efectos.filter((x) => x.id !== id) }))
        else if (estado === 'sonando') set((s) => ({ efectos: s.efectos.map((x) => (x.id === id ? { ...x, estado: 'sonando' } : x)) }))
        else if (estado === 'error') {
          if (!voz.reintentado) {
            // Puede que el enlace privado haya caducado: se pide uno nuevo una vez.
            set((s) => ({ efectos: s.efectos.map((x) => (x.id === id ? { ...x, reintentado: true } : x)) }))
            void iniciarEfecto(id, true)
          } else {
            m().cortarEfecto(id)
            set((s) => ({ efectos: s.efectos.filter((x) => x.id !== id), aviso: aviso || ERROR_ABRIR }))
          }
        }
        return
      }
      const c = canal(id)
      if (!c) return
      if (estado === 'fin') return get().detenerAmbiente(id, true) // terminó sin bucle: deja libre el canal
      if (estado === 'error') {
        if (!c.reintentado) {
          cambiarCanal(id, { reintentado: true, estado: 'cargando' })
          void iniciarAmbiente(id, true)
        } else cambiarCanal(id, { estado: 'error', aviso: aviso || ERROR_ABRIR })
        return
      }
      if (estado === 'sonando' || estado === 'pausa' || estado === 'cargando') cambiarCanal(id, { estado, ...(estado === 'sonando' ? { aviso: '' } : {}) })
    },
  }
})

/** Aplica el maestro y los volúmenes de cada capa a los elementos de audio. */
function aplicarVolumenes() {
  if (!motor) return
  for (const c of useMezcla.getState().ambientes) {
    const v = volAmbiente(c)
    motor.volumenAmbiente(c.id, v.volumen, v.silenciado)
  }
  const e = volEfectos()
  motor.volumenEfectos(e.volumen, e.silenciado)
  motor.volumenSaliendo((pistaId) => volAmbiente(apagandose.get(pistaId) ?? { volumen: 0, silenciado: true }))
}

/** Volumen de cada ambiente que se está apagando (para que el maestro y el silencio le sigan afectando). */
const apagandose = new Map<string, { volumen: number; silenciado: boolean }>()

useVolumen.subscribe((s, antes) => {
  if (s.maestro !== antes.maestro || s.maestroSilenciado !== antes.maestroSilenciado || s.efecto !== antes.efecto) aplicarVolumenes()
})

// Si se borra una pista, un elemento o un sonido (o se cierra sesión), sus capas dejan de sonar.
useDatos.subscribe((s, antes) => {
  if (s.pistas === antes.pistas) return
  const vivas = new Set(s.pistas.map((p) => p.id))
  const mz = useMezcla.getState()
  for (const c of mz.ambientes) if (!vivas.has(c.pistaId)) mz.detenerAmbiente(c.id, true)
  const muertas = mz.efectos.filter((v) => !vivas.has(v.pistaId))
  if (muertas.length) {
    for (const v of muertas) motor?.cortarEfecto(v.id)
    useMezcla.setState((x) => ({ efectos: x.efectos.filter((v) => vivas.has(v.pistaId)) }))
  }
})

// Para las pruebas: estado de la mezcla con los nombres de los elementos (solo lectura).
;(window as unknown as { __mezclaEstado?: () => unknown }).__mezclaEstado = () => {
  const d = useDatos.getState()
  const nombre = (id: string) => d.elementos.find((e) => e.id === id)?.nombre ?? ''
  const s = useMezcla.getState()
  return {
    ambientes: s.ambientes.map((c) => ({ ...c, nombre: nombre(c.elementoId) })),
    efectos: s.efectos.map((v) => ({ ...v, nombre: nombre(v.elementoId) })),
    aviso: s.aviso,
  }
}

// ── Lo que hace una tarjeta al pulsarla ──

/** Reproduce una pista donde le corresponde: canal principal, ambiente (activar/detener) o efecto. */
export function tocar(pistaId: string) {
  const destino = destinoDe(pistaId)
  if (destino === 'ambiente') return useMezcla.getState().alternarAmbiente(pistaId)
  if (destino === 'efecto') return useMezcla.getState().lanzarEfecto(pistaId)
  // Spotify con ambientes o efectos sonando: se abre en la app de Spotify (DFY no la mezcla). Si no, como siempre.
  const spotify = capasSonando() ? paginaSpotify(pistaId) : null
  if (spotify) abrirEnSpotify(pistaId, spotify)
  else useReproduccion.getState().reproducir(pistaId)
}

/** ¿Esta tarjeta de Spotify se abriría ahora en la app de Spotify? (para avisarlo en la propia tarjeta) */
export const abririaEnSpotify = (pistaId: string) => capasSonando() && !!paginaSpotify(pistaId)

/** Igual, con la pista principal (la primera) de un elemento. Devuelve false si no tiene. */
export function tocarElemento(elementoId: string) {
  const principal = pistasDe(useDatos.getState().pistas, elementoId)[0]
  if (!principal) return false
  tocar(principal.id)
  return true
}

export { MAX_AMBIENTES, MAX_EFECTOS }
