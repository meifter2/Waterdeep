import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useReproduccion } from '../data/reproduccion'
import { useDatos } from '../data/store'
import { CARPETAS, carpeta, type Cancion, type Tipo } from '../data/types'
import { almacenamientoSeguro } from '../data/storage'
import { AYUDA_ENLACE, describirEnlace, interpretarEnlace } from '../lib/enlaces'
import { tituloDe } from '../lib/titulo'
import { BotonConfirmar } from './Confirmar'

const CLAVE_ULTIMA = 'banda-sonora:ultima-carpeta'

/** Última carpeta usada al guardar (para proponerla al compartir). */
export function ultimaCarpeta(): Tipo {
  const t = almacenamientoSeguro.getItem(CLAVE_ULTIMA) as Tipo | null
  return t && CARPETAS.some((c) => c.tipo === t) ? t : 'personaje'
}

export interface Inicial {
  enlace?: string
  nota?: string
  compartida?: boolean
}

/** Ventana para añadir o editar una canción. `cancion` null = nueva en la carpeta `tipoInicial`. */
export function Editor({
  cancion,
  tipoInicial,
  inicial,
  alCerrar,
  alGuardar,
}: {
  cancion: Cancion | null
  tipoInicial: Tipo
  inicial?: Inicial
  alCerrar: () => void
  alGuardar?: (mensaje: string) => void
}) {
  const crear = useDatos((s) => s.crear)
  const actualizar = useDatos((s) => s.actualizar)
  const eliminar = useDatos((s) => s.eliminar)
  const { cancionId, detener, reproducir } = useReproduccion()

  const [tipo, setTipo] = useState<Tipo>(cancion?.tipo ?? tipoInicial)
  const [nombre, setNombre] = useState(cancion?.nombre ?? '')
  const [enlace, setEnlace] = useState(cancion?.enlace ?? inicial?.enlace ?? '')
  const [nota, setNota] = useState(cancion?.nota ?? inicial?.nota ?? '')
  const notaTocada = useRef(false)
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

  // Canción nueva con enlace válido y sin nota: se propone el título real de la canción.
  const webValida = interpretado && typeof interpretado !== 'string' ? interpretado.web : ''
  useEffect(() => {
    if (cancion || !webValida || notaTocada.current) return
    const e = interpretarEnlace(webValida)
    if (typeof e === 'string') return
    let vigente = true
    void tituloDe(e).then((t) => {
      if (vigente && t && !notaTocada.current) setNota((n) => n || t)
    })
    return () => {
      vigente = false
    }
  }, [webValida, cancion])

  const guardar = async (e: FormEvent, escuchar = false) => {
    e.preventDefault()
    setIntentado(true)
    if (!nombre.trim() || errorEnlace) return
    const datos = { tipo, nombre: nombre.trim(), enlace: enlace.trim(), nota: nota.trim() }
    alCerrar()
    almacenamientoSeguro.setItem(CLAVE_ULTIMA, tipo)
    let id: string | null | undefined = cancion?.id
    if (id) await actualizar(id, datos)
    else id = await crear(datos)
    if (id) alGuardar?.(`«${datos.nombre}» guardada en ${carpeta(tipo).titulo}.`)
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
        <h2 id="editor-titulo">{cancion ? 'Editar canción' : inicial?.compartida ? 'Guardar canción compartida' : carpeta(tipo).nuevo}</h2>

        <fieldset className="carpetas-opciones">
          <legend>Carpeta</legend>
          <div className="chips-carpeta">
            {CARPETAS.map((c) => (
              <label key={c.tipo} className="chip-carpeta">
                <input type="radio" name="ed-tipo" value={c.tipo} checked={tipo === c.tipo} onChange={() => setTipo(c.tipo)} />
                <span>{c.singular}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <div className="campo">
            <label htmlFor="ed-nombre">{tipo === 'personaje' ? 'Nombre del personaje' : tipo === 'lugar' ? 'Nombre del lugar' : 'Nombre'}</label>
            <input
              id="ed-nombre"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              autoFocus={!cancion}
              placeholder={tipo === 'personaje' ? 'Capitana Idris' : tipo === 'lugar' ? 'Taberna del Ancla' : tipo === 'momento' ? 'Persecución por los tejados' : 'Sesión 1'}
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
          <input id="ed-nota" value={nota} maxLength={300} placeholder="Cuándo suena" onChange={(e) => {
              notaTocada.current = true
              setNota(e.target.value)
            }} />
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
