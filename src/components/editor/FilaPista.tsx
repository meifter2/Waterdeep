import { useState } from 'react'
import type { BorradorPista } from '../../data/guardar'
import { ETIQUETAS_SUGERIDAS, type Origen } from '../../data/types'
import { escribirTiempo, formatearBytes, leerTiempo } from '../../lib/tiempo'
import { AVISO_NC, creditoDe } from '../../lib/freesound'

export interface FilaBorrador extends BorradorPista {
  /** Clave estable para React. */
  clave: string
  /** Origen del sonido (para avisos y etiquetas). */
  origen: Origen
  /** ¿Admite tramo? (las listas y álbumes no). */
  admiteTramo: boolean
  detalle: string
}

const NOMBRE_ORIGEN: Record<Origen, string> = { spotify: 'Spotify', youtube: 'YouTube', archivo: 'Archivo', url: 'Enlace de audio' }

/** Una pista dentro del editor: título, etiqueta, tramo, bucle y orden. */
export function FilaPista({
  fila,
  indice,
  total,
  alCambiar,
  alMover,
  alQuitar,
}: {
  fila: FilaBorrador
  indice: number
  total: number
  alCambiar: (c: Partial<FilaBorrador>) => void
  alMover: (d: -1 | 1) => void
  alQuitar: () => void
}) {
  const [inicio, setInicio] = useState(escribirTiempo(fila.inicio_ms))
  const [fin, setFin] = useState(escribirTiempo(fila.fin_ms))
  const id = (c: string) => `pista-${fila.clave}-${c}`
  const errorTramo = tramoInvalido(fila)
  const n = indice + 1

  return (
    <li className="fila-pista" data-origen={fila.origen}>
      <div className="fila-pista-cabecera">
        <span className="fila-origen">{NOMBRE_ORIGEN[fila.origen]}</span>
        <span className="fila-detalle">{fila.detalle}</span>
        <span className="fila-acciones">
          <button type="button" className="boton-icono" onClick={() => alMover(-1)} disabled={indice === 0} aria-label={`Subir la pista ${n}`}>
            ↑
          </button>
          <button type="button" className="boton-icono" onClick={() => alMover(1)} disabled={indice === total - 1} aria-label={`Bajar la pista ${n}`}>
            ↓
          </button>
          <button type="button" className="boton-icono boton-icono-quitar" onClick={alQuitar} aria-label={`Quitar la pista ${n} de este elemento`}>
            Quitar
          </button>
        </span>
      </div>

      <div className="fila-campos">
        <div className="campo fila-titulo">
          <label htmlFor={id('titulo')}>Título del sonido</label>
          <input id={id('titulo')} value={fila.titulo} maxLength={200} onChange={(e) => alCambiar({ titulo: e.target.value })} />
        </div>
        <div className="campo fila-etiqueta">
          <label htmlFor={id('etiqueta')}>Etiqueta</label>
          <input
            id={id('etiqueta')}
            list="etiquetas-sugeridas"
            value={fila.etiqueta}
            maxLength={60}
            placeholder="Tensión, combate…"
            onChange={(e) => alCambiar({ etiqueta: e.target.value })}
          />
        </div>
        <div className="campo fila-tiempo">
          <label htmlFor={id('inicio')}>Inicio</label>
          <input
            id={id('inicio')}
            value={inicio}
            inputMode="decimal"
            placeholder="0:00"
            disabled={!fila.admiteTramo}
            aria-invalid={Number.isNaN(fila.inicio_ms) || undefined}
            onChange={(e) => {
              setInicio(e.target.value)
              alCambiar({ inicio_ms: leerTiempo(e.target.value) })
            }}
          />
        </div>
        <div className="campo fila-tiempo">
          <label htmlFor={id('fin')}>Fin</label>
          <input
            id={id('fin')}
            value={fin}
            inputMode="decimal"
            placeholder="final"
            disabled={!fila.admiteTramo}
            aria-invalid={Number.isNaN(fila.fin_ms) || undefined}
            onChange={(e) => {
              setFin(e.target.value)
              alCambiar({ fin_ms: leerTiempo(e.target.value) })
            }}
          />
        </div>
        <label className="fila-bucle">
          <input type="checkbox" checked={fila.bucle} onChange={(e) => alCambiar({ bucle: e.target.checked })} />
          En bucle
        </label>
      </div>
      {errorTramo ? (
        <p className="error">{errorTramo}</p>
      ) : !fila.admiteTramo ? (
        <p className="ayuda">Las listas y los álbumes no admiten inicio ni fin.</p>
      ) : fila.origen === 'spotify' && (fila.inicio_ms != null || fila.fin_ms != null) ? (
        <p className="ayuda">En Spotify el inicio y el fin son aproximados (±1 s).</p>
      ) : null}
    </li>
  )
}

/** Mensaje de error del tramo, o cadena vacía si es correcto. */
export function tramoInvalido(f: Pick<BorradorPista, 'inicio_ms' | 'fin_ms'>): string {
  if (Number.isNaN(f.inicio_ms) || Number.isNaN(f.fin_ms)) return 'Escribe los tiempos como minutos:segundos, por ejemplo 1:30.'
  if (f.fin_ms != null && f.fin_ms <= (f.inicio_ms ?? 0)) return 'El fin tiene que ser posterior al inicio.'
  return ''
}

export function detalleRecurso(r: {
  origen: Origen
  archivo_bytes: number | null
  duracion_ms: number | null
  archivo_nombre: string
  enlace?: string
  descripcion?: string
}): string {
  if (r.origen === 'url') {
    // Sonido de Freesound: el crédito (autor y licencia) siempre a la vista.
    const c = creditoDe({ origen: r.origen, enlace: r.enlace ?? '', descripcion: r.descripcion ?? '' })
    if (c) return [`Freesound: ${c.autor || 'autor sin datos'}`, c.licencia || 'licencia sin datos', c.nc ? AVISO_NC : ''].filter(Boolean).join(' · ')
    return r.duracion_ms ? escribirTiempo(r.duracion_ms) : ''
  }
  if (r.origen !== 'archivo') return ''
  return [r.archivo_nombre, r.duracion_ms ? escribirTiempo(r.duracion_ms) : '', formatearBytes(r.archivo_bytes)].filter(Boolean).join(', ')
}

export function ListaEtiquetas() {
  return (
    <datalist id="etiquetas-sugeridas">
      {ETIQUETAS_SUGERIDAS.map((e) => (
        <option key={e} value={e} />
      ))}
    </datalist>
  )
}
