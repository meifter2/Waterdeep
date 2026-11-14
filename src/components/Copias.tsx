import { useEffect, useRef, useState } from 'react'
import { extraerDatos, useDatos, validarImportacion } from '../data/store'
import type { Datos } from '../data/types'

/** Ventana de copias de seguridad: copiar, descargar y recuperar. */
export function Copias({ alCerrar }: { alCerrar: () => void }) {
  const reemplazarTodo = useDatos((s) => s.reemplazarTodo)
  const total = useDatos((s) => s.personajes.length)
  const [mensaje, setMensaje] = useState<{ ok: boolean; texto: string } | null>(null)
  const [pegado, setPegado] = useState('')
  const [pendiente, setPendiente] = useState<Datos | null>(null)
  const dialogo = useRef<HTMLDialogElement>(null)
  const archivo = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const d = dialogo.current
    if (d && !d.open) d.showModal()
  }, [])

  const json = () => JSON.stringify(extraerDatos(useDatos.getState()), null, 2)

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
    a.download = `banda-sonora-${new Date().toISOString().slice(0, 10)}.json`
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

  return (
    <dialog ref={dialogo} className="dialogo" onClose={alCerrar} aria-labelledby="copias-titulo">
      <div className="copias">
        <h2 id="copias-titulo">Copias de seguridad</h2>
        <p className="ayuda-normal">
          Tus {total} personajes se guardan solo en este navegador. Haz una copia para no perderlos o para pasarlos a otro
          dispositivo.
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

        <h3>Recuperar una copia</h3>
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
          <div className="confirmar" role="alertdialog" aria-label="Confirmar recuperación">
            <p>La copia tiene {pendiente.personajes.length} personajes y sustituirá a los {total} actuales.</p>
            <div className="confirmar-botones">
              <button
                type="button"
                className="boton boton-peligro-lleno"
                onClick={() => {
                  reemplazarTodo(pendiente)
                  setPendiente(null)
                  setPegado('')
                  setMensaje({ ok: true, texto: 'Copia recuperada.' })
                }}
              >
                Sustituir personajes
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
