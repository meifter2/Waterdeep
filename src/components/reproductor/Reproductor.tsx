import { useEffect, useRef, useState } from 'react'
import { useReproduccion, type EstadoReproduccion } from '../../data/reproduccion'
import { useDatos } from '../../data/store'
import { describirEnlace, interpretarEnlace, nombreServicio, type EnlaceMusical, type Servicio } from '../../lib/enlaces'
import { urlRespaldo } from './motor'
import { MotorSpotify } from './motorSpotify'
import { MotorSpotifyConnect } from './motorSpotifyConnect'
import { useSpotify } from '../../lib/spotifyAuth'
import { ErrorSpotify } from '../../lib/spotifyApi'
import { MotorYoutube } from './motorYoutube'

const TEXTO_ESTADO: Record<EstadoReproduccion, string> = {
  parado: 'En silencio',
  cargando: 'Cargando',
  sonando: 'Sonando',
  pausa: 'En pausa',
  error: 'No se puede reproducir',
}

export function Reproductor() {
  const { cancionId, estado, aviso, peticion, orden, repetir, informar, alternar, detener, alternarRepetir } =
    useReproduccion()
  const personaje = useDatos((s) => s.canciones.find((p) => p.id === cancionId))

  const hostSpotify = useRef<HTMLDivElement>(null)
  const hostYoutube = useRef<HTMLDivElement>(null)
  const motores = useRef<{ spotify?: MotorSpotify; youtube?: MotorYoutube; connect?: MotorSpotifyConnect }>({})
  const [activo, setActivo] = useState<Servicio | 'connect' | null>(null)
  const [dispositivo, setDispositivo] = useState('')
  const [enlace, setEnlace] = useState<EnlaceMusical | null>(null)
  const [respaldo, setRespaldo] = useState<string | null>(null)

  // Crea los motores una sola vez.
  useEffect(() => {
    if (hostSpotify.current && !motores.current.spotify)
      motores.current.spotify = new MotorSpotify(hostSpotify.current, (e, a) => informar(e, a))
    if (hostYoutube.current && !motores.current.youtube)
      motores.current.youtube = new MotorYoutube(hostYoutube.current, (e, a) => informar(e, a))
    if (!motores.current.connect) motores.current.connect = new MotorSpotifyConnect((e, a) => informar(e, a), setDispositivo)
  }, [informar])

  useEffect(() => {
    const { spotify, youtube } = motores.current
    if (spotify) spotify.repetir = repetir
    if (youtube) youtube.repetir = repetir
    motores.current.connect?.fijarRepetir(repetir)
  }, [repetir])

  // Cada pulsación en un personaje.
  useEffect(() => {
    if (!peticion) return
    const p = useDatos.getState().canciones.find((x) => x.id === useReproduccion.getState().cancionId)
    if (!p) return
    const e = interpretarEnlace(p.enlace)
    if (typeof e === 'string') {
      informar('error', e)
      return
    }
    setEnlace(e)
    setActivo(e.servicio)
    setRespaldo(null)
    const { spotify, youtube, connect } = motores.current
    if (e.servicio === 'spotify' && useSpotify.getState().conectado) {
      // Spotify conectado: suena completa en la app de Spotify del usuario.
      youtube?.detener()
      spotify?.detener()
      setActivo('connect')
      connect?.reproducir(e).catch((err: unknown) => {
        if (err instanceof ErrorSpotify && err.codigo === 'desconectado') {
          // Sin conexión válida: se usa el reproductor integrado de siempre.
          setActivo('spotify')
          spotify?.reproducir(e).catch(() => usarRespaldo(e))
          informar('cargando', err.message)
        } else informar('error', err instanceof ErrorSpotify ? err.message : 'Spotify no ha respondido.')
      })
    } else if (e.servicio === 'spotify') {
      youtube?.detener()
      connect?.detener()
      spotify?.reproducir(e).catch(() => usarRespaldo(e))
    } else {
      spotify?.detener()
      connect?.detener()
      youtube?.reproducir(e).catch(() => usarRespaldo(e))
    }

    function usarRespaldo(en: EnlaceMusical) {
      setRespaldo(urlRespaldo(en))
      informar('pausa', `El reproductor de ${nombreServicio(en.servicio)} no ha cargado del todo. Pulsa ▶ en él para empezar.`)
    }
  }, [peticion, informar])

  // Pausa / detener desde los botones.
  useEffect(() => {
    if (!orden || !activo) return
    const motor = motores.current[activo]
    if (orden.tipo === 'alternar') motor?.alternar()
    else {
      motor?.detener()
      setRespaldo(null)
    }
  }, [orden, activo])

  const visible = cancionId !== null
  const detalle = enlace ? describirEnlace(enlace) + (activo === 'connect' && dispositivo ? ` en ${dispositivo}` : '') : ''

  return (
    <section className="reproductor" data-estado={estado} data-visible={visible || undefined} aria-label="Reproductor">
      <div className="reproductor-info">
        <Ecualizador activo={estado === 'sonando'} />
        <div className="reproductor-textos">
          <p className="reproductor-titulo">{personaje?.nombre ?? 'Elige una canción'}</p>
          <p className="reproductor-estado" aria-live="polite">
            {visible ? `${TEXTO_ESTADO[estado]}${detalle && estado !== 'error' ? `, ${detalle}` : ''}` : 'Pulsa una tarjeta y sonará su canción.'}
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
            title={`Reproductor de ${personaje?.nombre ?? 'música'}`}
            allow="autoplay; encrypted-media; clipboard-write; fullscreen; picture-in-picture"
          />
        )}
      </div>

      {visible && (
        <div className="reproductor-controles">
          <button type="button" className="boton boton-oro" onClick={alternar} disabled={estado === 'error'}>
            {estado === 'sonando' || estado === 'cargando' ? 'Pausar' : 'Reanudar'}
          </button>
          <button type="button" className="boton boton-oscuro" aria-pressed={repetir} onClick={alternarRepetir}>
            {repetir ? 'Repetir: sí' : 'Repetir: no'}
          </button>
          <button type="button" className="boton boton-oscuro" onClick={detener}>
            Detener
          </button>
          {enlace && (
            <a className="reproductor-abrir" href={enlace.web} target="_blank" rel="noopener noreferrer">
              Abrir en {nombreServicio(enlace.servicio)}
            </a>
          )}
        </div>
      )}

      {aviso && (
        <p className="reproductor-aviso" role="status">
          {aviso}
        </p>
      )}
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
