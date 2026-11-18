import { useEffect, useRef, useState, type FormEvent } from 'react'
import { guardarElemento, type CambioRetrato } from '../../data/guardar'
import { useReproduccion } from '../../data/reproduccion'
import { almacenamientoSeguro } from '../../data/storage'
import { pistasDe, useDatos } from '../../data/store'
import { CARPETAS, carpeta, type Elemento, type Recurso, type Tipo } from '../../data/types'
import { ErrorArchivo, prepararRetrato } from '../../lib/archivos'
import { interpretarEnlace } from '../../lib/enlaces'
import { nuevoId } from '../../lib/id'
import { BotonConfirmar } from '../Confirmar'
import { AnadirPista, type Anadido } from './AnadirPista'
import { FilaPista, ListaEtiquetas, detalleRecurso, tramoInvalido, type FilaBorrador } from './FilaPista'

const CLAVE_ULTIMA = 'banda-sonora:ultima-carpeta'

export const recordarCarpeta = (t: Tipo) => almacenamientoSeguro.setItem(CLAVE_ULTIMA, t)

/** Última carpeta usada al guardar (para proponerla al compartir). */
export function ultimaCarpeta(): Tipo {
  const t = almacenamientoSeguro.getItem(CLAVE_ULTIMA) as Tipo | null
  return t && CARPETAS.some((c) => c.tipo === t) ? t : 'personaje'
}

function admiteTramo(r: Pick<Recurso, 'origen' | 'enlace'>): boolean {
  if (r.origen === 'archivo' || r.origen === 'url') return true
  const e = interpretarEnlace(r.enlace)
  if (typeof e === 'string') return false
  if (e.servicio === 'url') return true
  return e.servicio === 'spotify' ? e.tipo === 'track' || e.tipo === 'episode' : !!e.videoId
}

function filaDesdeRecurso(r: Recurso, extra: Partial<FilaBorrador> = {}): FilaBorrador {
  return {
    clave: nuevoId(),
    recursoId: r.id,
    titulo: r.titulo,
    etiqueta: '',
    inicio_ms: null,
    fin_ms: null,
    bucle: false,
    origen: r.origen,
    admiteTramo: admiteTramo(r),
    detalle: detalleRecurso(r),
    ...extra,
  }
}

