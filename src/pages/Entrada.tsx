import { useState, type FormEvent } from 'react'
import { useSesion } from '../data/sesion'

type Modo = 'entrar' | 'crear' | 'recuperar'

const TEXTO_BOTON: Record<Modo, string> = { entrar: 'Entrar', crear: 'Crear cuenta', recuperar: 'Enviar enlace' }
const MINIMO = 8

/** Pantalla de entrada: Google o email y contraseña. */
export function Entrada() {
  const { entrarConGoogle, entrarConEmail, crearCuenta, recuperarContrasena, limpiarMensajes, error, aviso, ocupado } = useSesion()
  const [modo, setModo] = useState<Modo>('entrar')
  const [email, setEmail] = useState('')
  const [contrasena, setContrasena] = useState('')
  const [local, setLocal] = useState('')

  const cambiarModo = (m: Modo) => {
    setModo(m)
    setLocal('')
    limpiarMensajes()
  }

  const enviar = (e: FormEvent) => {
    e.preventDefault()
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setLocal('Escribe un email válido.')
    if (modo !== 'recuperar' && !contrasena) return setLocal('Escribe tu contraseña.')
    if (modo === 'crear' && contrasena.length < MINIMO) return setLocal(`La contraseña necesita al menos ${MINIMO} caracteres.`)
    setLocal('')
    if (modo === 'entrar') void entrarConEmail(email, contrasena)
    else if (modo === 'crear') void crearCuenta(email, contrasena)
    else void recuperarContrasena(email)
  }

  const fallo = local || error

  return (
    <main className="entrada">
      <div className="entrada-texto">
        <h1>Banda sonora</h1>
        <p>
          La música de tu mesa en un solo sitio: opening, ending, personajes, lugares y momentos. Pulsa una tarjeta y suena su
          canción de Spotify o YouTube.
        </p>
        <button type="button" className="boton boton-google" onClick={() => void entrarConGoogle()}>
          <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
            <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
            <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
            <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
            <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
          </svg>
          Entrar con Google
        </button>

        <p className="entrada-separador">o con tu email</p>

        <form className="entrada-form" onSubmit={enviar} noValidate>
          <h2 className="sr">{modo === 'crear' ? 'Crear cuenta' : modo === 'recuperar' ? 'Recuperar contraseña' : 'Entrar con email'}</h2>
          <div className="campo">
            <label htmlFor="en-email">Email</label>
            <input id="en-email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          {modo !== 'recuperar' && (
            <div className="campo">
              <label htmlFor="en-contrasena">Contraseña</label>
              <input
                id="en-contrasena"
                type="password"
                autoComplete={modo === 'crear' ? 'new-password' : 'current-password'}
                value={contrasena}
                onChange={(e) => setContrasena(e.target.value)}
                aria-describedby={modo === 'crear' ? 'en-contrasena-ayuda' : undefined}
              />
              {modo === 'crear' && (
                <p id="en-contrasena-ayuda" className="ayuda">
                  Al menos {MINIMO} caracteres.
                </p>
              )}
            </div>
          )}
          {fallo && (
            <p className="error" role="alert">
              {fallo}
            </p>
          )}
          {aviso && (
            <p className="aviso aviso-ok" role="status">
              {aviso}
            </p>
          )}
          <button type="submit" className="boton boton-principal" disabled={ocupado}>
            {ocupado ? 'Un momento…' : TEXTO_BOTON[modo]}
          </button>
          <div className="entrada-enlaces">
            {modo !== 'entrar' && (
              <button type="button" className="enlace" onClick={() => cambiarModo('entrar')}>
                Ya tengo cuenta
              </button>
            )}
            {modo !== 'crear' && (
              <button type="button" className="enlace" onClick={() => cambiarModo('crear')}>
                Crear una cuenta
              </button>
            )}
            {modo === 'entrar' && (
              <button type="button" className="enlace" onClick={() => cambiarModo('recuperar')}>
                ¿Has olvidado la contraseña?
              </button>
            )}
          </div>
        </form>
        <p className="ayuda">Cada cuenta tiene sus propias canciones. Nadie más puede verlas.</p>
      </div>
    </main>
  )
}

/** Tras abrir el enlace del correo de recuperación: elegir una contraseña nueva. */
export function NuevaContrasena() {
  const { cambiarContrasena, error, ocupado } = useSesion()
  const [contrasena, setContrasena] = useState('')
  const [local, setLocal] = useState('')
  const enviar = (e: FormEvent) => {
    e.preventDefault()
    if (contrasena.length < MINIMO) return setLocal(`La contraseña necesita al menos ${MINIMO} caracteres.`)
    setLocal('')
    void cambiarContrasena(contrasena)
  }
  return (
    <main className="entrada">
      <form className="entrada-texto entrada-form" onSubmit={enviar} noValidate>
        <h1>Nueva contraseña</h1>
        <div className="campo">
          <label htmlFor="nc-contrasena">Contraseña nueva</label>
          <input id="nc-contrasena" type="password" autoComplete="new-password" value={contrasena} onChange={(e) => setContrasena(e.target.value)} />
          <p className="ayuda">Al menos {MINIMO} caracteres.</p>
        </div>
        {(local || error) && (
          <p className="error" role="alert">
            {local || error}
          </p>
        )}
        <button type="submit" className="boton boton-principal" disabled={ocupado}>
          {ocupado ? 'Guardando…' : 'Guardar contraseña'}
        </button>
      </form>
    </main>
  )
}
