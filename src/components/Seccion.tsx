import type { Carpeta, Elemento } from '../data/types'
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
  if (buscando && elementos.length === 0) return null
  const id = `carpeta-${carpeta.tipo}`
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
        <ul className="tarjetas">
          {elementos.map((e) => (
            <Tarjeta key={e.id} elemento={e} alEditar={() => alEditar(e)} />
          ))}
        </ul>
      )}
    </section>
  )
}
