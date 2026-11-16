import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useReproduccion } from '../data/reproduccion'
import { useDatos } from '../data/store'
import { CARPETAS, carpeta, type Cancion, type Tipo } from '../data/types'
import { AYUDA_ENLACE, describirEnlace, interpretarEnlace } from '../lib/enlaces'
import { BotonConfirmar } from './Confirmar'

/** Ventana para añadir o editar una canción. `cancion` null = nueva en la carpeta `tipoInicial`. */
export function Editor({ cancion, tipoInicial, alCerrar }: { cancion: Cancion | null; tipoInicial: Tipo; alCerrar: () => void }) {
  const crear = useDatos((s) => s.crear)
  const actualizar = useDatos((s) => s.actualizar)
  const eliminar = useDatos((s) => s.eliminar)
  const { cancionId, detener, reproducir } = useReproduccion()

  const [tipo, setTipo] = useState<Tipo>(cancion?.tipo ?? tipoInicial)
  const [nombre, setNombre] = useState(cancion?.nombre ?? '')
  const [enlace, setEnlace] = useState(cancion?.enlace ?? '')
  const [nota, setNota] = useState(cancion?.nota ?? '')
  const [intentado, setIntentado] = useState(false)
  const dialogo = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const d = dialogo.current
    if (d && !d.open) d.showModal()
  }, [])

  const interpretado = enlace.trim() ? interpretarEnlace(enlace) : null
  const errorEnlace = typeof interpretado === 'string' ? interpretado : ''
  const errorNombre = intentado && !nombre.trim() ? 'Escribe un nombre.' : ''
  const deteccion = interpretado && typeof interpretado !== 'string' ? `Enlace correcto: ${describirEnlace(interpretado)}.` : ''

  const guardar = async (e: FormEvent, escuchar = false) => {
    e.preventDefault()
    setIntentado(true)
    if (!nombre.trim() || errorEnlace) return
    const datos = { tipo, nombre: nombre.trim(), enlace: enlace.trim(), nota: nota.trim() }
    alCerrar()
    let id: string | null | undefined = cancion?.id
    if (id) await actualizar(id, datos)
    else id = await crear(datos)
    if (escuchar && id && datos.enlace) reproducir(id)
  }

  const borrar = () => {
    if (!cancion) return
    if (cancionId === cancion.id) detener()
    alCerrar()
    void eliminar(cancion.id)
  }

  return (
    <dialog ref={dialogo} className="dialogo" onClose={alCerrar} aria-labelledby="editor-titulo">
      <form className="editor" onSubmit={guardar} noValidate>
        <h2 id="editor-titulo">{cancion ? 'Editar canción' : carpeta(tipo).nuevo}</h2>

        <div className="editor-fila">
          <div className="campo">
            <label htmlFor="ed-nombre">Nombre</label>
            <input
              id="ed-nombre"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              autoFocus={!cancion}
              autoComplete="off"
              maxLength={120}
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
            <label htmlFor="ed-tipo">Carpeta</label>
            <select id="ed-tipo" value={tipo} onChange={(e) => setTipo(e.target.value as Tipo)}>
              {CARPETAS.map((c) => (
                <option key={c.tipo} value={c.tipo}>
                  {c.titulo}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="campo">
          <label htmlFor="ed-enlace">Enlace de la canción</label>
          <input
            id="ed-enlace"
            value={enlace}
            inputMode="url"
            autoComplete="off"
            maxLength={500}
            placeholder="https://open.spotify.com/track/…"
            onChange={(e) => setEnlace(e.target.value)}
            aria-invalid={errorEnlace ? true : undefined}
            aria-describedby="ed-enlace-ayuda"
          />
          <p id="ed-enlace-ayuda" className={errorEnlace ? 'error' : deteccion ? 'deteccion' : 'ayuda'}>
            {errorEnlace || deteccion || AYUDA_ENLACE}
          </p>
        </div>

        <div className="campo">
          <label htmlFor="ed-nota">Nota (opcional)</label>
          <input id="ed-nota" value={nota} maxLength={300} placeholder="Cuándo suena" onChange={(e) => setNota(e.target.value)} />
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
          {cancion && (
            <span className="editor-eliminar">
              <BotonConfirmar
                className="boton boton-peligro"
                etiqueta="Eliminar"
                pregunta={`¿Eliminar «${cancion.nombre}»?`}
                opciones={[{ etiqueta: 'Eliminar', accion: borrar, peligro: true }]}
              />
            </span>
          )}
        </div>
      </form>
    </dialog>
  )
}
