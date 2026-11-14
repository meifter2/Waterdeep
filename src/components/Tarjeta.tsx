import { useReproduccion } from '../data/reproduccion'
import type { Personaje } from '../data/types'
import { describirEnlace, interpretarEnlace } from '../lib/enlaces'

/** Placa de un personaje: pulsarla hace sonar su canción (o la pausa si ya suena). */
export function Tarjeta({ personaje, alEditar }: { personaje: Personaje; alEditar: () => void }) {
  const esActual = useReproduccion((s) => s.personajeId === personaje.id)
  const estado = useReproduccion((s) => s.estado)
  const reproducir = useReproduccion((s) => s.reproducir)
  const alternar = useReproduccion((s) => s.alternar)

  const enlace = interpretarEnlace(personaje.enlace)
  const valido = typeof enlace !== 'string'
  const fuente = valido ? capital(describirEnlace(enlace)) : 'Sin canción: pulsa para añadir el enlace'

  const sonando = esActual && (estado === 'sonando' || estado === 'cargando')
  const pulsar = () => {
    if (!valido) alEditar()
    else if (esActual && estado !== 'error') alternar()
    else reproducir(personaje.id)
  }

  return (
    <li className="tarjeta" data-actual={esActual || undefined} data-sonando={sonando || undefined} data-sin-cancion={!valido || undefined}>
      <button
        type="button"
        className="tarjeta-tocar"
        onClick={pulsar}
        aria-pressed={valido ? sonando : undefined}
        aria-label={valido ? `${sonando ? 'Pausar' : 'Reproducir'} la canción de ${personaje.nombre}` : `Añadir canción a ${personaje.nombre}`}
      >
        <span className="tarjeta-nombre">{personaje.nombre}</span>
        {personaje.nota && <span className="tarjeta-nota">{personaje.nota}</span>}
        <span className="tarjeta-fuente">{esActual && estado === 'pausa' ? 'En pausa' : sonando ? 'Sonando' : fuente}</span>
      </button>
      <button type="button" className="tarjeta-editar" onClick={alEditar} aria-label={`Editar ${personaje.nombre}`}>
        Editar
      </button>
    </li>
  )
}

const capital = (t: string) => t.charAt(0).toUpperCase() + t.slice(1)
