import { Link, useNavigate } from 'react-router-dom'
import { COLECCIONES, type Campo, type ConfigColeccion } from '../data/entities'
import { useDatos } from '../data/store'
import type { Coleccion, Entidad } from '../data/types'
import { BotonConfirmar } from './Confirmar'
import { BloqueSellado } from './Sello'

/** Formulario de una ficha. Guarda automáticamente con cada cambio. */
export function Ficha({ config, entidad }: { config: ConfigColeccion; entidad: Entidad }) {
  const actualizar = useDatos((s) => s.actualizar)
  const eliminar = useDatos((s) => s.eliminar)
  const navegar = useNavigate()
  const cambiar = (cambios: Partial<Entidad>) => actualizar(config.clave, entidad.id, cambios)
  const idCampo = (c: string) => `campo-${entidad.id}-${c}`

  const publicos = config.campos.filter((c) => !c.secreto)
  const secretos = config.campos.filter((c) => c.secreto)

  const borrar = () => {
    eliminar(config.clave, entidad.id)
    navegar(config.ruta)
  }

  return (
    <article className="ficha" aria-labelledby={idCampo('nombre')}>
      <Link to={config.ruta} className="volver">
        Volver a la lista
      </Link>

      <div className="ficha-cabecera">
        <label className="sr" htmlFor={idCampo('nombre')}>
          Nombre
        </label>
        <input
          id={idCampo('nombre')}
          className="ficha-nombre"
          value={entidad.nombre}
          placeholder={`${capitalizar(config.nuevo.replace(/^Nuev[oa] /, ''))} sin nombre`}
          onChange={(e) => cambiar({ nombre: e.target.value })}
          autoFocus={entidad.nombre === ''}
        />
        <label className="interruptor">
          <input type="checkbox" checked={entidad.visible} onChange={(e) => cambiar({ visible: e.target.checked })} />
          <span className="interruptor-pista" aria-hidden="true" />
          <span>{config.etiquetaVisible}</span>
        </label>
      </div>

      <div className="ficha-campos">
        {publicos.map((c) => (
          <div key={c.clave} className={`campo ${c.ancho === 'medio' ? 'campo-medio' : ''}`}>
            <label htmlFor={idCampo(c.clave)}>
              {c.etiqueta}
              {c.publico && entidad.visible && <span className="marca-publica">lo ve el grupo</span>}
            </label>
            {c.ayuda && <p className="ayuda">{c.ayuda}</p>}
            <Control campo={c} id={idCampo(c.clave)} valor={entidad[c.clave]} alCambiar={(v) => cambiar({ [c.clave]: v })} />
          </div>
        ))}
      </div>

      {secretos.length > 0 && (
        <div className="ficha-secretos">
          {secretos.map((c) => (
            <BloqueSellado key={c.clave} etiqueta={c.etiqueta} htmlFor={idCampo(c.clave)} ayuda={c.ayuda}>
              <Control campo={c} id={idCampo(c.clave)} valor={entidad[c.clave]} alCambiar={(v) => cambiar({ [c.clave]: v })} />
            </BloqueSellado>
          ))}
        </div>
      )}

      <Relacionados entidad={entidad} />

      <footer className="ficha-pie">
        <span className="guardado">Los cambios se guardan solos.</span>
        <BotonConfirmar
          className="boton boton-peligro"
          etiqueta={`Eliminar ${minuscula(config.singular)}`}
          pregunta={`¿Eliminar «${entidad.nombre || minuscula(config.singular)}»? No se puede deshacer.`}
          opciones={[{ etiqueta: 'Eliminar', accion: borrar, peligro: true }]}
        />
      </footer>
    </article>
  )
}

/** Pasa a minúscula salvo siglas (PNJ). */
const minuscula = (t: string) => (t === t.toUpperCase() ? t : t.toLowerCase())
const capitalizar = (t: string) => t.charAt(0).toUpperCase() + t.slice(1)

function Control({
  campo,
  id,
  valor,
  alCambiar,
}: {
  campo: Campo
  id: string
  valor: Entidad[string]
  alCambiar: (v: string | number | undefined) => void
}) {
  const texto = valor == null ? '' : String(valor)
  switch (campo.tipo) {
    case 'textoLargo':
      return <textarea id={id} value={texto} rows={4} onChange={(e) => alCambiar(e.target.value)} />
    case 'numero':
      return (
        <input
          id={id}
          type="number"
          inputMode="numeric"
          value={texto}
          onChange={(e) => alCambiar(e.target.value === '' ? undefined : Number(e.target.value))}
        />
      )
    case 'fecha':
      return <input id={id} type="date" value={texto} onChange={(e) => alCambiar(e.target.value)} />
    case 'opcion':
      return (
        <select id={id} value={texto} onChange={(e) => alCambiar(e.target.value)}>
          <option value="">Sin indicar</option>
          {campo.opciones?.map((o) => (
            <option key={o}>{o}</option>
          ))}
        </select>
      )
    case 'referencia':
      return <Referencia id={id} coleccion={campo.referencia!} valor={texto} alCambiar={alCambiar} />
    default:
      return <input id={id} value={texto} onChange={(e) => alCambiar(e.target.value)} />
  }
}

function Referencia({ id, coleccion, valor, alCambiar }: { id: string; coleccion: Coleccion; valor: string; alCambiar: (v: string) => void }) {
  const lista = useDatos((s) => s[coleccion])
  const destino = COLECCIONES[coleccion]
  const existe = lista.some((e) => e.id === valor)
  return (
    <div className="referencia">
      <select id={id} value={existe ? valor : ''} onChange={(e) => alCambiar(e.target.value)}>
        <option value="">Ninguno</option>
        {[...lista]
          .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
          .map((e) => (
            <option key={e.id} value={e.id}>
              {e.nombre || 'Sin nombre'}
            </option>
          ))}
      </select>
      {existe && (
        <Link to={`${destino.ruta}/${valor}`} className="referencia-ir">
          Abrir
        </Link>
      )}
    </div>
  )
}

/** Fichas de otras colecciones que apuntan a esta (p. ej. PNJ que viven en un lugar). */
function Relacionados({ entidad }: { entidad: Entidad }) {
  const datos = useDatos()
  const enlaces: { col: Coleccion; e: Entidad; campo: string }[] = []
  for (const config of Object.values(COLECCIONES)) {
    const refs = config.campos.filter((c) => c.tipo === 'referencia')
    if (refs.length === 0) continue
    for (const e of datos[config.clave]) {
      const campo = refs.find((c) => e[c.clave] === entidad.id)
      if (campo) enlaces.push({ col: config.clave, e, campo: campo.etiqueta })
    }
  }
  if (enlaces.length === 0) return null
  return (
    <section className="relacionados" aria-labelledby={`rel-${entidad.id}`}>
      <h2 id={`rel-${entidad.id}`}>Relacionado</h2>
      <ul>
        {enlaces.map(({ col, e, campo }) => (
          <li key={e.id}>
            <Link to={`${COLECCIONES[col].ruta}/${e.id}`}>{e.nombre || 'Sin nombre'}</Link>
            <span>
              {COLECCIONES[col].singular}, {campo.toLowerCase()}
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}
