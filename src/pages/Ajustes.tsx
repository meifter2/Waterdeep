import { useRef, useState, type ChangeEvent } from 'react'
import { datosDemo } from '../data/demo'
import { datosVacios, extraerDatos, useDatos, validarImportacion } from '../data/store'
import { almacenamientoDisponible } from '../data/storage'
import { useUI, type Tema } from '../data/ui'

export function Ajustes() {
  const reemplazarTodo = useDatos((s) => s.reemplazarTodo)
  const tema = useUI((s) => s.tema)
  const cambiarTema = useUI((s) => s.cambiarTema)
  const [mensaje, setMensaje] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null)
  const archivo = useRef<HTMLInputElement>(null)

  const exportar = () => {
    const datos = extraerDatos(useDatos.getState())
    const blob = new Blob([JSON.stringify(datos, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    const fecha = new Date().toISOString().slice(0, 10)
    a.href = url
    a.download = `mesa-${(datos.campana.nombre || 'campana').toLowerCase().replace(/[^a-z0-9áéíóúñü]+/gi, '-')}-${fecha}.json`
    a.click()
    URL.revokeObjectURL(url)
    setMensaje({ tipo: 'ok', texto: 'Copia exportada. Guárdala en un lugar seguro: contiene tus secretos.' })
  }

  const importar = async (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    const resultado = validarImportacion(await f.text())
    if (typeof resultado === 'string') {
      setMensaje({ tipo: 'error', texto: resultado })
      return
    }
    if (!window.confirm('La copia sustituirá todos los datos actuales. ¿Continuar?')) return
    reemplazarTodo(resultado)
    setMensaje({ tipo: 'ok', texto: 'Copia importada.' })
  }

  const cargarDemo = () => {
    if (!window.confirm('La campaña de ejemplo sustituirá todos los datos actuales. ¿Continuar?')) return
    reemplazarTodo(datosDemo())
    setMensaje({ tipo: 'ok', texto: 'Campaña de ejemplo cargada.' })
  }

  const borrarTodo = () => {
    if (!window.confirm('Se borrarán todos los datos de la campaña en este navegador. No se puede deshacer. ¿Continuar?')) return
    reemplazarTodo(datosVacios())
    setMensaje({ tipo: 'ok', texto: 'Datos borrados.' })
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
            ? 'Tus datos se guardan solo en este navegador. Exporta una copia de vez en cuando o antes de cambiar de dispositivo.'
            : 'Este navegador no permite guardar datos: exporta una copia antes de cerrar la pestaña.'}
        </p>
        <div className="acciones">
          <button type="button" className="boton boton-principal" onClick={exportar}>
            Exportar copia
          </button>
          <button type="button" className="boton" onClick={() => archivo.current?.click()}>
            Importar copia
          </button>
          <input ref={archivo} type="file" accept="application/json,.json" hidden onChange={importar} />
        </div>
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

      <section className="panel panel-peligro" aria-labelledby="a-datos">
        <h2 id="a-datos">Datos de la campaña</h2>
        <div className="acciones">
          <button type="button" className="boton" onClick={cargarDemo}>
            Cargar campaña de ejemplo
          </button>
          <button type="button" className="boton boton-peligro" onClick={borrarTodo}>
            Borrar todos los datos
          </button>
        </div>
      </section>
    </div>
  )
}
