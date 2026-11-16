import { useState } from 'react'
import { cancionesAntiguasDelNavegador, olvidarCancionesAntiguas } from '../data/repositorio'
import { useDatos } from '../data/store'
import { modoLocal } from '../lib/supabase'

/** Si este navegador guarda canciones de la versión anterior, ofrece subirlas a la cuenta. */
export function Migracion() {
  const importar = useDatos((s) => s.importar)
  const [antiguas, setAntiguas] = useState(() => (modoLocal ? [] : cancionesAntiguasDelNavegador()))
  const [subiendo, setSubiendo] = useState(false)
  if (antiguas.length === 0) return null

  const subir = async () => {
    setSubiendo(true)
    const n = await importar(antiguas)
    setSubiendo(false)
    if (n === antiguas.length) {
      olvidarCancionesAntiguas()
      setAntiguas([])
    }
  }

  return (
    <div className="aviso aviso-ok migracion" role="status">
      <p>
        Este navegador guarda {antiguas.length === 1 ? '1 canción' : `${antiguas.length} canciones`} de antes de tener
        cuenta. ¿Las subimos a tu cuenta?
      </p>
      <div className="acciones">
        <button type="button" className="boton boton-principal" disabled={subiendo} onClick={subir}>
          {subiendo ? 'Subiendo…' : 'Subir a mi cuenta'}
        </button>
        <button
          type="button"
          className="boton boton-sutil"
          onClick={() => {
            olvidarCancionesAntiguas()
            setAntiguas([])
          }}
        >
          Descartarlas
        </button>
      </div>
    </div>
  )
}
