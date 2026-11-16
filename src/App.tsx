import { useEffect } from 'react'
import { Biblioteca } from './pages/Biblioteca'
import { Entrada } from './pages/Entrada'
import { escucharSesion, useSesion } from './data/sesion'
import { useDatos } from './data/store'
import { useReproduccion } from './data/reproduccion'
import { precargar } from './lib/apis'

// Puerta de entrada: sin sesión → pantalla de Google; con sesión → biblioteca.
export function App() {
  const estado = useSesion((s) => s.estado)
  const usuarioId = useSesion((s) => s.usuario?.id)

  useEffect(() => escucharSesion(), [])
  useEffect(() => precargar(), [])

  // Al entrar (o cambiar de usuario) se cargan sus canciones; al salir se vacía todo.
  useEffect(() => {
    if (estado === 'dentro') void useDatos.getState().cargar()
    if (estado === 'fuera') {
      useReproduccion.getState().detener()
      useDatos.getState().vaciar()
    }
  }, [estado, usuarioId])

  if (estado === 'comprobando') return <p className="comprobando">Abriendo tu banda sonora…</p>
  if (estado === 'fuera') return <Entrada />
  return <Biblioteca />
}
