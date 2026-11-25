import { useMemo } from 'react'
import { abririaEnSpotify, avisoTramoExterno, tocar, tocarElemento, useMezcla } from '../data/mezcla'
import { useReproduccion } from '../data/reproduccion'
import { esLocal, pistasDe, useDatos } from '../data/store'
import type { Elemento, Pista, Recurso } from '../data/types'
import { useSeleccion } from './sesiones/seleccion'

/** Nombre corto de una pista para su botón. */
export function nombrePista(p: Pista, r: Recurso | undefined, i: number): string {
  return p.etiqueta || r?.titulo || `Pista ${i + 1}`
}

/**
 * Tarjeta de un elemento.
 * - Toda la superficie (retrato, nombre, descripción) es UN botón que reproduce la pista principal (la primera).
 * - Con varias pistas, debajo hay un botón por pista (hermanos, no anidados).
 * - Pulsar nunca pausa: pausar/reanudar está en la barra inferior. Editar es un botón aparte.
 * - Mezcla (fase 2): en Ambientes, una pista de archivo propio se activa/detiene en su canal (aria-pressed);
 *   en Efectos, cada pulsación la lanza una vez. Spotify y YouTube siguen en el canal principal.
 */
export function Tarjeta({
  elemento,
  alEditar,
  asa,
  moviendo = false,
  verComun = false,
}: {
  elemento: Elemento
  alEditar: () => void
  /** Props del asa de arrastre (sin asa mientras se busca: el orden filtrado no es el real). */
  asa?: Record<string, unknown>
  /** La tarjeta que se está moviendo: se dibuja como hueco donde caerá. */
  moviendo?: boolean
  /** Vista de una sesión: se marca si la tarjeta es común (aparece en todas). */
  verComun?: boolean
}) {
  // Ojo: un selector que devuelve una lista nueva provoca un bucle; se calcula aparte.
  const todas = useDatos((s) => s.pistas)
  const pistas = useMemo(() => pistasDe(todas, elemento.id), [todas, elemento.id])
  const recursos = useDatos((s) => s.recursos)
  const retrato = useDatos((s) => (elemento.retrato_ruta ? s.urls[elemento.retrato_ruta] : undefined))
  const pistaId = useReproduccion((s) => s.pistaId)
  const estado = useReproduccion((s) => s.estado)
  const ambientes = useMezcla((s) => s.ambientes)
  const efectos = useMezcla((s) => s.efectos)
  const seleccionando = useSeleccion((s) => s.activo)
  const seleccionada = useSeleccion((s) => s.ids.includes(elemento.id))
  const alternar = useSeleccion((s) => s.alternar)
  const comun = useDatos((s) => s.elementos_comunes.some((c) => c.elemento_id === elemento.id))
  // En modo selección se ve dónde está cada tarjeta (para organizar sin abrirlas).
  const relaciones = useDatos((s) => s.sesion_elementos)
  const sesiones = useDatos((s) => s.sesiones)
  const dondeEsta = useMemo(() => {
    if (!seleccionando) return ''
    const nombres = relaciones.filter((r) => r.elemento_id === elemento.id).flatMap((r) => sesiones.find((x) => x.id === r.sesion_id)?.nombre ?? [])
    nombres.sort((a, b) => a.localeCompare(b, 'es', { numeric: true }))
    const partes = [...(comun ? ['Común'] : []), ...nombres]
    return partes.length ? partes.join(', ') : 'Sin sesión'
  }, [seleccionando, relaciones, sesiones, elemento.id, comun])

  const capa = elemento.tipo === 'ambiente' || elemento.tipo === 'efecto' ? elemento.tipo : null
  /** ¿Esta pista va a la mezcla? (archivo propio en Ambientes o Efectos) */
  const enMezcla = (p: Pista) => !!capa && esLocal(recursos.find((r) => r.id === p.recurso_id))
  const canalDe = (p: Pista) => (capa === 'ambiente' && enMezcla(p) ? ambientes.find((c) => c.pistaId === p.id) : undefined)
  const efectoSuena = (p: Pista) => capa === 'efecto' && enMezcla(p) && efectos.some((v) => v.pistaId === p.id)

  const actual = pistas.find((p) => p.id === pistaId)
  // Detenida, o si Spotify cambió a otra canción desde fuera, la tarjeta deja de marcarse.
  const enPrincipal = !!actual && estado !== 'otra' && estado !== 'parado'
  const canales = pistas.map(canalDe).filter((c) => !!c)
  const conEfecto = pistas.some(efectoSuena)
  const esActual = enPrincipal || canales.length > 0 || conEfecto
  const sonando =
    (enPrincipal && (estado === 'sonando' || estado === 'cargando')) ||
    canales.some((c) => c.estado === 'sonando' || c.estado === 'cargando') ||
    conEfecto
  const conRetrato = !!elemento.retrato_ruta
  const varias = pistas.length > 1
  const principal = pistas[0]
  const nombrePrincipal = principal ? nombrePista(principal, recursos.find((r) => r.id === principal.recurso_id), 0) : ''
  const principalEnMezcla = principal ? enMezcla(principal) : false
  const canalPrincipal = principal ? canalDe(principal) : undefined
  const estadoMezcla = canales[0]?.estado

  const estadoTexto = !pistas.length
    ? 'Sin sonido: pulsa para añadirlo'
    : canales.length
      ? estadoMezcla === 'pausa'
        ? 'En pausa en la mezcla'
        : estadoMezcla === 'error'
          ? 'No se puede reproducir'
          : estadoMezcla === 'cargando'
            ? 'Cargando'
            : 'Sonando en la mezcla'
      : conEfecto
        ? 'Sonando'
        : enPrincipal
          ? estado === 'pausa'
            ? 'En pausa'
            : estado === 'error'
              ? 'No se puede reproducir'
              : 'Sonando'
          : ''

  // Texto del botón grande según lo que hará al pulsarlo.
  const accion = (p: Pista | undefined, sufijo: string) => {
    if (!p || !enMezcla(p)) return `Reproducir ${sufijo}`
    if (capa === 'efecto') return `Lanzar efecto ${sufijo}`
    const c = canalDe(p)
    return `${c && (c.estado === 'sonando' || c.estado === 'cargando') ? 'Detener' : 'Activar'} ambiente ${sufijo}`
  }

  return (
    <li
      className="tarjeta"
      data-elemento={elemento.id}
      data-moviendo={moviendo || undefined}
      data-actual={esActual || undefined}
      data-sonando={sonando || undefined}
      data-retrato={conRetrato || undefined}
      data-varias={varias || undefined}
      data-seleccionando={seleccionando || undefined}
      data-seleccionada={seleccionada || undefined}
    >
      {seleccionando && (
        <button type="button" className="tarjeta-seleccionar" aria-pressed={seleccionada} onClick={() => alternar(elemento.id)}>
          <span className="tarjeta-casilla" aria-hidden="true" />
          <span className="sr">Seleccionar {elemento.nombre}</span>
          <span className="tarjeta-donde">{dondeEsta}</span>
        </button>
      )}
      <button
        type="button"
        inert={seleccionando || undefined}
        className="tarjeta-tocar"
        onClick={() => (pistas.length ? tocarElemento(elemento.id) : alEditar())}
        aria-pressed={capa === 'ambiente' && principalEnMezcla ? !!canalPrincipal : undefined}
        title={
          principal && abririaEnSpotify(principal.id)
            ? `Hay ambientes sonando: se abrirá en la app de Spotify.${avisoTramoExterno(principal.id)}`
            : undefined
        }
        data-capa={principalEnMezcla ? capa : undefined}
        aria-label={!pistas.length ? `Añadir sonido a ${elemento.nombre}` : accion(principal, varias ? `${elemento.nombre}: ${nombrePrincipal}` : elemento.nombre)}
      >
        {conRetrato && <span className="tarjeta-retrato">{retrato && <img src={retrato} alt="" loading="lazy" />}</span>}
        <span className="tarjeta-textos">
          <span className="tarjeta-nombre">{elemento.nombre}</span>
          {verComun && comun && <span className="tarjeta-comun">Común</span>}
          {elemento.descripcion && <span className="tarjeta-nota">{elemento.descripcion}</span>}
          {estadoTexto && <span className="tarjeta-fuente">{estadoTexto}</span>}
        </span>
      </button>

      {varias && (
        <ul className="tarjeta-pistas" inert={seleccionando || undefined} aria-label={`Pistas de ${elemento.nombre}`}>
          {pistas.map((p, i) => {
            const r = recursos.find((x) => x.id === p.recurso_id)
            const c = canalDe(p)
            const esta = c ? true : efectoSuena(p) || (enPrincipal && p.id === pistaId)
            const nombre = nombrePista(p, r, i)
            const suenaChip = c ? c.estado === 'sonando' || c.estado === 'cargando' : esta && sonando
            return (
              <li key={p.id}>
                <button
                  type="button"
                  className="pista-chip"
                  data-actual={esta || undefined}
                  data-sonando={suenaChip || undefined}
                  data-origen={r?.origen}
                  aria-current={esta && !(capa === 'ambiente' && enMezcla(p)) ? 'true' : undefined}
                  aria-pressed={capa === 'ambiente' && enMezcla(p) ? !!c : undefined}
                  aria-label={accion(p, `${nombre} de ${elemento.nombre}`)}
                  title={r?.titulo && r.titulo !== nombre ? r.titulo : undefined}
                  onClick={() => tocar(p.id)}
                >
                  {nombre}
                </button>
              </li>
            )
          })}
        </ul>
      )}

      <div className="tarjeta-acciones" inert={seleccionando || undefined}>
        {asa && (
          <button
            type="button"
            className="tarjeta-asa"
            aria-label={`Mover ${elemento.nombre}`}
            aria-describedby="ayuda-mover"
            title="Arrastra para cambiar el orden (teclado: espacio y flechas)"
            {...asa}
          >
            <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="currentColor">
              <circle cx="9" cy="6" r="1.6" />
              <circle cx="15" cy="6" r="1.6" />
              <circle cx="9" cy="12" r="1.6" />
              <circle cx="15" cy="12" r="1.6" />
              <circle cx="9" cy="18" r="1.6" />
              <circle cx="15" cy="18" r="1.6" />
            </svg>
          </button>
        )}
        <button type="button" className="tarjeta-editar" onClick={alEditar} aria-label={`Editar ${elemento.nombre}`}>
          Editar
        </button>
      </div>
    </li>
  )
}
