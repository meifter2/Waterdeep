import { useState, type FormEvent } from 'react'
import { useDatos } from '../data/store'
import { salud } from '../data/publico'
import type { Combatiente, TipoCombatiente } from '../data/types'

export const CONDICIONES = [
  'Agarrado',
  'Apresado',
  'Asustado',
  'Aturdido',
  'Cegado',
  'Derribado',
  'Ensordecido',
  'Envenenado',
  'Hechizado',
  'Incapacitado',
  'Inconsciente',
  'Invisible',
  'Paralizado',
  'Petrificado',
  'Agotamiento',
  'Concentrado',
]

const TIPOS: Record<TipoCombatiente, string> = { pj: 'Personaje', aliado: 'Aliado', enemigo: 'Enemigo' }

const d20 = () => 1 + Math.floor(Math.random() * 20)

export function Combate() {
  const combate = useDatos((s) => s.combate)
  const pj = useDatos((s) => s.pj)
  const { anadirCombatiente, siguienteTurno, turnoAnterior, ordenarIniciativa, iniciarCombate, terminarCombate } = useDatos.getState()

  const faltan = pj.filter((p) => !combate.combatientes.some((c) => c.pjId === p.id))

  const anadirGrupo = () =>
    faltan.forEach((p) =>
      anadirCombatiente({
        nombre: p.nombre || 'Personaje',
        tipo: 'pj',
        iniciativa: 0,
        ca: Number(p.ca ?? 10),
        pg: Number(p.pgMax ?? 1),
        pgMax: Number(p.pgMax ?? 1),
        condiciones: [],
        pjId: p.id,
      }),
    )

  const terminar = () => {
    const vaciar = window.confirm('¿Quitar también a todos los combatientes de la lista?\n\nAceptar: vaciar la lista. Cancelar: conservarla.')
    terminarCombate(vaciar)
  }

  return (
    <div className="combate">
      <header className="combate-cabecera">
        <h1>Combate</h1>
        {combate.activo ? (
          <div className="combate-controles">
            <p className="ronda" aria-live="polite">
              Ronda <strong>{combate.ronda}</strong>
            </p>
            <button type="button" className="boton" onClick={turnoAnterior}>
              Turno anterior
            </button>
            <button type="button" className="boton boton-principal" onClick={siguienteTurno}>
              Siguiente turno
            </button>
            <button type="button" className="boton boton-claro-peligro" onClick={terminar}>
              Terminar combate
            </button>
          </div>
        ) : (
          <div className="combate-controles">
            {faltan.length > 0 && (
              <button type="button" className="boton" onClick={anadirGrupo}>
                Añadir al grupo ({faltan.length})
              </button>
            )}
            <button type="button" className="boton boton-principal" disabled={combate.combatientes.length === 0} onClick={iniciarCombate}>
              Empezar combate
            </button>
          </div>
        )}
      </header>

      {combate.combatientes.length === 0 ? (
        <div className="vacio">
          <p>Añade al grupo y a sus enemigos. Al empezar, se ordenan por iniciativa y la vista de jugadores muestra el orden de turnos.</p>
        </div>
      ) : (
        <>
          <ol className="iniciativa">
            {combate.combatientes.map((c, i) => (
              <FilaCombatiente key={c.id} c={c} enTurno={combate.activo && i === combate.turno} />
            ))}
          </ol>
          <div className="combate-ayuda">
            <button type="button" className="enlace" onClick={ordenarIniciativa}>
              Reordenar por iniciativa
            </button>
            {!combate.activo && <p className="ayuda">Escribe la iniciativa que saque cada jugador antes de empezar.</p>}
          </div>
        </>
      )}

      <NuevoCombatiente />
    </div>
  )
}

