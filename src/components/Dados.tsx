import { useState, type FormEvent } from 'react'
import { useDatos } from '../data/store'
import { tirar } from '../lib/dados'

const RAPIDOS = ['d4', 'd6', 'd8', 'd10', 'd12', 'd20', 'd100']

export function Dados() {
  const tiradas = useDatos((s) => s.tiradas)
  const registrar = useDatos((s) => s.registrarTirada)
  const borrar = useDatos((s) => s.borrarTiradas)
  const [expresion, setExpresion] = useState('')
  const [error, setError] = useState('')

  const lanzar = (expr: string) => {
    const r = tirar(expr)
    if (!r) {
      setError('Escribe una tirada como d20, 2d6+3 o 1d8+1d6.')
      return
    }
    setError('')
    registrar({ expresion: expr.replace(/\s+/g, ''), detalle: r.detalle, total: r.total })
  }

  const enviar = (e: FormEvent) => {
    e.preventDefault()
    lanzar(expresion)
  }

  const ultima = tiradas[0]

  return (
    <div className="dados">
      <div className="dados-rapidos" role="group" aria-label="Tiradas rápidas">
        {RAPIDOS.map((d) => (
          <button key={d} type="button" className="dado" onClick={() => lanzar(d)}>
            {d}
          </button>
        ))}
      </div>
      <form className="dados-form" onSubmit={enviar}>
        <label className="sr" htmlFor="expresion">
          Tirada
        </label>
        <input
          id="expresion"
          value={expresion}
          placeholder="2d6+3"
          autoComplete="off"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? 'error-dados' : undefined}
          onChange={(e) => setExpresion(e.target.value)}
        />
        <button type="submit" className="boton">
          Tirar
        </button>
      </form>
      {error && (
        <p className="error" id="error-dados">
          {error}
        </p>
      )}
      <div className="dados-resultado" aria-live="polite">
        {ultima ? (
          <>
            <span className="dados-total" key={ultima.id}>
              {ultima.total}
            </span>
            <span className="dados-detalle">
              {ultima.expresion}: {ultima.detalle}
            </span>
          </>
        ) : (
          <span className="dados-detalle">Aún no has tirado.</span>
        )}
      </div>
      {tiradas.length > 1 && (
        <details className="dados-historial">
          <summary>Tiradas anteriores</summary>
          <ol>
            {tiradas.slice(1, 10).map((t) => (
              <li key={t.id}>
                <strong>{t.total}</strong> {t.expresion}
              </li>
            ))}
          </ol>
          <button type="button" className="enlace" onClick={borrar}>
            Borrar historial
          </button>
        </details>
      )}
    </div>
  )
}
