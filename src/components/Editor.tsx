import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useReproduccion } from '../data/reproduccion'
import { gruposExistentes, useDatos } from '../data/store'
import type { Personaje } from '../data/types'
import { AYUDA_ENLACE, describirEnlace, interpretarEnlace } from '../lib/enlaces'
import { BotonConfirmar } from './Confirmar'

/** Ventana para añadir o editar un personaje. `personaje` vacío = nuevo. */
export function Editor({ personaje, alCerrar }: { personaje: Personaje | null; alCerrar: () => void }) {
  const crear = useDatos((s) => s.crear)
  const actualizar = useDatos((s) => s.actualizar)
  const eliminar = useDatos((s) => s.eliminar)
  const grupos = gruposExistentes(useDatos((s) => s.personajes))
  const { personajeId, detener, reproducir } = useReproduccion()

  const [nombre, setNombre] = useState(personaje?.nombre ?? '')
  const [enlace, setEnlace] = useState(personaje?.enlace ?? '')
  const [grupo, setGrupo] = useState(personaje?.grupo ?? '')
  const [nota, setNota] = useState(personaje?.nota ?? '')
  const [intentado, setIntentado] = useState(false)
  const dialogo = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const d = dialogo.current
    if (d && !d.open) d.showModal()
  }, [])

  const interpretado = enlace.trim() ? interpretarEnlace(enlace) : null
  const errorEnlace = typeof interpretado === 'string' ? interpretado : ''
  const errorNombre = intentado && !nombre.trim() ? 'Escribe el nombre del personaje.' : ''
  const deteccion = interpretado && typeof interpretado !== 'string' ? `Enlace correcto: ${describirEnlace(interpretado)}.` : ''

  const guardar = (e: FormEvent, escuchar = false) => {
    e.preventDefault()
    setIntentado(true)
    if (!nombre.trim() || errorEnlace) return
    const datos = { nombre: nombre.trim(), enlace: enlace.trim(), grupo: grupo.trim(), nota: nota.trim() }
    let id = personaje?.id
    if (id) actualizar(id, datos)
    else id = crear(datos)
    if (escuchar && datos.enlace) reproducir(id)
    alCerrar()
  }

  const borrar = () => {
    if (!personaje) return
    if (personajeId === personaje.id) detener()
    eliminar(personaje.id)
    alCerrar()
  }

  return (
    <dialog ref={dialogo} className="dialogo" onClose={alCerrar} aria-labelledby="editor-titulo">
      <form className="editor" onSubmit={guardar} noValidate>
        <h2 id="editor-titulo">{personaje ? 'Editar personaje' : 'Añadir personaje'}</h2>

        <div className="campo">
          <label htmlFor="ed-nombre">Nombre</label>
          <input
            id="ed-nombre"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            autoFocus={!personaje}
            autoComplete="off"
            aria-invalid={errorNombre ? true : undefined}
            aria-describedby={errorNombre ? 'ed-nombre-error' : undefined}
          />
          {errorNombre && (
            <p className="error" id="ed-nombre-error">
              {errorNombre}
            </p>
          )}
        </div>

        <div className="campo">
          <label htmlFor="ed-enlace">Enlace de la canción</label>
          <input
            id="ed-enlace"
            value={enlace}
            inputMode="url"
            autoComplete="off"
            placeholder="https://open.spotify.com/track/…"
            onChange={(e) => setEnlace(e.target.value)}
            aria-invalid={errorEnlace ? true : undefined}
            aria-describedby="ed-enlace-ayuda"
          />
          <p id="ed-enlace-ayuda" className={errorEnlace ? 'error' : deteccion ? 'deteccion' : 'ayuda'}>
            {errorEnlace || deteccion || AYUDA_ENLACE}
          </p>
        </div>

        <div className="editor-fila">
          <div className="campo">
            <label htmlFor="ed-grupo">Grupo (opcional)</label>
            <input id="ed-grupo" list="ed-grupos" value={grupo} placeholder="Taberna, Facción…" onChange={(e) => setGrupo(e.target.value)} />
            <datalist id="ed-grupos">
              {grupos.map((g) => (
                <option key={g} value={g} />
              ))}
            </datalist>
          </div>
          <div className="campo">
            <label htmlFor="ed-nota">Nota (opcional)</label>
            <input id="ed-nota" value={nota} placeholder="Cuándo suena" onChange={(e) => setNota(e.target.value)} />
          </div>
        </div>

        <div className="editor-acciones">
          <button type="submit" className="boton boton-principal">
            Guardar
          </button>
          {deteccion && (
            <button type="button" className="boton" onClick={(e) => guardar(e, true)}>
              Guardar y escuchar
            </button>
          )}
          <button type="button" className="boton boton-sutil" onClick={alCerrar}>
            Cancelar
          </button>
          {personaje && (
            <span className="editor-eliminar">
              <BotonConfirmar
                className="boton boton-peligro"
                etiqueta="Eliminar"
                pregunta={`¿Eliminar a «${personaje.nombre}»?`}
                opciones={[{ etiqueta: 'Eliminar', accion: borrar, peligro: true }]}
              />
            </span>
          )}
        </div>
      </form>
    </dialog>
  )
}
