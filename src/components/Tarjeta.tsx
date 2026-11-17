import { useMemo } from 'react'
import { useReproduccion } from '../data/reproduccion'
import { pistasDe, useDatos } from '../data/store'
import type { Elemento, Pista, Recurso } from '../data/types'

/** Nombre corto de una pista para su botón. */
export function nombrePista(p: Pista, r: Recurso | undefined, i: number): string {
  return p.etiqueta || r?.titulo || `Pista ${i + 1}`
}

/**
 * Tarjeta de un elemento.
 * - Toda la superficie (retrato, nombre, descripción) es UN botón que reproduce la pista principal (la primera).
 * - Con varias pistas, debajo hay un botón por pista (hermanos, no anidados).
 * - Pulsar nunca pausa: pausar/reanudar está en la barra inferior. Editar es un botón aparte.
 */
export function Tarjeta({ elemento, alEditar }: { elemento: Elemento; alEditar: () => void }) {
  // Ojo: un selector que devuelve una lista nueva provoca un bucle; se calcula aparte.
  const todas = useDatos((s) => s.pistas)
  const pistas = useMemo(() => pistasDe(todas, elemento.id), [todas, elemento.id])
  const recursos = useDatos((s) => s.recursos)
  const retrato = useDatos((s) => (elemento.retrato_ruta ? s.urls[elemento.retrato_ruta] : undefined))
  const pistaId = useReproduccion((s) => s.pistaId)
  const estado = useReproduccion((s) => s.estado)
  const reproducir = useReproduccion((s) => s.reproducir)
  const reproducirElemento = useReproduccion((s) => s.reproducirElemento)

  const actual = pistas.find((p) => p.id === pistaId)
  // Detenida, o si Spotify cambió a otra canción desde fuera, la tarjeta deja de marcarse.
  const esActual = !!actual && estado !== 'otra' && estado !== 'parado'
  const sonando = esActual && (estado === 'sonando' || estado === 'cargando')
  const conRetrato = !!elemento.retrato_ruta
  const varias = pistas.length > 1
  const principal = pistas[0]
  const nombrePrincipal = principal ? nombrePista(principal, recursos.find((r) => r.id === principal.recurso_id), 0) : ''

  const estadoTexto = !pistas.length
    ? 'Sin sonido: pulsa para añadirlo'
    : esActual
      ? estado === 'pausa'
        ? 'En pausa'
        : estado === 'error'
          ? 'No se puede reproducir'
          : 'Sonando'
      : ''

  return (
    <li
      className="tarjeta"
      data-actual={esActual || undefined}
      data-sonando={sonando || undefined}
      data-retrato={conRetrato || undefined}
      data-varias={varias || undefined}
    >
      <button
        type="button"
        className="tarjeta-tocar"
        onClick={() => (pistas.length ? reproducirElemento(elemento.id) : alEditar())}
        aria-label={
          !pistas.length
            ? `Añadir sonido a ${elemento.nombre}`
            : varias
              ? `Reproducir ${elemento.nombre}: ${nombrePrincipal}`
              : `Reproducir ${elemento.nombre}`
        }
      >
        {conRetrato && <span className="tarjeta-retrato">{retrato && <img src={retrato} alt="" loading="lazy" />}</span>}
        <span className="tarjeta-textos">
          <span className="tarjeta-nombre">{elemento.nombre}</span>
          {elemento.descripcion && <span className="tarjeta-nota">{elemento.descripcion}</span>}
          {estadoTexto && <span className="tarjeta-fuente">{estadoTexto}</span>}
        </span>
      </button>

      {varias && (
        <ul className="tarjeta-pistas" aria-label={`Pistas de ${elemento.nombre}`}>
          {pistas.map((p, i) => {
            const r = recursos.find((x) => x.id === p.recurso_id)
            const esta = esActual && p.id === pistaId
            const nombre = nombrePista(p, r, i)
            return (
              <li key={p.id}>
                <button
                  type="button"
                  className="pista-chip"
                  data-actual={esta || undefined}
                  data-sonando={(esta && sonando) || undefined}
                  data-origen={r?.origen}
                  aria-current={esta ? 'true' : undefined}
                  aria-label={`Reproducir ${nombre} de ${elemento.nombre}`}
                  title={r?.titulo && r.titulo !== nombre ? r.titulo : undefined}
                  onClick={() => reproducir(p.id)}
                >
                  {nombre}
                </button>
              </li>
            )
          })}
        </ul>
      )}

      <button type="button" className="tarjeta-editar" onClick={alEditar} aria-label={`Editar ${elemento.nombre}`}>
        Editar
      </button>
    </li>
  )
}
