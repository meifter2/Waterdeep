import { useMemo } from 'react'
import { compararSesiones, sesionVigente, useSesionActiva } from '../../data/sesiones'
import { useDatos } from '../../data/store'
import { useSeleccion } from './seleccion'

/**
 * Franja de sesiones: «Main» y cada sesión (la elegida, en oro). Elegir sesión solo filtra las tarjetas:
 * no reproduce ni detiene nada. Con muchas sesiones, la franja se desplaza en horizontal (móvil).
 */
export function BarraSesiones({ alNueva, alGestionar, cuenta }: { alNueva: () => void; alGestionar: () => void; cuenta: { total: number; comunes: number } }) {
  const sesiones = useDatos((s) => s.sesiones)
  const sinSesiones = useDatos((s) => s.sinSesiones)
  const { activa, elegir } = useSesionActiva()
  const seleccion = useSeleccion()
  const lista = useMemo(() => [...sesiones].sort(compararSesiones), [sesiones])
  const actual = sesionVigente(activa, sesiones)

  return (
    <nav className="sesiones" aria-label="Sesiones de juego">
      <ul className="sesiones-lista">
        <li>
          <button type="button" className="sesion-chip sesion-todo" aria-pressed={!actual} onClick={() => elegir(null)}>
            Main
          </button>
        </li>
        {lista.map((s) => (
          <li key={s.id}>
            <button
              type="button"
              className="sesion-chip"
              aria-pressed={actual?.id === s.id}
              data-finalizada={s.finalizada || undefined}
              title={s.finalizada ? `${s.nombre} (finalizada)` : undefined}
              onClick={() => elegir(s.id)}
            >
              {s.finalizada && (
                <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
                  <path d="M3 8.5 6.5 12 13 4.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
              {s.nombre}
              {s.finalizada && <span className="sr"> (finalizada)</span>}
            </button>
          </li>
        ))}
        <li>
          <button type="button" className="sesion-chip sesion-nueva" onClick={alNueva}>
            + Nueva sesión
          </button>
        </li>
      </ul>
      <div className="sesiones-pie">
        <p className={sinSesiones ? 'aviso-suave' : 'sesiones-estado'} aria-live="polite">
          {sinSesiones ||
            (actual
            ? `${actual.nombre}${actual.finalizada ? ' (finalizada)' : ''}: ${cuenta.total === 1 ? '1 tarjeta' : `${cuenta.total} tarjetas`}${cuenta.comunes ? `, ${cuenta.comunes} ${cuenta.comunes === 1 ? 'común' : 'comunes'}` : ''}`
            : '')}
        </p>
        <div className="sesiones-acciones">
          {actual && !seleccion.activo && (
            <button
              type="button"
              className="boton boton-pequeno"
              title="Abre Main para elegir tarjetas que ya tienes y añadirlas a esta sesión"
              onClick={() => {
                elegir(null)
                seleccion.empezar(actual.id)
              }}
            >
              Traer tarjetas de Main
            </button>
          )}
          {lista.length > 0 && (
            <button type="button" className="boton boton-pequeno" onClick={alGestionar}>
              Gestionar sesiones
            </button>
          )}
          <button
            type="button"
            className="boton boton-pequeno"
            aria-pressed={seleccion.activo}
            onClick={() => (seleccion.activo ? seleccion.terminar() : seleccion.empezar())}
          >
            {seleccion.activo ? 'Terminar selección' : 'Seleccionar tarjetas'}
          </button>
        </div>
      </div>
    </nav>
  )
}
