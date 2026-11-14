import { useEffect } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { COLECCIONES, ORDEN_COLECCIONES } from '../data/entities'
import { useDatos } from '../data/store'
import { almacenamientoDisponible } from '../data/storage'
import { useUI } from '../data/ui'
import { Sello } from './Sello'

export function Layout() {
  const campana = useDatos((s) => s.campana)
  const combateActivo = useDatos((s) => s.combate.activo)
  const pendientes = useDatos((s) => s.pistas.filter((p) => !p.visible).length)
  const ocultar = useUI((s) => s.ocultarSecretos)
  const alternar = useUI((s) => s.alternarSecretos)
  const { pathname } = useLocation()

  useEffect(() => {
    // Lleva el foco al contenido al cambiar de pantalla (lectores de pantalla),
    // salvo que la propia pantalla ya haya enfocado un campo (p. ej. el nombre de una ficha nueva).
    const main = document.getElementById('contenido')
    if (main && !main.contains(document.activeElement)) main.focus({ preventScroll: true })
    window.scrollTo(0, 0)
  }, [pathname])

  return (
    <div className="app" data-ocultar-secretos={ocultar || undefined}>
      <a className="saltar" href="#contenido">
        Saltar al contenido
      </a>
      <header className="riel">
        <NavLink to="/" className="riel-campana" end>
          <span className="riel-nombre">{campana.nombre || 'Mi campaña'}</span>
          {campana.diaJuego && <span className="riel-dia">{campana.diaJuego}</span>}
        </NavLink>

        <nav aria-label="Secciones" className="riel-nav">
          <NavLink to="/" end>
            Mesa
          </NavLink>
          <NavLink to="/combate">
            Combate
            {combateActivo && <span className="riel-pulso" aria-label="combate en curso" />}
          </NavLink>
          {ORDEN_COLECCIONES.map((c) => (
            <NavLink key={c} to={COLECCIONES[c].ruta}>
              {COLECCIONES[c].plural}
              {c === 'pistas' && pendientes > 0 && (
                <span className="riel-cuenta" aria-label={`${pendientes} por descubrir`}>
                  {pendientes}
                </span>
              )}
            </NavLink>
          ))}
          <NavLink to="/ajustes">Ajustes</NavLink>
          <a className="solo-movil" href="#/jugadores" target="_blank" rel="noopener">
            Vista de jugadores
          </a>
        </nav>

        <div className="riel-pie">
          <button
            type="button"
            className="interruptor-secretos"
            aria-pressed={ocultar}
            onClick={alternar}
            title="Difumina los bloques sellados por si alguien mira tu pantalla"
          >
            <Sello tamano={16} />
            {ocultar ? 'Secretos ocultos' : 'Ocultar secretos'}
          </button>
          <a className="boton boton-claro" href="#/jugadores" target="_blank" rel="noopener">
            Abrir vista de jugadores
          </a>
        </div>
      </header>

      <main id="contenido" className="contenido" tabIndex={-1}>
        {!almacenamientoDisponible && (
          <p className="aviso" role="status">
            Este navegador no permite guardar datos. Lo que escribas se perderá al cerrar la pestaña: exporta una copia desde Ajustes.
          </p>
        )}
        <Outlet />
      </main>
    </div>
  )
}