/** Ventana para crear o editar un elemento con su retrato y sus pistas. */
export function EditorElemento({
  elemento,
  tipoInicial,
  alCerrar,
  alGuardar,
}: {
  elemento: Elemento | null
  tipoInicial: Tipo
  alCerrar: () => void
  alGuardar: (mensaje: string) => void
}) {
  const { recursos, pistas, urls, eliminarElemento } = useDatos()
  const { pistaId, olvidar } = useReproduccion()
  const [tipo, setTipo] = useState<Tipo>(elemento?.tipo ?? tipoInicial)
  const [nombre, setNombre] = useState(elemento?.nombre ?? '')
  const [descripcion, setDescripcion] = useState(elemento?.descripcion ?? '')
  const [retrato, setRetrato] = useState<CambioRetrato>({ accion: 'mantener' })
  const [vistaRetrato, setVistaRetrato] = useState<string | null>(elemento?.retrato_ruta ? (urls[elemento.retrato_ruta] ?? null) : null)
  const [filas, setFilas] = useState<FilaBorrador[]>(() =>
    elemento
      ? pistasDe(pistas, elemento.id).flatMap((p) => {
          const r = recursos.find((x) => x.id === p.recurso_id)
          return r ? [filaDesdeRecurso(r, { id: p.id, clave: p.id, etiqueta: p.etiqueta, inicio_ms: p.inicio_ms, fin_ms: p.fin_ms, bucle: p.bucle })] : []
        })
      : [],
  )
  const [intentado, setIntentado] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')
  const dialogo = useRef<HTMLDialogElement>(null)
  const archivoRetrato = useRef<HTMLInputElement>(null)
  // Si un guardado falla a mitad, el reintento actualiza lo ya creado (no duplica).
  const progreso = useRef<{ elementoId?: string }>({})

  useEffect(() => {
    const d = dialogo.current
    if (d && !d.open) d.showModal()
  }, [])

  const c = carpeta(tipo)
  const errorNombre = intentado && !nombre.trim() ? 'Escribe un nombre.' : ''
  const hayErroresTramo = filas.some((f) => tramoInvalido(f))
  const subeArchivos = filas.some((f) => f.nueva?.tipo === 'archivo')

  const anadir = (a: Anadido) => {
    const base = { etiqueta: filas.length === 0 ? c.etiqueta : '', bucle: c.bucle }
    if ('recurso' in a) setFilas((l) => [...l, filaDesdeRecurso(a.recurso, base)])
    else {
      const origen = a.nueva.tipo === 'archivo' ? 'archivo' : (interpretarEnlace(a.nueva.enlace) as { servicio: 'spotify' | 'youtube' | 'url' }).servicio
      const enlace = a.nueva.tipo === 'enlace' ? a.nueva.enlace : ''
      setFilas((l) => [
        ...l,
        {
          clave: nuevoId(),
          nueva: a.nueva,
          titulo: a.titulo,
          inicio_ms: null,
          fin_ms: null,
          origen,
          admiteTramo: admiteTramo({ origen, enlace }),
          detalle: a.nueva.tipo === 'archivo' ? `${a.nueva.archivo.name}, se subirá al guardar` : '',
          ...base,
        },
      ])
    }
  }

  const cambiar = (clave: string, cambios: Partial<FilaBorrador>) => setFilas((l) => l.map((f) => (f.clave === clave ? { ...f, ...cambios } : f)))
  const mover = (i: number, d: -1 | 1) =>
    setFilas((l) => {
      const n = [...l]
      ;[n[i], n[i + d]] = [n[i + d], n[i]]
      return n
    })

  const elegirRetrato = async (f: File | undefined) => {
    if (!f) return
    try {
      const imagen = await prepararRetrato(f)
      setRetrato({ accion: 'nuevo', imagen })
      setVistaRetrato(URL.createObjectURL(imagen))
      setError('')
    } catch (e) {
      setError(e instanceof ErrorArchivo ? e.message : 'No se ha podido leer la imagen.')
    }
  }

  const guardar = async (e: FormEvent) => {
    e.preventDefault()
    setIntentado(true)
    if (!nombre.trim() || hayErroresTramo || guardando) return
    setGuardando(true)
    setError('')
    try {
      await guardarElemento({ id: elemento?.id, tipo, nombre, descripcion, retrato, pistas: filas }, progreso.current)
      recordarCarpeta(tipo)
      alGuardar(`«${nombre.trim()}» guardado en ${c.titulo}.`)
      alCerrar()
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : 'No se ha podido guardar. Inténtalo de nuevo.')
      setGuardando(false)
    }
  }

  const borrar = () => {
    if (!elemento) return
    if (pistas.some((p) => p.id === pistaId && p.elemento_id === elemento.id)) olvidar()
    alCerrar()
    void eliminarElemento(elemento.id)
  }

  return (
    <dialog ref={dialogo} className="dialogo dialogo-ancho" onClose={alCerrar} onCancel={(e) => guardando && e.preventDefault()} aria-labelledby="editor-titulo">
      <form className="editor" onSubmit={guardar} noValidate>
        <h2 id="editor-titulo">{elemento ? `Editar ${elemento.nombre}` : c.nuevo}</h2>

        <fieldset className="carpetas-opciones">
          <legend>Carpeta</legend>
          <div className="chips-carpeta">
            {CARPETAS.map((x) => (
              <label key={x.tipo} className="chip-carpeta">
                <input type="radio" name="ed-tipo" value={x.tipo} checked={tipo === x.tipo} onChange={() => setTipo(x.tipo)} />
                <span>{x.singular}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <div className="editor-identidad">
          <div className="editor-retrato">
            <button
              type="button"
              className="retrato-grande"
              onClick={() => archivoRetrato.current?.click()}
              aria-label={vistaRetrato ? 'Cambiar retrato' : 'Añadir retrato'}
            >
              {vistaRetrato ? <img src={vistaRetrato} alt="" /> : <span>{(nombre.trim()[0] ?? '+').toUpperCase()}</span>}
            </button>
            <input ref={archivoRetrato} type="file" accept="image/*" hidden aria-label="Imagen del retrato" onChange={(e) => void elegirRetrato(e.target.files?.[0])} />
            {vistaRetrato ? (
              <button
                type="button"
                className="enlace"
                onClick={() => {
                  setRetrato({ accion: elemento?.retrato_ruta ? 'quitar' : 'mantener' })
                  setVistaRetrato(null)
                }}
              >
                Quitar retrato
              </button>
            ) : (
              <span className="ayuda">Retrato opcional</span>
            )}
          </div>
          <div className="editor-textos">
            <div className="campo">
              <label htmlFor="ed-nombre">Nombre</label>
              <input
                id="ed-nombre"
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                autoFocus={!elemento}
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
              <label htmlFor="ed-descripcion">Descripción (opcional)</label>
              <input id="ed-descripcion" value={descripcion} maxLength={500} placeholder="Quién es o cuándo suena" onChange={(e) => setDescripcion(e.target.value)} />
            </div>
          </div>
        </div>

        <section className="editor-pistas" aria-labelledby="ed-pistas">
          <h3 id="ed-pistas">Sonidos {filas.length > 0 && <span className="seccion-cuenta">{filas.length}</span>}</h3>
          {filas.length > 0 ? (
            <ol className="filas-pista">
              {filas.map((f, i) => (
                <FilaPista
                  key={f.clave}
                  fila={f}
                  indice={i}
                  total={filas.length}
                  alCambiar={(cambios) => cambiar(f.clave, cambios)}
                  alMover={(d) => mover(i, d)}
                  alQuitar={() => setFilas((l) => l.filter((x) => x.clave !== f.clave))}
                />
              ))}
            </ol>
          ) : (
            <p className="ayuda-normal">Añade uno o varios sonidos: tema principal, tensión, combate…</p>
          )}
          <ListaEtiquetas />
          <AnadirPista alAnadir={anadir} />
          {filas.some((f) => f.id) && <p className="ayuda">Quitar una pista no borra el sonido: sigue en tu biblioteca.</p>}
        </section>

        {error && (
          <p className="aviso" role="alert">
            {error}
          </p>
        )}

        <div className="editor-acciones">
          <button type="submit" className="boton boton-principal" disabled={guardando}>
            {guardando ? (subeArchivos ? 'Subiendo y guardando…' : 'Guardando…') : 'Guardar'}
          </button>
          <button type="button" className="boton boton-sutil" onClick={alCerrar} disabled={guardando}>
            Cancelar
          </button>
          {elemento && (
            <span className="editor-eliminar">
              <BotonConfirmar
                className="boton boton-peligro"
                etiqueta={`Eliminar ${c.singular.toLowerCase()}`}
                pregunta={`¿Eliminar «${elemento.nombre}»? Sus sonidos seguirán en la biblioteca.`}
                opciones={[{ etiqueta: 'Eliminar', accion: borrar, peligro: true }]}
              />
            </span>
          )}
        </div>
      </form>
    </dialog>
  )
}
