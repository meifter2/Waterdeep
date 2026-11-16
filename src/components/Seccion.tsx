import type { Cancion, Carpeta } from '../data/types'
import { Tarjeta } from './Tarjeta'

/** Una carpeta (Opening, Personajes…) con sus tarjetas y su botón de añadir. */
export function Seccion({
  carpeta,
  canciones,
  buscando,
  alAnadir,
  alEditar,
}: {
  carpeta: Carpeta
  canciones: Cancion[]
  buscando: boolean
  alAnadir: () => void
  alEditar: (c: Cancion) => void
}) {
  if (buscando && canciones.length === 0) return null
  const id = `carpeta-${carpeta.tipo}`
  return (
    <section className={`seccion seccion-${carpeta.tipo}`} aria-labelledby={id}>
      <div className="seccion-cabecera">
        <h2 id={id}>
          {carpeta.titulo}
          {canciones.length > 0 && <span className="seccion-cuenta">{canciones.length}</span>}
        </h2>
        {canciones.length > 0 && (
          <button type="button" className="boton boton-pequeno" onClick={alAnadir}>
            {carpeta.nuevo}
          </button>
        )}
      </div>
      {canciones.length === 0 ? (
        <button type="button" className="seccion-vacia" onClick={alAnadir}>
          <span className="seccion-vacia-accion">{carpeta.nuevo}</span>
          <span className="seccion-vacia-texto">{carpeta.vacio}</span>
        </button>
      ) : (
        <ul className="tarjetas">
          {canciones.map((c) => (
            <Tarjeta key={c.id} cancion={c} alEditar={() => alEditar(c)} />
          ))}
        </ul>
      )}
    </section>
  )
}
