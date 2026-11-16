import { useInstalacion } from '../lib/pwa'

/** Botón «Instalar app»: solo aparece cuando el navegador permite instalarla. */
export function Instalar() {
  const evento = useInstalacion((s) => s.evento)
  const instalar = useInstalacion((s) => s.instalar)
  if (!evento) return null
  return (
    <button type="button" className="boton" onClick={() => void instalar()}>
      Instalar app
    </button>
  )
}
