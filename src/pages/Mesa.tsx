import { Link, useNavigate } from 'react-router-dom'
import { Dados } from '../components/Dados'
import { BloqueSellado } from '../components/Sello'
import { datosDemo } from '../data/demo'
import { ACTITUDES } from '../data/entities'
import { useDatos } from '../data/store'

export function Mesa() {
  const datos = useDatos()
  const navegar = useNavigate()
  const { campana, actualizarCampana, actualizar, reemplazarTodo, crear } = datos
  const vacia = ['pj', 'pnj', 'facciones', 'lugares', 'pistas', 'sesiones'].every(
    (c) => datos[c as 'pj'].length === 0,
  )

  if (vacia) {
    return (
      <div className="bienvenida">
        <h1>Prepara tu mesa</h1>
        <p>
          Aquí guardarás PNJ, facciones, lugares y pistas de tu campaña, con los secretos sellados para que nunca acaben
          en la pantalla de los jugadores. Todo se guarda en este navegador.
        </p>
        <div className="bienvenida-acciones">
          <button type="button" className="boton boton-principal" onClick={() => reemplazarTodo(datosDemo())}>
            Cargar una campaña de ejemplo
          </button>
          <button type="button" className="boton" onClick={() => navegar(`/personajes/${crear('pj')}`)}>
            Empezar con el primer personaje
          </button>
        </div>
        <p className="ayuda">La campaña de ejemplo es inventada. Puedes borrarla después desde Ajustes.</p>
      </div>
    )
  }

  const pendientes = datos.pistas.filter((p) => !p.visible)
  const proxima = [...datos.sesiones].sort(
    (a, b) => String(b.fecha ?? '').localeCompare(String(a.fecha ?? '')) || b.creado - a.creado,
  )[0]

  return (
    <div className="mesa">
      <header className="mesa-cabecera">
        <label className="sr" htmlFor="nombre-campana">
          Nombre de la campaña
        </label>
        <input
          id="nombre-campana"
          className="mesa-titulo"
          value={campana.nombre}
          onChange={(e) => actualizarCampana({ nombre: e.target.value })}
        />
        <div className="mesa-dia">
          <label htmlFor="dia-juego">Día en la campaña</label>
          <input
            id="dia-juego"
            value={campana.diaJuego}
            placeholder="Día 1, por la mañana"
            onChange={(e) => actualizarCampana({ diaJuego: e.target.value })}
          />
        </div>
      </header>

      <div className="mesa-rejilla">
        <section className="panel panel-grupo" aria-labelledby="t-grupo">
          <div className="panel-cabecera">
            <h2 id="t-grupo">El grupo</h2>
            <Link to="/personajes">Editar</Link>
          </div>
          {datos.pj.length === 0 ? (
            <p className="vacio-corto">Añade personajes para ver aquí sus defensas y sentidos.</p>
          ) : (
            <div className="tabla-envoltura">
              <table className="tabla">
                <thead>
                  <tr>
                    <th scope="col">Personaje</th>
                    <th scope="col" title="Clase de armadura">CA</th>
                    <th scope="col" title="Puntos de golpe máximos">PG</th>
                    <th scope="col" title="Percepción pasiva">Percepción</th>
                    <th scope="col" title="Perspicacia pasiva">Perspicacia</th>
                  </tr>
                </thead>
                <tbody>
                  {datos.pj.map((p) => (
                    <tr key={p.id}>
                      <th scope="row">
                        <Link to={`/personajes/${p.id}`}>{p.nombre || 'Sin nombre'}</Link>
                        <span>{[p.clase, p.nivel].filter(Boolean).join(' ')}</span>
                      </th>
                      <td>{p.ca ?? '–'}</td>
                      <td>{p.pgMax ?? '–'}</td>
                      <td>{p.percepcion ?? '–'}</td>
                      <td>{p.perspicacia ?? '–'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="panel panel-dados" aria-labelledby="t-dados">
          <h2 id="t-dados">Dados</h2>
          <Dados />
        </section>

        <section className="panel panel-pistas" aria-labelledby="t-pistas">
          <div className="panel-cabecera">
            <h2 id="t-pistas">Pistas por descubrir</h2>
            <Link to="/pistas">Ver todas</Link>
          </div>
          {pendientes.length === 0 ? (
            <p className="vacio-corto">No quedan pistas ocultas. Prepara nuevas en Pistas.</p>
          ) : (
            <ul className="pistas-pendientes">
              {pendientes.map((p) => (
                <li key={p.id}>
                  <Link to={`/pistas/${p.id}`}>{p.nombre || 'Sin nombre'}</Link>
                  <button type="button" className="boton boton-pequeno" onClick={() => actualizar('pistas', p.id, { visible: true })}>
                    Revelar
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="panel panel-sesion" aria-labelledby="t-sesion">
          <div className="panel-cabecera">
            <h2 id="t-sesion">{proxima ? proxima.nombre || 'Sesión sin título' : 'Próxima sesión'}</h2>
            {proxima && <Link to={`/sesiones/${proxima.id}`}>Abrir</Link>}
          </div>
          {proxima ? (
            proxima.preparacion ? (
              <BloqueSellado etiqueta="Preparación">
                <p className="texto-largo">{String(proxima.preparacion)}</p>
              </BloqueSellado>
            ) : (
              <p className="vacio-corto">Esta sesión aún no tiene preparación.</p>
            )
          ) : (
            <button type="button" className="boton" onClick={() => navegar(`/sesiones/${crear('sesiones')}`)}>
              Preparar una sesión
            </button>
          )}
        </section>

        <section className="panel panel-facciones" aria-labelledby="t-facciones">
          <div className="panel-cabecera">
            <h2 id="t-facciones">Facciones</h2>
            <Link to="/facciones">Editar</Link>
          </div>
          {datos.facciones.length === 0 ? (
            <p className="vacio-corto">Sin facciones todavía.</p>
          ) : (
            <ul className="facciones-mini">
              {datos.facciones.map((f) => {
                const renombre = Number(f.renombre ?? 0)
                return (
                  <li key={f.id}>
                    <Link to={`/facciones/${f.id}`}>{f.nombre || 'Sin nombre'}</Link>
                    <span className={`actitud actitud-${ACTITUDES.indexOf(String(f.actitud))}`}>{f.actitud || 'Sin actitud'}</span>
                    <span className="contador" role="group" aria-label={`Renombre con ${f.nombre}`}>
                      <button type="button" aria-label="Restar renombre" onClick={() => actualizar('facciones', f.id, { renombre: renombre - 1 })}>
                        −
                      </button>
                      <span>{renombre}</span>
                      <button type="button" aria-label="Sumar renombre" onClick={() => actualizar('facciones', f.id, { renombre: renombre + 1 })}>
                        +
                      </button>
                    </span>
                  </li>
                )
              })}
            </ul>
          )}
        </section>

        <section className="panel panel-notas" aria-labelledby="t-notas">
          <h2 id="t-notas">
            <label htmlFor="notas-rapidas">Notas rápidas</label>
          </h2>
          <textarea
            id="notas-rapidas"
            rows={6}
            value={campana.notasRapidas}
            placeholder="Nombres improvisados, deudas, lo que prometiste al grupo…"
            onChange={(e) => actualizarCampana({ notasRapidas: e.target.value })}
          />
        </section>
      </div>
    </div>
  )
}
