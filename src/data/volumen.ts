import { create } from 'zustand'
import { almacenamientoSeguro } from './storage'

// Volumen de DFY. Dos ámbitos, sin fingir uno solo:
// - «local»: MP3/archivos propios y YouTube (lo controla DFY; se guarda en el navegador).
// - «spotify»: volumen REAL del dispositivo de Spotify conectado (se lee de Spotify, no se inventa).
// Nada de esto toca el volumen general del sistema operativo.
// Mezcla (fase 2): un volumen MAESTRO multiplica todo lo local (música, ambientes, efectos y YouTube),
// más el volumen preferido de ambientes y efectos. Se guardan en otra clave; los silencios de la
// mezcla NO se guardan (al recargar, todo se oye y nada suena solo).

const CLAVE = 'banda-sonora:volumen'
const POR_DEFECTO = 70

function leer(): { local: number; silenciado: boolean } {
  try {
    const d = JSON.parse(almacenamientoSeguro.getItem(CLAVE) ?? 'null')
    const local = Number(d?.local)
    return { local: Number.isFinite(local) ? Math.min(100, Math.max(0, Math.round(local))) : POR_DEFECTO, silenciado: d?.silenciado === true }
  } catch {
    return { local: POR_DEFECTO, silenciado: false }
  }
}

const CLAVE_MEZCLA = 'banda-sonora:mezcla'
const limitar = (v: unknown, defecto: number) => {
  const n = Number(v)
  return Number.isFinite(n) ? Math.min(100, Math.max(0, Math.round(n))) : defecto
}

// Transiciones (fase 2B): preajustes de fundido en segundos. «personalizado» = segundos ajustados a mano.
export type Transicion = 'instantaneo' | 'suave' | 'cinematografico' | 'personalizado'
export const PREAJUSTES: Record<Exclude<Transicion, 'personalizado'>, { entrada: number; salida: number }> = {
  instantaneo: { entrada: 0, salida: 0 },
  suave: { entrada: 3, salida: 3 },
  cinematografico: { entrada: 6, salida: 8 },
}
export const MAX_SEGUNDOS = 20
const segundos = (v: unknown, defecto: number) => {
  const n = Number(v)
  return Number.isFinite(n) ? Math.min(MAX_SEGUNDOS, Math.max(0, Math.round(n * 2) / 2)) : defecto
}
const deduce = (entrada: number, salida: number): Transicion =>
  (Object.entries(PREAJUSTES).find(([, p]) => p.entrada === entrada && p.salida === salida)?.[0] as Transicion) ?? 'personalizado'

type PrefMezcla = { maestro: number; ambiente: number; efecto: number; youtubeConCapas: boolean; transicion: Transicion; entrada: number; salida: number }

function leerMezcla(): PrefMezcla {
  const porDefecto: PrefMezcla = { maestro: 100, ambiente: 60, efecto: 80, youtubeConCapas: false, transicion: 'suave', ...PREAJUSTES.suave }
  try {
    const d = JSON.parse(almacenamientoSeguro.getItem(CLAVE_MEZCLA) ?? 'null')
    const entrada = segundos(d?.entrada, PREAJUSTES.suave.entrada)
    const salida = segundos(d?.salida, PREAJUSTES.suave.salida)
    // Copias antiguas solo con el nombre del preajuste: se toman sus segundos.
    const t = d?.transicion as Transicion | undefined
    const tiempos = t && t !== 'personalizado' && t in PREAJUSTES && d?.entrada == null ? PREAJUSTES[t] : { entrada, salida }
    return {
      maestro: limitar(d?.maestro, 100),
      ambiente: limitar(d?.ambiente, 60),
      efecto: limitar(d?.efecto, 80),
      youtubeConCapas: d?.youtubeConCapas === true,
      ...tiempos,
      transicion: deduce(tiempos.entrada, tiempos.salida),
    }
  } catch {
    return porDefecto
  }
}

export interface VolumenSpotify {
  /** Volumen real del dispositivo (null = aún no se conoce). */
  valor: number | null
  /** Valor antes de silenciar (Spotify no tiene «silenciar»: se baja a 0 y se recupera). */
  antes: number | null
  soporta: boolean
  dispositivo: string
}