function FilaCombatiente({ c, enTurno }: { c: Combatiente; enTurno: boolean }) {
  const actualizar = useDatos((s) => s.actualizarCombatiente)
  const quitar = useDatos((s) => s.quitarCombatiente)
  const [cantidad, setCantidad] = useState('')
  const estado = salud(c.pg, c.pgMax)
  const pct = c.pgMax > 0 ? Math.max(0, Math.min(100, (c.pg / c.pgMax) * 100)) : 0
  const cambio = (signo: 1 | -1) => {
    const n = Number(cantidad)
    if (!cantidad || Number.isNaN(n)) return
    actualizar(c.id, { pg: Math.max(0, Math.min(c.pgMax, c.pg + signo * Math.abs(n))) })
    setCantidad('')
  }

  return (
    <li className={`combatiente tipo-${c.tipo} ${enTurno ? 'en-turno' : ''} ${c.pg <= 0 ? 'caido' : ''}`} aria-current={enTurno ? 'step' : undefined}>
      <div className="combatiente-ini">
        <label className="sr" htmlFor={`ini-${c.id}`}>
          Iniciativa de {c.nombre}
        </label>
        <input
          id={`ini-${c.id}`}
          type="number"
          inputMode="numeric"
          value={c.iniciativa}
          onChange={(e) => actualizar(c.id, { iniciativa: Number(e.target.value) })}
        />
      </div>

      <div className="combatiente-nombre">
        <strong>{c.nombre}</strong>
        <span>
          {TIPOS[c.tipo]}, CA {c.ca}
          {enTurno && <span className="turno-marca">le toca</span>}
        </span>
      </div>

      <div className="combatiente-pg">
        <div className="barra" aria-hidden="true">
          <span style={{ width: `${pct}%` }} data-estado={estado} />
        </div>
        <span className="pg-texto">
          {c.pg}/{c.pgMax} PG, {estado.toLowerCase()}
        </span>
        <div className="pg-cambio">
          <label className="sr" htmlFor={`pg-${c.id}`}>
            Cantidad de daño o curación para {c.nombre}
          </label>
          <input
            id={`pg-${c.id}`}
            type="number"
            inputMode="numeric"
            min={0}
            placeholder="0"
            value={cantidad}
            onChange={(e) => setCantidad(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && cambio(-1)}
          />
          <button type="button" className="boton boton-pequeno" onClick={() => cambio(-1)}>
            Daño
          </button>
          <button type="button" className="boton boton-pequeno" onClick={() => cambio(1)}>
            Curar
          </button>
        </div>
      </div>

      <div className="combatiente-condiciones">
        {c.condiciones.map((cond) => (
          <button
            key={cond}
            type="button"
            className="chip"
            aria-label={`Quitar ${cond}`}
            onClick={() => actualizar(c.id, { condiciones: c.condiciones.filter((x) => x !== cond) })}
          >
            {cond} <span aria-hidden="true">×</span>
          </button>
        ))}
        <label className="sr" htmlFor={`cond-${c.id}`}>
          Añadir condición a {c.nombre}
        </label>
        <select
          id={`cond-${c.id}`}
          value=""
          onChange={(e) => e.target.value && actualizar(c.id, { condiciones: [...c.condiciones, e.target.value] })}
        >
          <option value="">Añadir condición</option>
          {CONDICIONES.filter((x) => !c.condiciones.includes(x)).map((x) => (
            <option key={x}>{x}</option>
          ))}
        </select>
      </div>

      <button type="button" className="quitar" aria-label={`Quitar a ${c.nombre} del combate`} onClick={() => quitar(c.id)}>
        Quitar
      </button>
    </li>
  )
}

function NuevoCombatiente() {
  const anadir = useDatos((s) => s.anadirCombatiente)
  const [nombre, setNombre] = useState('')
  const [tipo, setTipo] = useState<TipoCombatiente>('enemigo')
  const [iniciativa, setIniciativa] = useState('')
  const [ca, setCa] = useState('')
  const [pg, setPg] = useState('')
  const [cantidad, setCantidad] = useState('1')
  const [error, setError] = useState('')

  const enviar = (e: FormEvent) => {
    e.preventDefault()
    if (!nombre.trim()) {
      setError('Escribe un nombre para el combatiente.')
      return
    }
    setError('')
    const n = Math.max(1, Math.min(20, Number(cantidad) || 1))
    for (let i = 1; i <= n; i++) {
      const pgNum = Math.max(1, Number(pg) || 1)
      anadir({
        nombre: n > 1 ? `${nombre.trim()} ${i}` : nombre.trim(),
        tipo,
        iniciativa: iniciativa === '' ? d20() : Number(iniciativa),
        ca: Number(ca) || 10,
        pg: pgNum,
        pgMax: pgNum,
        condiciones: [],
      })
    }
    setNombre('')
    setIniciativa('')
    setCantidad('1')
  }

  return (
    <form className="nuevo-combatiente" onSubmit={enviar}>
      <h2>Añadir combatiente</h2>
      <div className="nuevo-campos">
        <div className="campo campo-ancho">
          <label htmlFor="nc-nombre">Nombre</label>
          <input id="nc-nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Matón del muelle" aria-invalid={error ? true : undefined} />
        </div>
        <div className="campo">
          <label htmlFor="nc-tipo">Bando</label>
          <select id="nc-tipo" value={tipo} onChange={(e) => setTipo(e.target.value as TipoCombatiente)}>
            <option value="enemigo">Enemigo</option>
            <option value="aliado">Aliado</option>
            <option value="pj">Personaje</option>
          </select>
        </div>
        <div className="campo">
          <label htmlFor="nc-ini">Iniciativa</label>
          <input id="nc-ini" type="number" inputMode="numeric" value={iniciativa} placeholder="d20" onChange={(e) => setIniciativa(e.target.value)} />
        </div>
        <div className="campo">
          <label htmlFor="nc-ca">CA</label>
          <input id="nc-ca" type="number" inputMode="numeric" value={ca} placeholder="10" onChange={(e) => setCa(e.target.value)} />
        </div>
        <div className="campo">
          <label htmlFor="nc-pg">PG</label>
          <input id="nc-pg" type="number" inputMode="numeric" value={pg} placeholder="1" onChange={(e) => setPg(e.target.value)} />
        </div>
        <div className="campo">
          <label htmlFor="nc-cantidad">Cantidad</label>
          <input id="nc-cantidad" type="number" inputMode="numeric" min={1} max={20} value={cantidad} onChange={(e) => setCantidad(e.target.value)} />
        </div>
      </div>
      {error && <p className="error">{error}</p>}
      <p className="ayuda">Si dejas la iniciativa vacía, se tira un d20 por cada uno.</p>
      <button type="submit" className="boton boton-principal">
        Añadir al combate
      </button>
    </form>
  )
}
