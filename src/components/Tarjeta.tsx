import { useMemo } from 'react'
import { useReproduccion } from '../data/reproduccion'
import { pistasDe, useDatos } from '../data/store'
import type { Elemento, Pista, Recurso } from '../data/types'

/** Nombre corto de una pista para su botón. */
export function nombrePista(p: Pista, r: Recurso | undefined, i: number): string {
  return p.etiqueta || r?.titulo || `Pista ${i + 1}`
}

/** Tarjeta compacta de un elemento: retrato, nombre (suena la primera pista) y un botón por pista. */
export function Tarjeta({ elemento, alEditar }: { elemento: Elemento; alEditar: () => void }) {
  // Ojo: un selector que devuelve una lista nueva provoca un bucle; se calcula aparte.
  const todas = useDatos((s) => s.pistas)
  const pistas = useMemo(() => pistasDe(todas, elemento.id), [todas, elemento.id])
  const recursos = useDatos((s) => s.recursos)
  const retrato = useDatos((s) => (elemento.retrato_ruta ? s.urls[elemento.retrato_ruta] : undefined))
  const pistaId = useReproduccion((s) => s.pistaId)
  const estado = useReproduccion((s) => s.estado)
  const reproducir = useReproduccion((s) => s.reproducir)
  const alternar = useReproduccion((s) => s.alternar)
  const pulsarElemento = useReproduccion((s) => s.pulsarElemento)

  const actual = pistas.find((p) => p.id === pistaId)
  const sonando = !!actual && (estado === 'sonando' || estado === 'cargando')
  const conRetrato = !!elemento.retrato_ruta

  const pulsarPista = (p: Pista) => {
    if (p.id === pistaId && estado !== 'error') alternar()
    else reproducir(p.id)
  }

  return (
    <li className="tarjeta" data-actual={actual ? true : undefined} data-sonando={sonando || undefined} data-retrato={conRetrato || undefined}>
      {conRetrato && (
        <span className="tarjeta-retrato" aria-hidden="true">
          {retrato && <img src={retrato} alt="" loading="lazy" />}
        </span>
      )}
      <div className="tarjeta-cuerpo">
        <button
          type="button"
          className="tarjeta-tocar"
          onClick={() => (pistas.length ? pulsarElemento(elemento.id) : alEditar())}
          aria-label={pistas.length ? `${sonando ? 'Pausar' : 'Reproducir'} ${elemento.nombre}` : `Añadir sonido a ${elemento.nombre}`}
        >
          <span className="tarjeta-nombre">{elemento.nombre}</span>
          {elemento.descripcion && <span className="tarjeta-nota">{elemento.descripcion}</span>}
          {!pistas.length && <span className="tarjeta-fuente">Sin sonido: pulsa para añadirlo</span>}
        </button>
        {pistas.length > 1 || (pistas.length === 1 && pistas[0].etiqueta) ? (
          <ul className="tarjeta-pistas" aria-label={`Pistas de ${elemento.nombre}`}>
            {pistas.map((p, i) => {
              const r = recursos.find((x) => x.id === p.recurso_id)
              const esta = p.id === pistaId
              const nombre = nombrePista(p, r, i)
              return (
                <li key={p.id}>
                  <button
                    type="button"
                    className="pista-chip"
                    data-actual={esta || undefined}
                    data-sonando={(esta && sonando) || undefined}
                    data-origen={r?.origen}
                    aria-pressed={esta && sonando}
                    aria-label={`${esta && sonando ? 'Pausar' : 'Reproducir'} ${nombre} de ${elemento.nombre}`}
                    title={r?.titulo && r.titulo !== nombre ? r.titulo : undefined}
                    onClick={() => pulsarPista(p)}
                  >
                    {nombre}
                  </button>
                </li>
              )
            })}
          </ul>
        ) : null}
      </div>
      <button type="button" className="tarjeta-editar" onClick={alEditar} aria-label={`Editar ${elemento.nombre}`}>
        Editar
      </button>
    </li>
  )
}
