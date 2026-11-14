import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { proyeccionPublica, type FichaPublica } from '../data/publico'
import { extraerDatos, useDatos } from '../data/store'

// Esta pantalla NO lee el store directamente: solo la proyección pública,
// que copia por lista blanca los campos marcados como públicos.

export function VistaJugadores() {
  const estado = useDatos()
  const vista = useMemo(() => proyeccionPublica(extraerDatos(estado)), [estado])
  const { secciones } = vista

  return (
    <div className="jugadores">
      <header className="jugadores-cabecera">
        <h1>{vista.campana.nombre || 'Nuestra campaña'}</h1>
        {vista.campana.diaJuego && <p className="jugadores-dia">{vista.campana.diaJuego}</p>}
      </header>

      {vista.combate && (
        <section className="jugadores-combate" aria-labelledby="j-combate">
          <h2 id="j-combate">
            Combate, ronda {vista.combate.ronda}
          </h2>
          <ol>
            {vista.combate.combatientes.map((c) => (
              <li key={c.id} className={`tipo-${c.tipo} ${c.enTurno ? 'en-turno' : ''}`} aria-current={c.enTurno ? 'step' : undefined}>
                <strong>{c.nombre}</strong>
                <span>{c.pg ? `${c.pg} PG` : c.salud}</span>
                {c.condiciones.length > 0 && <span className="jugadores-cond">{c.condiciones.join(', ')}</span>}
              </li>
            ))}
          </ol>
        </section>
      )}

      <div className="jugadores-rejilla">
        <Bloque titulo="Pistas descubiertas" fichas={secciones.pistas} vacio="Todavía no habéis descubierto ninguna pista." destacado />
        <Bloque titulo="El grupo" fichas={secciones.pj} vacio="Sin personajes." />
        <Bloque titulo="Gente que conocéis" fichas={secciones.pnj} vacio="Aún no conocéis a nadie." />
        <Bloque titulo="Facciones" fichas={secciones.facciones} vacio="Ninguna facción conocida." />
        <Bloque titulo="Lugares" fichas={secciones.lugares} vacio="Ningún lugar conocido." />
        <Bloque titulo="Crónica" fichas={vista.sesiones} vacio="El máster aún no ha compartido resúmenes." />
      </div>

      <footer className="jugadores-pie">
        <Link to="/">Volver a la mesa del máster</Link>
      </footer>
    </div>
  )
}

function Bloque({ titulo, fichas, vacio, destacado }: { titulo: string; fichas: FichaPublica[]; vacio: string; destacado?: boolean }) {
  return (
    <section className={`jugadores-bloque ${destacado ? 'destacado' : ''}`}>
      <h2>{titulo}</h2>
      {fichas.length === 0 ? (
        <p className="vacio-corto">{vacio}</p>
      ) : (
        <ul>
          {fichas.map((f) => (
            <li key={f.id}>
              <h3>{f.nombre}</h3>
              {f.campos.length > 0 && (
                <dl>
                  {f.campos.map((c) => (
                    <div key={c.etiqueta} className={c.valor.length > 60 ? 'largo' : ''}>
                      <dt>{c.etiqueta}</dt>
                      <dd>{c.valor}</dd>
                    </div>
                  ))}
                </dl>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
