import { useEffect, useRef, useState, type FormEvent } from 'react'
import { anadirSonido } from '../data/guardar'
import { tocar } from '../data/mezcla'
import { pistasDe, useDatos } from '../data/store'
import { CARPETAS, carpeta, type Tipo } from '../data/types'
import { AYUDA_ENLACE, describirEnlace, interpretarEnlace } from '../lib/enlaces'
import { tituloDe } from '../lib/titulo'
import { comprobarAudio } from '../lib/audioRemoto'
import { recordarCarpeta, ultimaCarpeta } from './editor/EditorElemento'

/**
 * Ventana para guardar un sonido a partir de un enlace: al compartirlo desde otra app (Android) o con «Pegar enlace».
 * Se añade a un elemento existente o a uno nuevo; «Guardar y reproducir» además lo hace sonar al momento.
 */
export function Compartido({
  enlaceInicial,
  textoInicial,
  pegado = false,
  alCerrar,
  alGuardar,
}: {
  enlaceInicial: string
  textoInicial: string
  /** Abierta con «Pegar enlace» (cambia el título de la ventana). */
  pegado?: boolean
  alCerrar: () => void
  alGuardar: (mensaje: string) => void
}) {
  const elementos = useDatos((s) => s.elementos)
  const [tipo, setTipo] = useState<Tipo>(ultimaCarpeta())
  const [destino, setDestino] = useState<string>('nuevo')
  const [nombre, setNombre] = useState('')
  const [enlace, setEnlace] = useState(enlaceInicial)
  const [titulo, setTitulo] = useState(textoInicial)
  const [etiqueta, setEtiqueta] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [comprobando, setComprobando] = useState(false)
  const [error, setError] = useState('')
  const dialogo = useRef<HTMLDialogElement>(null)
  const tituloTocado = useRef(!!textoInicial)

  const campoEnlace = useRef<HTMLInputElement>(null)
  useEffect(() => {
    const d = dialogo.current
    if (d && !d.open) d.showModal()
    // «Pegar enlace» sin nada útil en el portapapeles: el cursor va directo al campo del enlace.
    if (pegado && !enlaceInicial) campoEnlace.current?.focus()
  }, [pegado, enlaceInicial])

  const e = enlace.trim() ? interpretarEnlace(enlace) : null
  const errorEnlace = typeof e === 'string' ? e : ''
  useEffect(() => {
    if (!e || typeof e === 'string' || tituloTocado.current) return
    let vigente = true
    void tituloDe(e).then((t) => vigente && t && !tituloTocado.current && setTitulo(t))
    return () => {
      vigente = false
    }
  }, [e && typeof e !== 'string' ? e.web : ''])

  const deEstaCarpeta = elementos.filter((x) => x.tipo === tipo).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
  const nuevo = destino === 'nuevo' || !deEstaCarpeta.some((x) => x.id === destino)

  const guardar = async (ev: FormEvent) => {
    ev.preventDefault()
    const reproducir = (ev.nativeEvent as SubmitEvent).submitter?.getAttribute('data-reproducir') === 'si'
    if (!e || errorEnlace) return setError(errorEnlace || 'Falta el enlace.')
    if (nuevo && !nombre.trim()) return setError('Escribe el nombre o elige un elemento existente.')
    setGuardando(true)
    setError('')
    try {
      // Audio en internet: se comprueba antes de guardarlo (que exista, sea audio y su web lo permita).
      let duracion_ms: number | null = null
      if (typeof e !== 'string' && e.servicio === 'url') {
        setComprobando(true)
        try {
          duracion_ms = (await comprobarAudio(e.url)).duracion_ms
        } finally {
          setComprobando(false)
        }
      }
      const el = await anadirSonido({
        fuente: { tipo: 'enlace', enlace, duracion_ms },
        titulo,
        etiqueta,
        elementoId: nuevo ? undefined : destino,
        nuevo: nuevo ? { tipo, nombre } : undefined,
      })
      recordarCarpeta(el.tipo)
      alGuardar(`Sonido añadido a «${el.nombre}» (${carpeta(el.tipo).titulo}).`)
      alCerrar()
      // La pista recién añadida es la última del elemento.
      const nueva = pistasDe(useDatos.getState().pistas, el.id).at(-1)
      if (reproducir && nueva) tocar(nueva.id)
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : 'No se ha podido guardar.')
      setGuardando(false)
    }
  }

  return (
    <dialog ref={dialogo} className="dialogo" onClose={alCerrar} aria-labelledby="compartido-titulo">
      <form className="editor" onSubmit={guardar} noValidate>
        <h2 id="compartido-titulo">{pegado ? 'Añadir sonido desde un enlace' : 'Guardar sonido compartido'}</h2>

        <fieldset className="carpetas-opciones">
          <legend>Carpeta</legend>
          <div className="chips-carpeta">
            {CARPETAS.map((x) => (
              <label key={x.tipo} className="chip-carpeta">
                <input type="radio" name="co-tipo" value={x.tipo} checked={tipo === x.tipo} onChange={() => (setTipo(x.tipo), setDestino('nuevo'))} />
                <span>{x.singular}</span>
              </label>
            ))}
          </div>
        </fieldset>

        {deEstaCarpeta.length > 0 && (
          <div className="campo">
            <label htmlFor="co-destino">Añadir a</label>
            <select id="co-destino" value={nuevo ? 'nuevo' : destino} onChange={(ev) => setDestino(ev.target.value)}>
              <option value="nuevo">Nuevo {carpeta(tipo).singular.toLowerCase()}</option>
              {deEstaCarpeta.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.nombre}
                </option>
              ))}
            </select>
          </div>
        )}

        {nuevo && (
          <div className="campo">
            <label htmlFor="co-nombre">Nombre</label>
            <input id="co-nombre" value={nombre} maxLength={120} autoFocus={!(pegado && !enlaceInicial)} autoComplete="off" onChange={(ev) => setNombre(ev.target.value)} />
          </div>
        )}

        <div className="editor-fila">
          <div className="campo">
            <label htmlFor="co-titulo">Título del sonido</label>
            <input id="co-titulo" value={titulo} maxLength={200} onChange={(ev) => ((tituloTocado.current = true), setTitulo(ev.target.value))} />
          </div>
          <div className="campo">
            <label htmlFor="co-etiqueta">Etiqueta (opcional)</label>
            <input id="co-etiqueta" list="etiquetas-compartido" value={etiqueta} maxLength={60} placeholder="Tensión, combate…" onChange={(ev) => setEtiqueta(ev.target.value)} />
            <datalist id="etiquetas-compartido">
              {['Tema principal', 'Tensión', 'Combate', 'Calma', 'Misterio'].map((x) => (
                <option key={x} value={x} />
              ))}
            </datalist>
          </div>
        </div>

        <div className="campo">
          <label htmlFor="co-enlace">Enlace</label>
          <input id="co-enlace" ref={campoEnlace} value={enlace} inputMode="url" onChange={(ev) => setEnlace(ev.target.value)} aria-invalid={errorEnlace ? true : undefined} aria-describedby="co-enlace-ayuda" />
          <p id="co-enlace-ayuda" className={errorEnlace ? 'error' : e ? 'deteccion' : 'ayuda'}>
            {errorEnlace || (e && typeof e !== 'string' ? `Enlace correcto: ${describirEnlace(e)}.` : AYUDA_ENLACE)}
          </p>
        </div>

        {error && (
          <p className="aviso" role="alert">
            {error}
          </p>
        )}
        <div className="editor-acciones">
          <button type="submit" className="boton boton-principal" disabled={guardando} data-reproducir="si">
            {comprobando ? 'Comprobando el enlace…' : guardando ? 'Guardando…' : 'Guardar y reproducir'}
          </button>
          <button type="submit" className="boton" disabled={guardando}>
            Guardar
          </button>
          <button type="button" className="boton boton-sutil" onClick={alCerrar}>
            Cancelar
          </button>
        </div>
      </form>
    </dialog>
  )
}
