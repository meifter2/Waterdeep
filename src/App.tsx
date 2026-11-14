import { useEffect } from 'react'
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { Layout } from './components/Layout'
import { COLECCIONES, ORDEN_COLECCIONES } from './data/entities'
import { escucharOtrasPestanas } from './data/store'
import { aplicarTema, useUI } from './data/ui'
import { Ajustes } from './pages/Ajustes'
import { PaginaColeccion } from './pages/Coleccion'
import { Combate } from './pages/Combate'
import { Mesa } from './pages/Mesa'
import { VistaJugadores } from './pages/VistaJugadores'

// HashRouter (#/ruta): funciona en cualquier hosting estático sin configurar el servidor.
export function App() {
  const tema = useUI((s) => s.tema)
  useEffect(() => aplicarTema(tema), [tema])
  useEffect(() => escucharOtrasPestanas(), [])

  return (
    <HashRouter>
      <Routes>
        <Route path="/jugadores" element={<VistaJugadores />} />
        <Route element={<Layout />}>
          <Route index element={<Mesa />} />
          <Route path="combate" element={<Combate />} />
          {ORDEN_COLECCIONES.map((c) => (
            <Route key={c} path={`${COLECCIONES[c].ruta.slice(1)}/:id?`} element={<PaginaColeccion key={c} coleccion={c} />} />
          ))}
          <Route path="ajustes" element={<Ajustes />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </HashRouter>
  )
}
