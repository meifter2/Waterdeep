import { useState, type ReactNode } from 'react'

// Confirmación dentro de la página (en vez de window.confirm, que algunos visores bloquean).

interface Opcion {
  etiqueta: string
  accion: () => void
  peligro?: boolean
}

export function BotonConfirmar({
  etiqueta,
  pregunta,
  opciones,
  className = 'boton',
}: {
  etiqueta: ReactNode
  pregunta: string
  opciones: Opcion[]
  className?: string
}) {
  const [abierto, setAbierto] = useState(false)
  if (!abierto)
    return (
      <button type="button" className={className} onClick={() => setAbierto(true)}>
        {etiqueta}
      </button>
    )
  return (
    <div className="confirmar" role="alertdialog" aria-label={pregunta}>
      <p>{pregunta}</p>
      <div className="confirmar-botones">
        {opciones.map((o, i) => (
          <button
            key={o.etiqueta}
            type="button"
            className={o.peligro ? 'boton boton-peligro-lleno' : 'boton'}
            autoFocus={i === 0}
            onClick={() => {
              setAbierto(false)
              o.accion()
            }}
          >
            {o.etiqueta}
          </button>
        ))}
        <button type="button" className="boton boton-sutil" onClick={() => setAbierto(false)}>
          Cancelar
        </button>
      </div>
    </div>
  )
}
