import type { Carpeta, Elemento } from '../data/types'
import { ListaTarjetas } from './ListaTarjetas'

/** Una categoría (Personajes, Ambientes…) con sus tarjetas directas y su botón de añadir (vista de una sesión). */
export function Seccion({
  carpeta,
  elementos,
  buscando,
  sesion,
  alAnadir,
  alEditar,
}: {
  carpeta: Carpeta
  elementos: Elemento[]
  buscando: boolean
  /** Nombre de la sesión elegida (null = «Main»). */
  sesion?: string | null
  alAnadir: () => void
  alEditar: (e: Elemento) => void
}) {
  if (buscando && elementos.length === 0) return null
  const id = `carpeta-${carpeta.tipo}`
  // Con la búsqueda activa no se reordena (la lista filtrada no es el orden completo de la carpeta).
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
          <span className="seccion-vacia-texto">
            {sesion ? `Nada de esta categoría en «${sesion}». Lo que crees aquí se guarda en esta sesión.` : carpeta.vacio}
          </span>
        </button>
      ) : (
        <ListaTarjetas tipo={carpeta.tipo} elementos={elementos} reordenable={!buscando} verComun={!!sesion} alEditar={alEditar} />
      )}
    </section>
  )
}