interface Volumen {
  local: number
  silenciado: boolean
  spotify: VolumenSpotify
  /** Petición pendiente para el dispositivo de Spotify (la atiende el reproductor). */
  pedidoSpotify: { valor: number; n: number } | null
  fijarLocal: (v: number) => void
  alternarSilencioLocal: () => void
  fijarSpotify: (v: number) => void
  alternarSilencioSpotify: () => void
  /** El reproductor informa del volumen real que tiene Spotify. */
  informarSpotify: (cambios: Partial<VolumenSpotify>) => void
  /** Volumen maestro de la mezcla local (0–100) y su silencio. */
  maestro: number
  maestroSilenciado: boolean
  /** Volumen con el que empieza un ambiente nuevo (el último que se usó) y volumen de los efectos. */
  ambiente: number
  efecto: number
  fijarMaestro: (v: number) => void
  alternarSilencioMaestro: () => void
  fijarPreferencia: (tipo: 'ambiente' | 'efecto', v: number) => void
  /** «Permitir ambientes con YouTube» (desactivado por defecto): ambientes y efectos pueden sonar con un vídeo visible. */
  youtubeConCapas: boolean
  alternarYoutubeConCapas: () => void
  /** Transiciones: preajuste y segundos de entrada (fade in) y salida (fade out). */
  transicion: Transicion
  entrada: number
  salida: number
  fijarTransicion: (t: Exclude<Transicion, 'personalizado'>) => void
  fijarSegundos: (cual: 'entrada' | 'salida', v: number) => void
}

const guardar = (local: number, silenciado: boolean) => almacenamientoSeguro.setItem(CLAVE, JSON.stringify({ local, silenciado }))
const guardarMezcla = (d: PrefMezcla) =>
  almacenamientoSeguro.setItem(
    CLAVE_MEZCLA,
    JSON.stringify({ maestro: d.maestro, ambiente: d.ambiente, efecto: d.efecto, youtubeConCapas: d.youtubeConCapas, transicion: d.transicion, entrada: d.entrada, salida: d.salida }),
  )

export const useVolumen = create<Volumen>()((set, get) => ({
  ...leer(),
  ...leerMezcla(),
  maestroSilenciado: false,
  spotify: { valor: null, antes: null, soporta: true, dispositivo: '' },
  pedidoSpotify: null,

  fijarLocal: (v) => {
    const local = Math.min(100, Math.max(0, Math.round(v)))
    // Mover el deslizador por encima de 0 quita el silencio, como en cualquier reproductor.
    const silenciado = local === 0 ? get().silenciado : false
    set({ local, silenciado })
    guardar(local, silenciado)
  },

  alternarSilencioLocal: () => {
    const silenciado = !get().silenciado
    set({ silenciado })
    guardar(get().local, silenciado)
  },

  fijarSpotify: (v) => {
    const valor = Math.min(100, Math.max(0, Math.round(v)))
    set((s) => ({ spotify: { ...s.spotify, valor, antes: valor > 0 ? null : s.spotify.antes }, pedidoSpotify: { valor, n: (s.pedidoSpotify?.n ?? 0) + 1 } }))
  },

  alternarSilencioSpotify: () => {
    const { valor, antes } = get().spotify
    if (valor && valor > 0) {
      set((s) => ({ spotify: { ...s.spotify, valor: 0, antes: valor }, pedidoSpotify: { valor: 0, n: (s.pedidoSpotify?.n ?? 0) + 1 } }))
    } else {
      const recuperado = antes ?? 50
      set((s) => ({ spotify: { ...s.spotify, valor: recuperado, antes: null }, pedidoSpotify: { valor: recuperado, n: (s.pedidoSpotify?.n ?? 0) + 1 } }))
    }
  },

  informarSpotify: (cambios) => set((s) => ({ spotify: { ...s.spotify, ...cambios } })),

  fijarMaestro: (v) => {
    const maestro = limitar(v, 100)
    set((s) => ({ maestro, maestroSilenciado: maestro === 0 ? s.maestroSilenciado : false }))
    guardarMezcla(get())
  },
  alternarSilencioMaestro: () => set((s) => ({ maestroSilenciado: !s.maestroSilenciado })),
  fijarPreferencia: (tipo, v) => {
    set({ [tipo]: limitar(v, 60) } as Pick<Volumen, typeof tipo>)
    guardarMezcla(get())
  },
  alternarYoutubeConCapas: () => {
    set((s) => ({ youtubeConCapas: !s.youtubeConCapas }))
    guardarMezcla(get())
  },
  fijarTransicion: (t) => {
    set({ transicion: t, ...PREAJUSTES[t] })
    guardarMezcla(get())
  },
  fijarSegundos: (cual, v) => {
    const s = { entrada: get().entrada, salida: get().salida, [cual]: segundos(v, 0) }
    set({ ...s, transicion: deduce(s.entrada, s.salida) })
    guardarMezcla(get())
  },
}))

/** Duraciones de fundido actuales en milisegundos. */
export const fundidosMs = () => {
  const s = useVolumen.getState()
  return { entrada: s.entrada * 1000, salida: s.salida * 1000 }
}

/** Factor del maestro en 0–1 (0 si la mezcla está silenciada). */
export const factorMaestro = (s: Pick<Volumen, 'maestro' | 'maestroSilenciado'> = useVolumen.getState()) =>
  s.maestroSilenciado ? 0 : s.maestro / 100

/** Volumen efectivo de la música local en 0–1 (con su silencio y el maestro aplicados). */
export const volumenLocalEfectivo = () => {
  const s = useVolumen.getState()
  return s.silenciado ? 0 : (s.local / 100) * factorMaestro(s)
}
