import { useReproduccion } from '../../data/reproduccion'

/**
 * Controles de reproducción de la barra: ■ Detener · ▶/❚❚ (principal) · ⟲ Repetir.
 * Sin pista seleccionada se ven pero desactivados. Mientras carga, el principal se desactiva (sin órdenes duplicadas).
 */
export function Transporte() {
  const pistaId = useReproduccion((s) => s.pistaId)
  const estado = useReproduccion((s) => s.estado)
  const repetir = useReproduccion((s) => s.repetir)
  const principal = useReproduccion((s) => s.principal)
  const detener = useReproduccion((s) => s.detener)
  const alternarRepetir = useReproduccion((s) => s.alternarRepetir)

  const hayPista = pistaId !== null
  const reproduciendo = estado === 'sonando' || estado === 'cargando'
  const etiqueta = reproduciendo ? 'Pausar' : 'Reproducir'

  return (
    <div className="transporte" role="group" aria-label="Controles de reproducción">
      <button
        type="button"
        className="control control-detener"
        onClick={detener}
        disabled={!hayPista || estado === 'parado'}
        aria-label="Detener"
        title="Detener"
      >
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
          <rect x="5" y="5" width="14" height="14" rx="2" fill="currentColor" />
        </svg>
      </button>

      <button
        type="button"
        className="control control-principal"
        onClick={principal}
        disabled={!hayPista || estado === 'cargando'}
        aria-label={etiqueta}
        title={estado === 'cargando' ? 'Cargando…' : etiqueta}
        data-reproduciendo={reproduciendo || undefined}
      >
        {reproduciendo ? (
          <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
            <rect x="6" y="5" width="4.2" height="14" rx="1.2" fill="currentColor" />
            <rect x="13.8" y="5" width="4.2" height="14" rx="1.2" fill="currentColor" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
            <path d="M8 5.2v13.6c0 .8.9 1.3 1.6.8l10-6.8a1 1 0 0 0 0-1.6l-10-6.8C8.9 3.9 8 4.4 8 5.2z" fill="currentColor" />
          </svg>
        )}
      </button>

      <button
        type="button"
        className="control control-repetir"
        onClick={alternarRepetir}
        aria-pressed={repetir}
        aria-label="Repetir"
        title={repetir ? 'Repetir: activado' : 'Repetir: desactivado'}
      >
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M17 2l3 3-3 3" />
          <path d="M4 11V9a4 4 0 0 1 4-4h12" />
          <path d="M7 22l-3-3 3-3" />
          <path d="M20 13v2a4 4 0 0 1-4 4H4" />
        </svg>
      </button>
    </div>
  )
}
