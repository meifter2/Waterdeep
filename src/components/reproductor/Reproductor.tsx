import { useEffect, useRef, useState } from 'react'
import { useReproduccion, type EstadoReproduccion } from '../../data/reproduccion'
import { useDatos } from '../../data/store'
import { describirEnlace, interpretarEnlace, nombreServicio, type EnlaceMusical } from '../../lib/enlaces'
import { ErrorSpotify } from '../../lib/spotifyApi'
import { useSpotify } from '../../lib/spotifyAuth'
import { describirTramo } from '../../lib/tiempo'
import { urlRespaldo, type Segmento } from './motor'
import { MotorArchivo } from './motorArchivo'
import { MotorSpotify } from './motorSpotify'
import { MotorSpotifyConnect } from './motorSpotifyConnect'
import { MotorYoutube } from './motorYoutube'
import { ControlVolumen } from './ControlVolumen'
import { Transporte } from './Transporte'
import { useVolumen } from '../../data/volumen'
import { useMezcla } from '../../data/mezcla'
import { BotonMezcla, Mezclador } from './Mezclador'

const TEXTO_ESTADO: Record<EstadoReproduccion, string> = {
  parado: 'Detenido',
  cargando: 'Cargando',
  sonando: 'Sonando',
  pausa: 'En pausa',
  otra: 'Spotify está con otra canción',
  error: 'No se puede reproducir',
}

type Activo = 'spotify' | 'youtube' | 'connect' | 'archivo' | null

interface Motores {
  spotify?: MotorSpotify
  youtube?: MotorYoutube
  connect?: MotorSpotifyConnect
  archivo?: MotorArchivo
}

