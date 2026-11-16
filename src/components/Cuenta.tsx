import { useSesion } from '../data/sesion'
import { modoLocal } from '../lib/supabase'

/** Usuario con sesión y botón de salir. En modo local no se muestra. */
export function Cuenta() {
  const usuario = useSesion((s) => s.usuario)
  const salir = useSesion((s) => s.salir)
  if (modoLocal || !usuario) return null
  return (
    <div className="cuenta">
      {usuario.avatar ? (
        <img className="cuenta-avatar" src={usuario.avatar} alt="" referrerPolicy="no-referrer" />
      ) : (
        <span className="cuenta-avatar" aria-hidden="true">
          {usuario.nombre.charAt(0).toUpperCase()}
        </span>
      )}
      <span className="cuenta-nombre" title={usuario.email}>
        {usuario.nombre}
      </span>
      <button type="button" className="boton boton-sutil boton-pequeno" onClick={() => void salir()}>
        Salir
      </button>
    </div>
  )
}
