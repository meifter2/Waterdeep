import { useEffect, useRef, useState } from 'react'
import { exportar, useDatos, validarImportacion } from '../data/store'
import type { DatosCancion } from '../data/types'
import { modoLocal } from '../lib/supabase'

/** Ventana de copias: exportar las canciones y añadir las de una copia. */
export function Copias({ alCerrar }: { alCerrar: () => void }) {
  const importar = useDatos((s) => s.importar)
  const total = useDatos((s) => s.canciones.length)
  const [mensaje, setMensaje] = useState<{ ok: boolean; texto: string } | null>(null)
  const [pegado, setPegado] = useState('')
  const [pendiente, setPendiente] = useState<DatosCancion[] | null>(null)
  const [importando, setImportando] = useState(false)
  const dialogo = useRef<HTMLDialogElement>(null)
  const archivo = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const d = dialogo.current
    if (d && !d.open) d.showModal()
  }, [])

  const json = () => exportar(useDatos.getState().canciones)

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(json())
      setMensaje({ ok: true, texto: 'Copia en el portapapeles. Pégala en una nota o un archivo para guardarla.' })
    } catch {
      setMensaje({ ok: false, texto: 'El navegador no deja copiar. Usa «Descargar archivo».' })
    }
  }

  const descargar = () => {
    const url = URL.createObjectURL(new Blob([json()], { type: 'application/json' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `dfy-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
    setMensaje({ ok: true, texto: 'Archivo descargado.' })
  }

  const comprobar = (texto: string) => {
    const r = validarImportacion(texto)
    if (typeof r === 'string') {
      setMensaje({ ok: false, texto: r })
      setPendiente(null)
    } else {
      setMensaje(null)
      setPendiente(r)
    }
  }

  const anadir = async () => {
    if (!pendiente) return
    setImportando(true)
    const n = await importar(pendiente)
    setImportando(false)
    setPendiente(null)
    setPegado('')
    setMensaje(
      n === pendiente.length
        ? { ok: true, texto: `${n} canciones añadidas.` }
        : { ok: false, texto: `Se añadieron ${n} de ${pendiente.length}. Revisa la conexión y vuelve a intentarlo con el resto.` },
    )
  }

  return (
    <dialog ref={dialogo} className="dialogo" onClose={alCerrar} aria-labelledby="copias-titulo">
      <div className="copias">
        <h2 id="copias-titulo">Copias</h2>
        <p className="ayuda-normal">
          {modoLocal
            ? `Tus ${total} canciones se guardan solo en este navegador. Haz una copia para no perderlas.`
            : `Tus ${total} canciones están guardadas en tu cuenta. Una copia sirve para tenerlas también fuera de ella.`}
        </p>

        {mensaje && (
          <p className={mensaje.ok ? 'aviso aviso-ok' : 'aviso'} role="status">
            {mensaje.texto}
          </p>
        )}

        <div className="acciones">
          <button type="button" className="boton boton-principal" onClick={copiar}>
            Copiar al portapapeles
          </button>
          <button type="button" className="boton" onClick={descargar}>
            Descargar archivo
          </button>
        </div>

        <h3>Añadir canciones desde una copia</h3>
        <div className="campo">
          <label htmlFor="pegar-copia">Pega aquí el texto de una copia</label>
          <textarea id="pegar-copia" rows={3} value={pegado} onChange={(e) => setPegado(e.target.value)} />
        </div>
        <div className="acciones">
          <button type="button" className="boton" disabled={!pegado.trim()} onClick={() => comprobar(pegado)}>
            Comprobar texto
          </button>
          <button type="button" className="boton" onClick={() => archivo.current?.click()}>
            Elegir archivo
          </button>
          <input
            ref={archivo}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={async (e) => {
              const f = e.target.files?.[0]
              e.target.value = ''
              if (f) comprobar(await f.text())
            }}
          />
        </div>

        {pendiente && (
          <div className="confirmar" role="alertdialog" aria-label="Confirmar">
            <p>La copia tiene {pendiente.length} canciones. Se añadirán a las que ya tienes.</p>
            <div className="confirmar-botones">
              <button type="button" className="boton boton-principal" disabled={importando} onClick={anadir}>
                {importando ? 'Añadiendo…' : 'Añadir canciones'}
              </button>
              <button type="button" className="boton boton-sutil" onClick={() => setPendiente(null)}>
                Cancelar
              </button>
            </div>
          </div>
        )}

        <div className="editor-acciones">
          <button type="button" className="boton" onClick={alCerrar}>
            Cerrar
          </button>
        </div>
      </div>
    </dialog>
  )
}
