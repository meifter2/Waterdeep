import { useMemo } from 'react'
import type { Carpeta, Elemento } from '../data/types'
import { useOrdenar } from './ordenar'
import { Tarjeta } from './Tarjeta'

/** Una carpeta (Personajes, Ambientes…) con sus tarjetas y su botón de añadir. */
export function Seccion({
  carpeta,
  elementos,
  buscando,
  alAnadir,
  alEditar,
}: {
  carpeta: Carpeta
  elementos: Elemento[]
  buscando: boolean
  alAnadir: () => void
  alEditar: (e: Elemento) => void
}) {
  const ids = useMemo(() => elementos.map((e) => e.id), [elementos])
  const nombres = useMemo(() => Object.fromEntries(elementos.map((e) => [e.id, e.nombre])), [elementos])
  const ord = useOrdenar(ids, carpeta.tipo, nombres)
  if (buscando && elementos.length === 0) return null
  const id = `carpeta-${carpeta.tipo}`
  const porId = new Map(elementos.map((e) => [e.id, e]))
  // Con la búsqueda activa no se reordena (la lista filtrada no es el orden completo de la carpeta).
  const reordenable = !buscando && elementos.length > 1
  return (
    <section className={`seccion seccion-${carpeta.tipo}`} aria-labelledby={id}>
      <div className="seccion-cabecera">
        <h2 id={id}>
          {carpeta.titulo}
          {elementos.length > 0 && <span className="seccion-cuenta">{elementos.length}</span>}
        </h2>
        {elementos.length > 0 && (
          <button type="button" className="boton boton-pequeno" onClick={alAnadir}>
            {carpeta.nuevo}
          </button>
        )}
      </div>
      {elementos.length === 0 ? (
        <button type="button" className="seccion-vacia" onClick={alAnadir}>
          <span className="seccion-vacia-accion">{carpeta.nuevo}</span>
          <span className="seccion-vacia-texto">{carpeta.vacio}</span>
        </button>
      ) : (
        <ul className="tarjetas" ref={ord.lista} data-ordenando={ord.fantasma || ord.levantada ? true : undefined}>
          {(reordenable ? ord.orden : ids).map((i) => {
            const e = porId.get(i)
            return (
              e && (
                <Tarjeta
                  key={e.id}
                  elemento={e}
                  alEditar={() => alEditar(e)}
                  asa={reordenable ? ord.asa(e.id) : undefined}
                  moviendo={ord.fantasma?.id === e.id || ord.levantada === e.id}
                />
              )
            )
          })}
        </ul>
      )}
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
    </section>
  )
}
