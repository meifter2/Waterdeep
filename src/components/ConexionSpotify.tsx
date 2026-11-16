import { conectarSpotify, desconectarSpotify, spotifyConfigurado, useSpotify } from '../lib/spotifyAuth'
import { BotonConfirmar } from './Confirmar'

/** «Conectar Spotify» (canciones completas en tu app de Spotify) o su estado si ya está conectado. */
export function ConexionSpotify() {
  const conectado = useSpotify((s) => s.conectado)
  if (!spotifyConfigurado) return null
  if (!conectado)
    return (
      <button type="button" className="boton boton-spotify" onClick={() => void conectarSpotify()} title="Las canciones de Spotify sonarán completas en tu app de Spotify">
        Conectar Spotify
      </button>
    )
  return (
    <BotonConfirmar
      className="boton boton-spotify-conectado"
      etiqueta="Spotify conectado"
      pregunta="¿Desconectar Spotify? Las canciones volverán a sonar en el reproductor integrado."
      opciones={[{ etiqueta: 'Desconectar', accion: desconectarSpotify, peligro: true }]}
    />
  )
}
