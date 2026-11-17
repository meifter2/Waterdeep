import { useEffect, useRef, useState, type FormEvent } from 'react'
import { anadirSonido } from '../data/guardar'
import { useDatos } from '../data/store'
import { CARPETAS, carpeta, type Tipo } from '../data/types'
import { AYUDA_ENLACE, describirEnlace, interpretarEnlace } from '../lib/enlaces'
import { tituloDe } from '../lib/titulo'
import { recordarCarpeta, ultimaCarpeta } from './editor/EditorElemento'

/** Ventana al compartir un sonido desde otra app: añadirlo a un elemento existente o a uno nuevo. */
export function Compartido({
  enlaceInicial,
  textoInicial,
  alCerrar,
  alGuardar,
}: {
  enlaceInicial: string
  textoInicial: string
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
  const [error, setError] = useState('')
  const dialogo = useRef<HTMLDialogElement>(null)
  const tituloTocado = useRef(!!textoInicial)

  useEffect(() => {
    const d = dialogo.current
    if (d && !d.open) d.showModal()
  }, [])

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
    if (!e || errorEnlace) return setError(errorEnlace || 'Falta el enlace.')
    if (nuevo && !nombre.trim()) return setError('Escribe el nombre o elige un elemento existente.')
    setGuardando(true)
    setError('')
    try {
      const el = await anadirSonido({
        fuente: { tipo: 'enlace', enlace },
        titulo,
        etiqueta,
        elementoId: nuevo ? undefined : destino,
        nuevo: nuevo ? { tipo, nombre } : undefined,
      })
      recordarCarpeta(el.tipo)
      alGuardar(`Sonido añadido a «${el.nombre}» (${carpeta(el.tipo).titulo}).`)
      alCerrar()
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : 'No se ha podido guardar.')
      setGuardando(false)
    }
  }

  return (
    <dialog ref={dialogo} className="dialogo" onClose={alCerrar} aria-labelledby="compartido-titulo">
      <form className="editor" onSubmit={guardar} noValidate>
        <h2 id="compartido-titulo">Guardar sonido compartido</h2>

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
            <input id="co-nombre" value={nombre} maxLength={120} autoFocus autoComplete="off" onChange={(ev) => setNombre(ev.target.value)} />
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
          <input id="co-enlace" value={enlace} inputMode="url" onChange={(ev) => setEnlace(ev.target.value)} aria-invalid={errorEnlace ? true : undefined} aria-describedby="co-enlace-ayuda" />
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
          <button type="submit" className="boton boton-principal" disabled={guardando}>
            {guardando ? 'Guardando…' : 'Guardar'}
          </button>
          <button type="button" className="boton boton-sutil" onClick={alCerrar}>
            Cancelar
          </button>
        </div>
      </form>
    </dialog>
  )
}
