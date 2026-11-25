import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { compararSesiones, crearSesion, eliminarSesion, marcarFinalizada, renombrarSesion, siguienteNombre, useSesionActiva } from '../../data/sesiones'
import { useDatos } from '../../data/store'
import type { Sesion } from '../../data/types'
import { BotonConfirmar } from '../Confirmar'

/**
 * Crear, renombrar, finalizar y eliminar sesiones. `nueva`: se abre para crear una y, al crearla, se elige y se cierra.
 * Eliminar una sesión borra SOLO la organización: tarjetas, sonidos, archivos y retratos siguen en «Toda la biblioteca».
 */
export function GestionSesiones({ nueva = false, alCerrar, alGuardar }: { nueva?: boolean; alCerrar: () => void; alGuardar: (m: string) => void }) {
  const sesiones = useDatos((s) => s.sesiones)
  const relaciones = useDatos((s) => s.sesion_elementos)
  const elegir = useSesionActiva((s) => s.elegir)
  const lista = useMemo(() => [...sesiones].sort(compararSesiones), [sesiones])
  const [nombre, setNombre] = useState(() => siguienteNombre(sesiones))
  const [creando, setCreando] = useState(false)
  const dialogo = useRef<HTMLDialogElement>(null)
  const campo = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const d = dialogo.current
    if (d && !d.open) d.showModal()
    if (nueva) {
      campo.current?.focus()
      campo.current?.select()
    }
  }, [nueva])

  const crear = async (e: FormEvent) => {
    e.preventDefault()
    if (!nombre.trim() || creando) return
    setCreando(true)
    const s = await crearSesion(nombre)
    setCreando(false)
    if (!s) return alCerrar()
    alGuardar(`«${s.nombre}» creada. Las tarjetas que crees ahora se guardan en ella.`)
    if (nueva) {
      elegir(s.id)
      alCerrar()
    } else setNombre(siguienteNombre([...sesiones, s]))
  }

  return (
    <dialog ref={dialogo} className="dialogo" onClose={alCerrar} aria-labelledby="sesiones-titulo">
      <div className="copias gestion-sesiones">
        <h2 id="sesiones-titulo">{nueva ? 'Nueva sesión' : 'Sesiones'}</h2>
        <form className="sesion-crear" onSubmit={(e) => void crear(e)}>
          <div className="campo">
            <label htmlFor="sesion-nombre">{nueva ? 'Nombre' : 'Nueva sesión'}</label>
            <input id="sesion-nombre" ref={campo} value={nombre} maxLength={60} autoComplete="off" onChange={(e) => setNombre(e.target.value)} />
          </div>
          <button type="submit" className="boton boton-principal" disabled={!nombre.trim() || creando}>
            {creando ? 'Creando…' : 'Crear sesión'}
          </button>
        </form>
        {!nueva && lista.length > 0 && (
          <ul className="sesiones-gestion" aria-label="Tus sesiones">
            {lista.map((s) => (
              <FilaSesion key={s.id} sesion={s} tarjetas={relaciones.filter((r) => r.sesion_id === s.id).length} alGuardar={alGuardar} />
            ))}
          </ul>
        )}
        {!nueva && (
          <p className="ayuda-normal">
            Una tarjeta puede estar en varias sesiones sin duplicarse. Eliminar una sesión solo quita la organización: tus tarjetas, sonidos y archivos
            siguen en «Toda la biblioteca».
          </p>
        )}
        <div className="editor-acciones">
          <button type="button" className="boton" onClick={alCerrar}>
            {nueva ? 'Cancelar' : 'Cerrar'}
          </button>
        </div>
      </div>
    </dialog>
  )
}

function FilaSesion({ sesion, tarjetas, alGuardar }: { sesion: Sesion; tarjetas: number; alGuardar: (m: string) => void }) {
  const [nombre, setNombre] = useState(sesion.nombre)
  useEffect(() => setNombre(sesion.nombre), [sesion.nombre])
  const guardarNombre = () => {
    if (!nombre.trim()) return setNombre(sesion.nombre)
    if (nombre.trim() !== sesion.nombre) void renombrarSesion(sesion.id, nombre)
  }
  const id = `sesion-${sesion.id}`
  return (
    <li className="sesion-fila" data-finalizada={sesion.finalizada || undefined}>
      <div className="campo">
        <label className="sr" htmlFor={id}>
          Nombre de {sesion.nombre}
        </label>
        <input
          id={id}
          value={nombre}
          maxLength={60}
          autoComplete="off"
          onChange={(e) => setNombre(e.target.value)}
          onBlur={guardarNombre}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              ;(e.target as HTMLInputElement).blur()
            }
          }}
        />
      </div>
      <span className="sesion-fila-cuenta">{tarjetas === 1 ? '1 tarjeta' : `${tarjetas} tarjetas`}</span>
      <label className="casilla">
        <input type="checkbox" checked={sesion.finalizada} onChange={(e) => void marcarFinalizada(sesion.id, e.target.checked)} />
        Finalizada
      </label>
      <BotonConfirmar
        className="boton boton-pequeno boton-peligro"
        etiqueta={<>Eliminar<span className="sr"> {sesion.nombre}</span></>}
        pregunta={`¿Eliminar la sesión «${sesion.nombre}»? Solo se borra la organización: las tarjetas, sus sonidos, archivos y retratos siguen en «Toda la biblioteca».`}
        opciones={[
          {
            etiqueta: 'Eliminar sesión',
            peligro: true,
            accion: () => {
              void eliminarSesion(sesion.id)
              alGuardar(`Sesión «${sesion.nombre}» eliminada. Sus tarjetas siguen en «Toda la biblioteca».`)
            },
          },
        ]}
      />
    </li>
  )
}
