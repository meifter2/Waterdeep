import { useVolumen } from '../../data/volumen'

/** Qué volumen controla el deslizador según la fuente que suena. */
export type FuenteVolumen = 'local' | 'spotify' | 'spotify-integrado'

/**
 * Control de volumen permanente de la barra inferior.
 * - local: volumen de la música de DFY (MP3/archivos y YouTube), guardado en el navegador. El maestro de la mezcla lo multiplica.
 * - spotify: volumen real del dispositivo de Spotify conectado (leído de Spotify).
 * - spotify-integrado: el reproductor integrado de Spotify no permite controlarlo desde fuera.
 */
export function ControlVolumen({ fuente }: { fuente: FuenteVolumen }) {
  const v = useVolumen()

  let valor: number
  let silenciado: boolean
  let desactivado = false
  let nota: string
  let cambiar: (n: number) => void
  let silenciar: () => void

  if (fuente === 'spotify') {
    const sp = v.spotify
    valor = sp.valor ?? 0
    silenciado = sp.valor === 0
    desactivado = !sp.soporta || sp.valor == null
    nota = !sp.soporta ? 'Este dispositivo no deja: ajústalo en Spotify' : sp.valor == null ? 'Leyendo el volumen de Spotify…' : `Spotify${sp.dispositivo ? ` en ${sp.dispositivo}` : ''}`
    cambiar = v.fijarSpotify
    silenciar = v.alternarSilencioSpotify
  } else if (fuente === 'spotify-integrado') {
    valor = 0
    silenciado = false
    desactivado = true
    nota = 'Ajústalo en el reproductor de Spotify'
    cambiar = () => {}
    silenciar = () => {}
  } else {
    valor = v.local
    silenciado = v.silenciado
    nota = 'Volumen de la música'
    cambiar = v.fijarLocal
    silenciar = v.alternarSilencioLocal
  }

  const texto = desactivado && fuente !== 'spotify' ? '' : silenciado ? 'Silencio' : `${valor} %`

  return (
    <div className="volumen" data-fuente={fuente} data-silenciado={silenciado || undefined}>
      <button
        type="button"
        className="volumen-silencio"
        onClick={silenciar}
        disabled={desactivado}
        aria-pressed={silenciado}
        aria-label={silenciado ? 'Activar sonido' : 'Silenciar'}
        title={silenciado ? 'Activar sonido' : 'Silenciar'}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor" />
          {silenciado ? (
            <path d="M17 9l5 6M22 9l-5 6" />
          ) : (
            <>
              <path d="M16.5 8.5a5 5 0 0 1 0 7" />
              {valor > 50 && <path d="M19.5 5.5a9 9 0 0 1 0 13" />}
            </>
          )}
        </svg>
      </button>
      <label className="sr" htmlFor="volumen">
        Volumen
      </label>
      <input
        id="volumen"
        type="range"
        min={0}
        max={100}
        step={1}
        value={valor}
        disabled={desactivado}
        aria-valuetext={silenciado ? 'Silencio' : `${valor} %`}
        aria-describedby="volumen-nota"
        onChange={(e) => cambiar(Number(e.target.value))}
        style={{ ['--relleno' as string]: `${desactivado ? 0 : valor}%` }}
      />
      <output htmlFor="volumen" className="volumen-valor">
        {texto}
      </output>
      <span id="volumen-nota" className="volumen-nota">
        {nota}
      </span>
    </div>
  )
}
