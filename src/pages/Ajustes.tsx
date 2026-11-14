import { useRef, useState, type ChangeEvent } from 'react'
import { BotonConfirmar } from '../components/Confirmar'
import { datosDemo } from '../data/demo'
import { datosVacios, extraerDatos, useDatos, validarImportacion } from '../data/store'
import { almacenamientoDisponible } from '../data/storage'
import { enMarco, useUI, type Tema } from '../data/ui'
import type { Datos } from '../data/types'

type Mensaje = { tipo: 'ok' | 'error'; texto: string } | null

export function Ajustes() {
  const reemplazarTodo = useDatos((s) => s.reemplazarTodo)
  const tema = useUI((s) => s.tema)
  const cambiarTema = useUI((s) => s.cambiarTema)
  const [mensaje, setMensaje] = useState<Mensaje>(null)
  const [pendiente, setPendiente] = useState<Datos | null>(null)
  const [pegado, setPegado] = useState('')
  const archivo = useRef<HTMLInputElement>(null)

  const copiaJson = () => JSON.stringify(extraerDatos(useDatos.getState()), null, 2)

  const descargar = () => {
    const datos = extraerDatos(useDatos.getState())
    const url = URL.createObjectURL(new Blob([copiaJson()], { type: 'application/json' }))
    const a = document.createElement('a')
    const fecha = new Date().toISOString().slice(0, 10)
    a.href = url
    a.download = `mesa-${(datos.campana.nombre || 'campana').toLowerCase().replace(/[^a-z0-9áéíóúñü]+/gi, '-')}-${fecha}.json`
    a.click()
    URL.revokeObjectURL(url)
    setMensaje({ tipo: 'ok', texto: 'Copia descargada. Guárdala en un lugar seguro: contiene tus secretos.' })
  }

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(copiaJson())
      setMensaje({ tipo: 'ok', texto: 'Copia copiada al portapapeles. Pégala en un archivo de texto y guárdalo.' })
    } catch {
      setMensaje({ tipo: 'error', texto: 'El navegador no deja copiar al portapapeles. Usa «Descargar copia».' })
    }
  }

  const preparar = (texto: string) => {
    const resultado = validarImportacion(texto)
    if (typeof resultado === 'string') {
      setMensaje({ tipo: 'error', texto: resultado })
      setPendiente(null)
      return
    }
    setMensaje(null)
    setPendiente(resultado)
  }

  const leerArchivo = async (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (f) preparar(await f.text())
  }

  const aplicar = () => {
    if (!pendiente) return
    reemplazarTodo(pendiente)
    setPendiente(null)
    setPegado('')
    setMensaje({ tipo: 'ok', texto: 'Copia importada.' })
  }

  return (
    <div className="ajustes">
      <h1>Ajustes</h1>

      {mensaje && (
        <p className={mensaje.tipo === 'ok' ? 'aviso aviso-ok' : 'aviso'} role="status">
          {mensaje.texto}
        </p>
      )}

      <section className="panel" aria-labelledby="a-tema">
        <h2 id="a-tema">Apariencia</h2>
        <div className="segmentado" role="group" aria-labelledby="a-tema">
          {(
            [
              ['auto', 'Como el sistema'],
              ['claro', 'Claro'],
              ['oscuro', 'Oscuro'],
            ] as [Tema, string][]
          ).map(([t, etiqueta]) => (
            <button key={t} type="button" aria-pressed={tema === t} onClick={() => cambiarTema(t)}>
              {etiqueta}
            </button>
          ))}
        </div>
      </section>

      <section className="panel" aria-labelledby="a-copias">
        <h2 id="a-copias">Copias de seguridad</h2>
        <p>
          {almacenamientoDisponible
            ? 'Tus datos se guardan solo en este navegador. Haz una copia de vez en cuando o antes de cambiar de dispositivo.'
            : 'Este navegador no permite guardar datos: haz una copia antes de cerrar la pestaña.'}
        </p>
        <div className="acciones">
          {!enMarco && (
            <button type="button" className="boton boton-principal" onClick={descargar}>
              Descargar copia
            </button>
          )}
          <button type="button" className={enMarco ? 'boton boton-principal' : 'boton'} onClick={copiar}>
            Copiar copia al portapapeles
          </button>
        </div>

        <h3 className="subtitulo">Recuperar una copia</h3>
        <div className="acciones">
          <button type="button" className="boton" onClick={() => archivo.current?.click()}>
            Elegir archivo
          </button>
          <input ref={archivo} type="file" accept="application/json,.json" hidden onChange={leerArchivo} />
        </div>
        <div className="campo">
          <label htmlFor="pegar-copia">O pega aquí el texto de una copia</label>
          <textarea id="pegar-copia" rows={3} value={pegado} onChange={(e) => setPegado(e.target.value)} />
        </div>
        {pegado.trim() && !pendiente && (
          <div className="acciones">
            <button type="button" className="boton" onClick={() => preparar(pegado)}>
              Comprobar copia
            </button>
          </div>
        )}
        {pendiente && (
          <div className="confirmar" role="alertdialog" aria-label="Confirmar importación">
            <p>
              Copia válida de «{pendiente.campana.nombre}»: {pendiente.pnj.length} PNJ, {pendiente.pistas.length} pistas,{' '}
              {pendiente.sesiones.length} sesiones. Sustituirá todos los datos actuales.
            </p>
            <div className="confirmar-botones">
              <button type="button" className="boton boton-peligro-lleno" onClick={aplicar}>
                Sustituir datos
              </button>
              <button type="button" className="boton boton-sutil" onClick={() => setPendiente(null)}>
                Cancelar
              </button>
            </div>
          </div>
        )}
      </section>

      <section className="panel" aria-labelledby="a-privacidad">
        <h2 id="a-privacidad">Privacidad de los secretos</h2>
        <p>
          La vista de jugadores solo muestra los campos marcados como públicos de las fichas visibles. Los bloques sellados nunca
          aparecen en ella.
        </p>
        <p>
          En esta versión beta todo vive en tu navegador: si compartes pantalla, comparte solo la ventana de la vista de
          jugadores. Para que cada jugador la abra en su propio móvil hará falta la versión con servidor.
        </p>
      </section>

      <section className="panel" aria-labelledby="a-datos">
        <h2 id="a-datos">Datos de la campaña</h2>
        <div className="acciones">
          <BotonConfirmar
            etiqueta="Cargar campaña de ejemplo"
            pregunta="La campaña de ejemplo sustituirá todos los datos actuales."
            opciones={[
              {
                etiqueta: 'Cargar ejemplo',
                peligro: true,
                accion: () => {
                  reemplazarTodo(datosDemo())
                  setMensaje({ tipo: 'ok', texto: 'Campaña de ejemplo cargada.' })
                },
              },
            ]}
          />
          <BotonConfirmar
            className="boton boton-peligro"
            etiqueta="Borrar todos los datos"
            pregunta="Se borrará toda la campaña de este navegador. No se puede deshacer."
            opciones={[
              {
                etiqueta: 'Borrar todo',
                peligro: true,
                accion: () => {
                  reemplazarTodo(datosVacios())
                  setMensaje({ tipo: 'ok', texto: 'Datos borrados.' })
                },
              },
            ]}
          />
        </div>
      </section>
    </div>
  )
}
