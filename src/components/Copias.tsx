import { useEffect, useRef, useState } from 'react'
import { exportarCopia, leerCopia } from '../data/convertir'
import { importarBiblioteca } from '../data/guardar'
import { useDatos } from '../data/store'
import type { Biblioteca } from '../data/types'
import { modoLocal } from '../lib/supabase'

/** Copias: exportar la biblioteca y añadir la de una copia (sin duplicar sonidos). */
export function Copias({ alCerrar }: { alCerrar: () => void }) {
  const total = useDatos((s) => s.elementos.length)
  const [mensaje, setMensaje] = useState<{ ok: boolean; texto: string } | null>(null)
  const [pegado, setPegado] = useState('')
  const [pendiente, setPendiente] = useState<Biblioteca | null>(null)
  const [importando, setImportando] = useState(false)
  const dialogo = useRef<HTMLDialogElement>(null)
  const archivo = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const d = dialogo.current
    if (d && !d.open) d.showModal()
  }, [])

  const json = () => {
    const { elementos, recursos, pistas, sesiones, sesion_elementos, elementos_comunes } = useDatos.getState()
    return exportarCopia({ elementos, recursos, pistas, sesiones, sesion_elementos, elementos_comunes })
  }

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
    const r = leerCopia(texto)
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
    try {
      const r = await importarBiblioteca(pendiente)
      setMensaje({
        ok: true,
        texto: `${r.elementos} elementos añadidos${r.sesiones ? ` y organizados en ${r.sesiones} ${r.sesiones === 1 ? 'sesión' : 'sesiones'}` : ''}.${r.omitidos ? ` ${r.omitidos} archivos propios no estaban en esta cuenta y se han omitido.` : ''}`,
      })
      setPegado('')
    } catch (e) {
      setMensaje({ ok: false, texto: e instanceof Error ? `${e.message} Lo añadido hasta el fallo se ha conservado.` : 'No se ha podido añadir.' })
    }
    setImportando(false)
    setPendiente(null)
  }

  return (
    <dialog ref={dialogo} className="dialogo" onClose={alCerrar} aria-labelledby="copias-titulo">
      <div className="copias">
        <h2 id="copias-titulo">Copias</h2>
        <p className="ayuda-normal">
          {modoLocal
            ? `Tus ${total} elementos se guardan solo en este navegador. Haz una copia para no perderlos.`
            : `Tus ${total} elementos están guardados en tu cuenta. Una copia sirve para tenerlos también fuera.`}{' '}
          La copia incluye enlaces, tramos, etiquetas y sesiones; los archivos de audio y los retratos se quedan en tu almacenamiento.
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

        <h3>Añadir desde una copia</h3>
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
            <p>
              La copia tiene {pendiente.elementos.length} elementos y {pendiente.recursos.length} sonidos
              {pendiente.sesiones.length > 0 && `, organizados en ${pendiente.sesiones.length} ${pendiente.sesiones.length === 1 ? 'sesión' : 'sesiones'}`}. Se
              añadirán a los tuyos; los sonidos repetidos se reutilizan
              {pendiente.sesiones.length > 0 && ' y las sesiones con el mismo nombre se juntan'}.
            </p>
            <div className="confirmar-botones">
              <button type="button" className="boton boton-principal" disabled={importando} onClick={() => void anadir()}>
                {importando ? 'Añadiendo…' : 'Añadir'}
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
