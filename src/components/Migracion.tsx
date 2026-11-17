import { useState } from 'react'
import { leerDelNavegador, olvidarDelNavegador } from '../data/convertir'
import { importarBiblioteca } from '../data/guardar'
import { modoLocal } from '../lib/supabase'

/** Si este navegador guarda datos de antes de tener cuenta, ofrece subirlos (sin duplicar sonidos). */
export function Migracion() {
  const [antiguos, setAntiguos] = useState(() => (modoLocal ? null : leerDelNavegador()))
  const [subiendo, setSubiendo] = useState(false)
  const [error, setError] = useState('')
  if (!antiguos || antiguos.elementos.length === 0) return null
  const n = antiguos.elementos.length

  const subir = async () => {
    setSubiendo(true)
    setError('')
    try {
      await importarBiblioteca(antiguos)
      olvidarDelNavegador()
      setAntiguos(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se ha podido subir. Inténtalo de nuevo.')
    }
    setSubiendo(false)
  }

  return (
    <div className="aviso aviso-ok migracion" role="status">
      <p>
        Este navegador guarda {n === 1 ? '1 elemento' : `${n} elementos`} de antes de tener cuenta. ¿Los subimos a tu cuenta? Los
        sonidos que ya tengas no se duplican.
      </p>
      {error && <p className="error">{error}</p>}
      <div className="acciones">
        <button type="button" className="boton boton-principal" disabled={subiendo} onClick={() => void subir()}>
          {subiendo ? 'Subiendo…' : 'Subir a mi cuenta'}
        </button>
        <button
          type="button"
          className="boton boton-sutil"
          onClick={() => {
            olvidarDelNavegador()
            setAntiguos(null)
          }}
        >
          Descartarlos
        </button>
      </div>
    </div>
  )
}
