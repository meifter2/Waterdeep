import { useEffect, useRef, useState } from 'react'
import { useReproduccion } from '../data/reproduccion'
import { useDatos } from '../data/store'
import type { Recurso } from '../data/types'
import { formatearBytes } from '../lib/tiempo'
import { modoLocal } from '../lib/supabase'
import { BotonConfirmar } from './Confirmar'
import { detalleRecurso } from './editor/FilaPista'

const NOMBRE = { spotify: 'Spotify', youtube: 'YouTube', archivo: 'Archivo' } as const
const CUOTA_GRATIS = 1024 * 1024 * 1024

/** Todos los sonidos del usuario, dónde se usan, y su borrado definitivo. */
export function BibliotecaSonidos({ alCerrar }: { alCerrar: () => void }) {
  const { recursos, pistas, elementos, actualizarRecurso, eliminarRecurso } = useDatos()
  const [busqueda, setBusqueda] = useState('')
  const dialogo = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const d = dialogo.current
    if (d && !d.open) d.showModal()
  }, [])

  const usos = (r: Recurso) =>
    pistas
      .filter((p) => p.recurso_id === r.id)
      .map((p) => elementos.find((e) => e.id === p.elemento_id)?.nombre)
      .filter((n): n is string => !!n)
  const ocupado = recursos.reduce((t, r) => t + (r.archivo_bytes ?? 0), 0)
  const q = busqueda.trim().toLocaleLowerCase('es')
  const lista = recursos
    .filter((r) => !q || [r.titulo, r.archivo_nombre, r.descripcion].some((v) => v.toLocaleLowerCase('es').includes(q)))
    .sort((a, b) => (a.titulo || a.archivo_nombre).localeCompare(b.titulo || b.archivo_nombre, 'es'))

  const borrar = (r: Recurso) => {
    const st = useReproduccion.getState()
    if (pistas.some((p) => p.recurso_id === r.id && p.id === st.pistaId)) st.detener()
    void eliminarRecurso(r.id)
  }

  return (
    <dialog ref={dialogo} className="dialogo dialogo-ancho" onClose={alCerrar} aria-labelledby="sonidos-titulo">
      <div className="copias">
        <h2 id="sonidos-titulo">Biblioteca de sonidos</h2>
        <p className="ayuda-normal">
          {recursos.length} sonidos. Un mismo sonido puede usarse en varios elementos.
          {ocupado > 0 && ` Archivos propios: ${formatearBytes(ocupado)}${modoLocal ? ' en este navegador' : ` de 1 GB del plan gratuito (${Math.round((ocupado / CUOTA_GRATIS) * 100)} %)`}.`}
        </p>
        {recursos.length > 0 && (
          <>
            <label className="sr" htmlFor="buscar-biblioteca">
              Buscar sonido
            </label>
            <input id="buscar-biblioteca" type="search" placeholder="Buscar sonido" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />
          </>
        )}
        <ul className="biblioteca-lista">
          {lista.map((r) => {
            const usado = usos(r)
            return (
              <li key={r.id}>
                <div className="campo">
                  <label htmlFor={`rec-${r.id}`}>
                    {NOMBRE[r.origen]}
                    {r.origen === 'archivo' && <span className="fila-detalle"> {detalleRecurso(r)}</span>}
                  </label>
                  <input
                    id={`rec-${r.id}`}
                    defaultValue={r.titulo}
                    maxLength={200}
                    placeholder="Sin título"
                    onBlur={(e) => e.target.value.trim() !== r.titulo && void actualizarRecurso(r.id, { titulo: e.target.value.trim() })}
                  />
                </div>
                <p className="biblioteca-usos">{usado.length ? `Se usa en: ${usado.join(', ')}` : 'Sin usar'}</p>
                <BotonConfirmar
                  className="boton boton-peligro boton-pequeno"
                  etiqueta="Borrar"
                  pregunta={
                    usado.length
                      ? `Se quitará de ${usado.length === 1 ? '1 elemento' : `${usado.length} elementos`}${r.origen === 'archivo' ? ' y se borrará el archivo' : ''}. No se puede deshacer.`
                      : `¿Borrar «${r.titulo || 'este sonido'}»${r.origen === 'archivo' ? ' y su archivo' : ''}?`
                  }
                  opciones={[{ etiqueta: 'Borrar definitivamente', accion: () => borrar(r), peligro: true }]}
                />
              </li>
            )
          })}
        </ul>
        <div className="editor-acciones">
          <button type="button" className="boton" onClick={alCerrar}>
            Cerrar
          </button>
        </div>
      </div>
    </dialog>
  )
}
