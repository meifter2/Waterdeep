import { useEffect } from 'react'
import { Biblioteca } from './pages/Biblioteca'
import { Entrada, NuevaContrasena } from './pages/Entrada'
import { escucharSesion, useSesion } from './data/sesion'
import { useDatos } from './data/store'
import { useReproduccion } from './data/reproduccion'
import { useMezcla } from './data/mezcla'
import { precargar } from './lib/apis'

// Puerta de entrada: sin sesión → pantalla de Google; con sesión → biblioteca.
export function App() {
  const estado = useSesion((s) => s.estado)
  const usuarioId = useSesion((s) => s.usuario?.id)
  const recuperando = useSesion((s) => s.recuperando)

  useEffect(() => escucharSesion(), [])
  useEffect(() => precargar(), [])

  // Al entrar (o cambiar de usuario) se cargan sus canciones; al salir se vacía todo.
  useEffect(() => {
    if (estado === 'dentro') void useDatos.getState().cargar()
    if (estado === 'fuera') {
      useReproduccion.getState().olvidar()
      useMezcla.getState().vaciar()
      useDatos.getState().vaciar()
    }
  }, [estado, usuarioId])

  if (estado === 'comprobando') return <p className="comprobando">Abriendo DFY…</p>
  if (recuperando) return <NuevaContrasena />
  if (estado === 'fuera') return <Entrada />
  return <Biblioteca />
}
