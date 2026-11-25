import { useMemo, useState } from 'react'
import { asignar, compararSesiones, crearSesion, marcarComun, quitarDeSesion, sesionVigente, siguienteNombre, useSesionActiva } from '../../data/sesiones'
import { useDatos } from '../../data/store'
import { useSeleccion } from './seleccion'

const NUEVA = '__nueva'

/** Acciones en bloque sobre las tarjetas seleccionadas. Nunca borra tarjetas ni sonidos: solo cambia la organización. */
export function BarraSeleccion({ visibles, alGuardar }: { visibles: string[]; alGuardar: (m: string) => void }) {
  const { ids, poner, terminar, destino: propuesto } = useSeleccion()
  const sesiones = useDatos((s) => s.sesiones)
  const comunes = useDatos((s) => s.elementos_comunes)
  const activa = useSesionActiva((s) => s.activa)
  const actual = sesionVigente(activa, sesiones)
  const lista = useMemo(() => [...sesiones].sort(compararSesiones), [sesiones])
  const [destino, setDestino] = useState(() => propuesto ?? actual?.id ?? lista.find((s) => !s.finalizada)?.id ?? lista[0]?.id ?? NUEVA)
  const [ocupado, setOcupado] = useState(false)
  const n = ids.length
  const tarjetas = (k: number) => (k === 1 ? '1 tarjeta' : `${k} tarjetas`)
  const todasComunes = n > 0 && ids.every((id) => comunes.some((c) => c.elemento_id === id))
  const destinoValido = destino === NUEVA || lista.some((s) => s.id === destino) ? destino : NUEVA

  const hacer = async (f: () => Promise<string | null>) => {
    setOcupado(true)
    const m = await f()
    setOcupado(false)
    if (m) alGuardar(m)
  }

  const anadir = () =>
    hacer(async () => {
      const s = destinoValido === NUEVA ? await crearSesion(siguienteNombre(useDatos.getState().sesiones)) : lista.find((x) => x.id === destinoValido)
      if (!s) return null
      setDestino(s.id)
      const k = await asignar(ids, s.id)
      return k ? `${tarjetas(k)} añadida${k === 1 ? '' : 's'} a «${s.nombre}».` : `Ya estaban todas en «${s.nombre}».`
    })

  const todasVisibles = visibles.length > 0 && visibles.every((id) => ids.includes(id))

  return (
    <div className="seleccion" role="region" aria-label="Organizar las tarjetas seleccionadas">
      <div className="seleccion-cuenta">
        <p aria-live="polite">{n ? `${tarjetas(n)} seleccionada${n === 1 ? '' : 's'}` : 'Toca las tarjetas para seleccionarlas'}</p>
        <button type="button" className="enlace" onClick={() => poner(todasVisibles ? [] : visibles)} disabled={!visibles.length}>
          {todasVisibles ? 'Quitar selección' : 'Seleccionar todas las visibles'}
        </button>
      </div>
      <div className="seleccion-acciones">
        <span className="seleccion-anadir">
          <label className="sr" htmlFor="seleccion-destino">
            Sesión de destino
          </label>
          <select id="seleccion-destino" value={destinoValido} onChange={(e) => setDestino(e.target.value)}>
            {lista.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nombre}
                {s.finalizada ? ' (finalizada)' : ''}
              </option>
            ))}
            <option value={NUEVA}>Nueva sesión ({siguienteNombre(sesiones)})</option>
          </select>
          <button type="button" className="boton boton-principal" disabled={!n || ocupado} onClick={() => void anadir()}>
            Añadir a la sesión
          </button>
        </span>
        {actual && (
          <button
            type="button"
            className="boton"
            disabled={!n || ocupado}
            onClick={() =>
              void hacer(async () => {
                if (!(await quitarDeSesion(ids, actual.id))) return null
                poner([])
                return `Quitadas de «${actual.nombre}». Siguen en «Toda la biblioteca».`
              })
            }
          >
            Quitar de «{actual.nombre}»
          </button>
        )}
        <button
          type="button"
          className="boton"
          disabled={!n || ocupado}
          onClick={() =>
            void hacer(async () => {
              if (!(await marcarComun(ids, !todasComunes))) return null
              return todasComunes ? 'Ya no son comunes: solo aparecen en sus sesiones.' : 'Marcadas como comunes: aparecen en todas las sesiones.'
            })
          }
        >
          {todasComunes ? 'Quitar «común»' : 'Común a todas las sesiones'}
        </button>
        <button type="button" className="boton boton-sutil" onClick={terminar}>
          Hecho
        </button>
      </div>
    </div>
  )
}
