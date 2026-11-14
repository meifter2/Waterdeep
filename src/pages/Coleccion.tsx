import { useMemo, useState } from 'react'
import { Link, NavLink, useNavigate, useParams } from 'react-router-dom'
import { Ficha } from '../components/Ficha'
import { Sello } from '../components/Sello'
import { COLECCIONES, tieneSecreto } from '../data/entities'
import { useDatos } from '../data/store'
import type { Coleccion } from '../data/types'

type Filtro = 'todas' | 'visibles' | 'ocultas'

/** Página genérica de lista + detalle para cualquier colección. */
export function PaginaColeccion({ coleccion }: { coleccion: Coleccion }) {
  const config = COLECCIONES[coleccion]
  const { id } = useParams()
  const lista = useDatos((s) => s[coleccion])
  const crear = useDatos((s) => s.crear)
  const navegar = useNavigate()
  const [busqueda, setBusqueda] = useState('')
  const [filtro, setFiltro] = useState<Filtro>('todas')

  const filtradas = useMemo(() => {
    const q = busqueda.trim().toLocaleLowerCase('es')
    return lista
      .filter((e) => (filtro === 'visibles' ? e.visible : filtro === 'ocultas' ? !e.visible : true))
      .filter((e) => !q || Object.values(e).some((v) => typeof v === 'string' && v.toLocaleLowerCase('es').includes(q)))
      .sort((a, b) =>
        coleccion === 'sesiones'
          ? String(b.fecha ?? '').localeCompare(String(a.fecha ?? '')) || b.creado - a.creado
          : (a.nombre || '￿').localeCompare(b.nombre || '￿', 'es'),
      )
  }, [lista, busqueda, filtro, coleccion])

  const actual = id ? lista.find((e) => e.id === id) : undefined
  const nueva = () => navegar(`${config.ruta}/${crear(coleccion)}`)
  const etiquetasFiltro: Record<Filtro, string> =
    coleccion === 'pistas'
      ? { todas: 'Todas', visibles: 'Reveladas', ocultas: 'Por descubrir' }
      : { todas: 'Todas', visibles: 'Conocidas', ocultas: 'Ocultas' }

  return (
    <div className={`coleccion ${id ? 'con-detalle' : ''}`}>
      <section className="coleccion-lista" aria-labelledby="titulo-coleccion">
        <div className="coleccion-cabecera">
          <h1 id="titulo-coleccion">{config.plural}</h1>
          <button type="button" className="boton boton-principal" onClick={nueva}>
            {config.nuevo}
          </button>
        </div>

        {lista.length > 0 && (
          <div className="coleccion-filtros">
            <label className="sr" htmlFor="buscar">
              Buscar en {config.plural.toLowerCase()}
            </label>
            <input id="buscar" type="search" placeholder="Buscar" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />
            <div className="segmentado" role="group" aria-label="Filtrar">
              {(Object.keys(etiquetasFiltro) as Filtro[]).map((f) => (
                <button key={f} type="button" aria-pressed={filtro === f} onClick={() => setFiltro(f)}>
                  {etiquetasFiltro[f]}
                </button>
              ))}
            </div>
          </div>
        )}

        {lista.length === 0 ? (
          <div className="vacio">
            <p>{config.vacio}</p>
            <button type="button" className="boton boton-principal" onClick={nueva}>
              {config.nuevo}
            </button>
          </div>
        ) : filtradas.length === 0 ? (
          <p className="vacio-corto">Nada coincide con la búsqueda. Prueba con otra palabra o cambia el filtro.</p>
        ) : (
          <ul className="lista">
            {filtradas.map((e) => {
              const resumen = config.resumen(e)
              return (
                <li key={e.id}>
                  <NavLink to={`${config.ruta}/${e.id}`} className={e.visible ? 'es-visible' : ''}>
                    <span className="lista-nombre">{e.nombre || <em>Sin nombre</em>}</span>
                    {resumen && <span className="lista-resumen">{resumen}</span>}
                    <span className="lista-marcas">
                      {e.visible && (
                        <span className="marca-visible" title={config.etiquetaVisible}>
                          {coleccion === 'pistas' ? 'Revelada' : 'Visible'}
                        </span>
                      )}
                      {tieneSecreto(config, e) && <Sello tamano={14} titulo="Tiene secretos" />}
                    </span>
                  </NavLink>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <section className="coleccion-detalle">
        {actual ? (
          <Ficha key={actual.id} config={config} entidad={actual} />
        ) : id ? (
          <div className="vacio">
            <p>Esta ficha ya no existe. Puede que la hayas eliminado.</p>
            <Link to={config.ruta} className="boton">
              Volver a {config.plural.toLowerCase()}
            </Link>
          </div>
        ) : (
          lista.length > 0 && <p className="detalle-indicacion">Elige una ficha de la lista para verla y editarla.</p>
        )}
      </section>
    </div>
  )
}
