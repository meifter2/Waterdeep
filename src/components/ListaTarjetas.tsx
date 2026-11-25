import { useMemo } from 'react'
import type { Elemento, Tipo } from '../data/types'
import { useOrdenar, type Soltar } from './ordenar'
import { Tarjeta } from './Tarjeta'

/**
 * Lista de tarjetas reordenable (asa: puntero y teclado). La usan las categorías de las sesiones (una lista) y cada carpeta
 * temática de Main (una por carpeta; con `soltar`, arrastrar a otra carpeta la mueve allí).
 */
export function ListaTarjetas({
  tipo,
  elementos,
  reordenable,
  verComun = false,
  soltar,
  alEditar,
}: {
  tipo: Tipo
  /** Ya en su orden. */
  elementos: Elemento[]
  reordenable: boolean
  verComun?: boolean
  soltar?: Soltar
  alEditar: (e: Elemento) => void
}) {
  const ids = useMemo(() => elementos.map((e) => e.id), [elementos])
  const nombres = useMemo(() => Object.fromEntries(elementos.map((e) => [e.id, e.nombre])), [elementos])
  const ord = useOrdenar(ids, tipo, nombres, soltar)
  const porId = new Map(elementos.map((e) => [e.id, e]))
  // Una sola tarjeta también se puede arrastrar si puede ir a otra carpeta.
  const conAsa = reordenable && (elementos.length > 1 || !!soltar)
  return (
    <>
      <ul className="tarjetas" ref={ord.lista} data-ordenando={ord.fantasma || ord.levantada ? true : undefined}>
        {(conAsa ? ord.orden : ids).map((i) => {
          const e = porId.get(i)
          return (
            e && (
              <Tarjeta
                key={e.id}
                elemento={e}
                alEditar={() => alEditar(e)}
                asa={conAsa ? ord.asa(e.id) : undefined}
                moviendo={ord.fantasma?.id === e.id || ord.levantada === e.id}
                verComun={verComun}
              />
            )
          )
        })}
      </ul>
      {ord.fantasma && (
        <div
          className="arrastre-fantasma"
          aria-hidden="true"
          style={{ left: ord.fantasma.x, top: ord.fantasma.y, width: ord.fantasma.ancho, height: ord.fantasma.alto }}
        >
          {ord.fantasma.nombre}
        </div>
      )}
      <p className="sr" aria-live="assertive">
        {ord.anuncio}
      </p>
    </>
  )
}