export function Reproductor() {
  const { pistaId, estado, aviso, peticion, orden, repetir, informar } = useReproduccion()
  const pista = useDatos((s) => s.pistas.find((p) => p.id === pistaId))
  const elemento = useDatos((s) => s.elementos.find((e) => e.id === pista?.elemento_id))
  const recurso = useDatos((s) => s.recursos.find((r) => r.id === pista?.recurso_id))

  const hostSpotify = useRef<HTMLDivElement>(null)
  const hostYoutube = useRef<HTMLDivElement>(null)
  const motores = useRef<Motores>({})
  const [activo, setActivoEstado] = useState<Activo>(null)
  // Copia inmediata de la fuente activa (el estado de React se actualiza después).
  const activoRef = useRef<Activo>(null)
  const setActivo = (a: Activo) => {
    activoRef.current = a
    setActivoEstado(a)
  }
  const [enlace, setEnlace] = useState<EnlaceMusical | null>(null)
  const [respaldo, setRespaldo] = useState<string | null>(null)
  const [dispositivo, setDispositivo] = useState('')
  // Última pista pedida (para saber si se vuelve a pulsar la misma).
  const ultima = useRef<{ pistaId: string; activo: Activo } | null>(null)

  // Crea los motores una sola vez.
  useEffect(() => {
    const m = motores.current
    // Cada motor solo puede informar mientras es la fuente activa: los avisos tardíos de una fuente
    // ya parada (p. ej. YouTube avisando de su pausa) no pueden pisar el estado de la nueva.
    const inf = (origen: Activo) => (e: EstadoReproduccion, a?: string) => {
      if (activoRef.current === origen) informar(e, a)
    }
    if (hostSpotify.current && !m.spotify) m.spotify = new MotorSpotify(hostSpotify.current, inf('spotify'))
    if (hostYoutube.current && !m.youtube) m.youtube = new MotorYoutube(hostYoutube.current, inf('youtube'))
    m.connect ??= new MotorSpotifyConnect(inf('connect'), setDispositivo, (v) => useVolumen.getState().informarSpotify(v))
    if (!m.archivo) {
      m.archivo = new MotorArchivo(inf('archivo'))
      ;(window as unknown as { __audioBandaSonora?: HTMLAudioElement }).__audioBandaSonora = m.archivo.elemento
    }
    // Al desaparecer el reproductor (cerrar sesión), nada puede seguir sonando por detrás: antes el MP3
    // seguía, porque la orden «detener» llegaba cuando el componente ya no estaba.
    return () => {
      activoRef.current = null
      m.archivo?.liberar()
      m.youtube?.detener()
      m.spotify?.detener()
      m.connect?.detener()
    }
  }, [informar])

  // Volumen de DFY (archivos y YouTube) × maestro de la mezcla: se aplica al instante y se mantiene al cambiar de pista o fuente.
  const volLocal = useVolumen((s) => s.local)
  const silenciado = useVolumen((s) => s.silenciado)
  const maestro = useVolumen((s) => s.maestro)
  const maestroSilenciado = useVolumen((s) => s.maestroSilenciado)
  useEffect(() => {
    const factor = maestro / 100
    motores.current.archivo?.fijarVolumen((volLocal / 100) * factor, silenciado || maestroSilenciado)
    motores.current.youtube?.fijarVolumen(Math.round(volLocal * factor), silenciado || maestroSilenciado)
  }, [volLocal, silenciado, maestro, maestroSilenciado])

  // Volumen del dispositivo de Spotify conectado.
  const pedidoSpotify = useVolumen((s) => s.pedidoSpotify)
  useEffect(() => {
    if (pedidoSpotify) motores.current.connect?.fijarVolumen(pedidoSpotify.valor)
  }, [pedidoSpotify])

  useEffect(() => {
    const { spotify, youtube, connect, archivo } = motores.current
    if (spotify) spotify.repetir = repetir
    if (youtube) youtube.repetir = repetir
    connect?.fijarRepetir(repetir)
    archivo?.fijarRepetir(repetir)
  }, [repetir])

  // Cada pulsación en una pista.
  useEffect(() => {
    if (!peticion) return
    const datos = useDatos.getState()
    const p = datos.pistas.find((x) => x.id === useReproduccion.getState().pistaId)
    const r = p && datos.recursos.find((x) => x.id === p.recurso_id)
    if (!p || !r) return
    const seg: Segmento = { inicio: p.inicio_ms, fin: p.fin_ms }
    const n = peticion
    const vigente = () => useReproduccion.getState().peticion === n
    const previa = ultima.current
    const { spotify, youtube, connect, archivo } = motores.current
    const repetirAhora = useReproduccion.getState().repetir
    for (const m of [spotify, youtube, archivo]) if (m) m.repetir = repetirAhora
    connect?.fijarRepetir(repetirAhora)
    const pararOtros = (menos: Activo) => {
      if (menos !== 'spotify') spotify?.detener()
      if (menos !== 'youtube') youtube?.detener()
      if (menos !== 'connect') connect?.detener()
      if (menos !== 'archivo') archivo?.detener()
    }
    setRespaldo(null)

    const misma = (destino: Activo) => previa?.pistaId === p.id && previa.activo === destino
    const marcar = (destino: Activo) => {
      ultima.current = { pistaId: p.id, activo: destino }
    }

    if (r.origen === 'archivo') {
      const esMisma = misma('archivo')
      setEnlace(null)
      setActivo('archivo')
      pararOtros('archivo')
      marcar('archivo')
      void datos.urlDe('audio', r.archivo_ruta!).then((url) => {
        if (!vigente()) return // se ha pulsado otra tarjeta mientras se preparaba
        if (!url) informar('error', 'No se ha podido abrir el archivo. Revisa la conexión y vuelve a pulsar.')
        else void archivo?.reproducir(url, seg, esMisma)
      })
      return
    }

    const e = interpretarEnlace(r.enlace)
    if (typeof e === 'string') {
      informar('error', e)
      return
    }
    // Spotify y YouTube no se mezclan: al empezar, se detienen ambientes y efectos (sin audio oculto).
    useMezcla.getState().detenerCapas(`Ambientes y efectos detenidos: ${nombreServicio(e.servicio)} no se mezcla con otros sonidos.`)
    setEnlace(e)
    const usarRespaldo = (en: EnlaceMusical) => {
      setRespaldo(urlRespaldo(en, seg.inicio))
      informar('pausa', `El reproductor de ${nombreServicio(en.servicio)} no ha cargado del todo. Pulsa ▶ en él para empezar.`)
    }

    if (e.servicio === 'spotify' && useSpotify.getState().conectado) {
      // Spotify conectado: suena completa en la app de Spotify del usuario.
      const esMisma = misma('connect')
      setActivo('connect')
      pararOtros('connect')
      marcar('connect')
      connect?.reproducir(e, seg, esMisma).catch((err: unknown) => {
        if (!vigente()) return
        if (err instanceof ErrorSpotify && err.codigo === 'desconectado') {
          setActivo('spotify')
          marcar('spotify')
          spotify?.reproducir(e, seg).catch(() => usarRespaldo(e))
          informar('cargando', err.message)
        } else informar('error', err instanceof ErrorSpotify ? err.message : 'Spotify no ha respondido.')
      })
    } else if (e.servicio === 'spotify') {
      const esMisma = misma('spotify')
      setActivo('spotify')
      pararOtros('spotify')
      marcar('spotify')
      spotify?.reproducir(e, seg, esMisma).catch(() => vigente() && usarRespaldo(e))
    } else {
      const esMisma = misma('youtube')
      setActivo('youtube')
      pararOtros('youtube')
      marcar('youtube')
      youtube?.reproducir(e, seg, esMisma).catch(() => vigente() && usarRespaldo(e))
    }
  }, [peticion, informar])

  // Pausa / detener desde los botones. Cada orden se atiende UNA vez: cambiar de fuente no debe
  // repetir la última orden (antes, un «Detener» antiguo cancelaba la siguiente reproducción).
  const ordenAtendida = useRef(0)
  useEffect(() => {
    if (!orden || orden.n === ordenAtendida.current) return
    ordenAtendida.current = orden.n
    if (!activo) return
    const motor = motores.current[activo]
    // Reanudar Spotify/YouTube también aparta las capas locales (no se superponen).
    if (orden.tipo === 'alternar' && activo !== 'archivo' && useReproduccion.getState().estado === 'pausa')
      useMezcla.getState().detenerCapas(`Ambientes y efectos detenidos: ${activo === 'youtube' ? 'YouTube' : 'Spotify'} no se mezcla con otros sonidos.`)
    if (orden.tipo === 'alternar') motor?.alternar()
    else {
      motor?.detener()
      setRespaldo(null)
      ultima.current = null
    }
  }, [orden, activo])

  // Avisos de la mezcla (límite de ambientes, Spotify/YouTube apartados…): visibles en la barra y se van solos.
  const avisoMezcla = useMezcla((s) => s.aviso)
  const limpiarAvisoMezcla = useMezcla((s) => s.limpiarAviso)
  useEffect(() => {
    if (!avisoMezcla) return
    const t = setTimeout(limpiarAvisoMezcla, 7000)
    return () => clearTimeout(t)
  }, [avisoMezcla, limpiarAvisoMezcla])

  const hayPista = pistaId !== null
  // El marco (vídeo de YouTube, reproductor de Spotify) solo se muestra mientras hay algo cargado.
  const visible = hayPista && estado !== 'parado'
  const nombrePista = pista?.etiqueta || recurso?.titulo || ''
  const fuente =
    recurso?.origen === 'archivo'
      ? 'archivo propio'
      : enlace
        ? describirEnlace(enlace) + (activo === 'connect' && dispositivo ? ` en ${dispositivo}` : '')
        : ''
  const tramo = pista ? describirTramo(pista.inicio_ms, pista.fin_ms) : ''
  const detalle = [nombrePista, fuente, tramo && (recurso?.origen === 'spotify' ? `${tramo}, aprox.` : tramo)].filter(Boolean).join(', ')

  return (
    <section className="reproductor" data-estado={estado} data-visible={visible || undefined} aria-label="Reproductor">
      <div className="reproductor-info">
        <Ecualizador activo={estado === 'sonando'} />
        <div className="reproductor-textos">
          <p className="reproductor-titulo">{elemento?.nombre ?? 'Elige un sonido'}</p>
          <p className="reproductor-estado" aria-live="polite">
            {hayPista ? `${TEXTO_ESTADO[estado]}${detalle && estado !== 'error' ? `: ${detalle}` : ''}` : 'Pulsa una tarjeta y sonará.'}
          </p>
        </div>
      </div>

      <div className="reproductor-marco" data-servicio={respaldo ? 'respaldo' : (activo ?? undefined)}>
        <div ref={hostSpotify} className="marco-spotify" />
        <div ref={hostYoutube} className="marco-youtube" />
        {respaldo && (
          <iframe
            className="marco-respaldo"
            src={respaldo}
            title={`Reproductor de ${elemento?.nombre ?? 'música'}`}
            allow="autoplay; encrypted-media; clipboard-write; fullscreen; picture-in-picture"
          />
        )}
      </div>

      <div className="reproductor-controles">
        <Transporte />
        <BotonMezcla />
        {enlace && hayPista && (
          <a className="reproductor-abrir" href={enlace.web} target="_blank" rel="noopener noreferrer">
            Abrir en {nombreServicio(enlace.servicio)}
          </a>
        )}
      </div>

      <ControlVolumen fuente={activo === 'connect' ? 'spotify' : activo === 'spotify' ? 'spotify-integrado' : 'local'} />

      {(aviso || avisoMezcla) && (
        <div className="reproductor-avisos">
          {aviso && (
            <p className="reproductor-aviso" role="status">
              {aviso}
            </p>
          )}
          {avisoMezcla && (
            <p className="reproductor-aviso" role="status" data-mezcla>
              {avisoMezcla}
              <button type="button" className="enlace" onClick={limpiarAvisoMezcla}>
                Cerrar aviso
              </button>
            </p>
          )}
        </div>
      )}
      <Mezclador />
    </section>
  )
}

function Ecualizador({ activo }: { activo: boolean }) {
  return (
    <span className="ecualizador" data-activo={activo || undefined} aria-hidden="true">
      <span />
      <span />
      <span />
      <span />
    </span>
  )
}
