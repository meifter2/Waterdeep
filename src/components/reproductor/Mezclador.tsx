import { useEffect, useId, useRef, type ReactNode } from 'react'
import { MAX_AMBIENTES, useMezcla, type CanalAmbiente } from '../../data/mezcla'
import { useReproduccion } from '../../data/reproduccion'
import { esLocal, useDatos } from '../../data/store'
import { useVolumen } from '../../data/volumen'

// Panel de mezcla (fase 2). No es modal: se abre encima de la biblioteca sin parar nada,
// y las tarjetas siguen funcionando mientras está abierto. La barra de transporte no se toca.

const TEXTO: Record<string, string> = { cargando: 'Cargando', sonando: 'Sonando', pausa: 'En pausa', error: 'No se puede reproducir', parado: 'Detenido', otra: 'Spotify está con otra canción' }

/** Botón de la barra que abre el panel. Muestra cuántas capas suenan. */
export function BotonMezcla() {
  const abierto = useMezcla((s) => s.panel)
  const abrir = useMezcla((s) => s.abrirPanel)
  const capas = useMezcla((s) => s.ambientes.length + s.efectos.length)
  return (
    <button
      type="button"
      className="boton-mezcla"
      onClick={() => abrir()}
      aria-expanded={abierto}
      aria-controls="mezclador"
      data-activo={capas > 0 || undefined}
      title={abierto ? 'Cerrar la mezcla' : 'Abrir la mezcla'}
    >
      <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <path d="M6 4v16M12 4v16M18 4v16" />
        <rect x="3.5" y="13" width="5" height="3" rx="1" fill="currentColor" />
        <rect x="9.5" y="7" width="5" height="3" rx="1" fill="currentColor" />
        <rect x="15.5" y="11" width="5" height="3" rx="1" fill="currentColor" />
      </svg>
      Mezcla
      {capas > 0 && (
        <span className="boton-mezcla-cuenta" aria-label={`${capas} ${capas === 1 ? 'capa sonando' : 'capas sonando'}`}>
          {capas}
        </span>
      )}
    </button>
  )
}

export function Mezclador() {
  const abierto = useMezcla((s) => s.panel)
  const panel = useRef<HTMLElement>(null)

  // La altura de la barra cambia (vídeo, móvil): el panel se coloca justo encima.
  useEffect(() => {
    const barra = document.querySelector<HTMLElement>('.reproductor')
    if (!barra) return
    const medir = () => document.documentElement.style.setProperty('--alto-reproductor', `${barra.offsetHeight}px`)
    medir()
    const ro = new ResizeObserver(medir)
    ro.observe(barra)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    if (abierto) panel.current?.focus()
  }, [abierto])

  if (!abierto) return null
  return (
    <aside
      id="mezclador"
      ref={panel}
      className="mezclador"
      aria-labelledby="mezclador-titulo"
      tabIndex={-1}
      onKeyDown={(e) => {
        if (e.key === 'Escape') useMezcla.getState().abrirPanel(false)
      }}
    >
      <Cabecera />
      <CanalMusica />
      <Ambientes />
      <Efectos />
    </aside>
  )
}

function Cabecera() {
  const v = useVolumen()
  const { detenerTodo, abrirPanel } = useMezcla()
  const algo = useMezcla((s) => s.ambientes.length + s.efectos.length > 0)
  const principal = useReproduccion((s) => s.estado !== 'parado' && s.pistaId !== null)
  return (
    <div className="mezclador-cabecera">
      <div className="mezclador-titular">
        <h2 id="mezclador-titulo">Mezcla</h2>
        <button type="button" className="mezclador-cerrar" onClick={() => abrirPanel(false)} aria-label="Cerrar la mezcla" title="Cerrar (Esc)">
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </div>
      <Fader
        etiqueta="Maestro"
        que="la mezcla"
        visible
        valor={v.maestro}
        silenciado={v.maestroSilenciado}
        cambiar={v.fijarMaestro}
        silenciar={v.alternarSilencioMaestro}
        ayuda="Afecta a todo lo que suena en este navegador. Spotify tiene su propio volumen."
      />
      <button type="button" className="detener-todo" onClick={detenerTodo} disabled={!algo && !principal}>
        <IconoParar />
        Detener todo
      </button>
    </div>
  )
}

/** Canal principal: el reproductor de siempre (archivo, YouTube o Spotify). */
function CanalMusica() {
  const { pistaId, estado, principal, detener } = useReproduccion()
  const pista = useDatos((s) => s.pistas.find((p) => p.id === pistaId))
  const elemento = useDatos((s) => s.elementos.find((e) => e.id === pista?.elemento_id))
  const recurso = useDatos((s) => s.recursos.find((r) => r.id === pista?.recurso_id))
  const v = useVolumen()
  const hay = !!pistaId && !!pista
  const suena = estado === 'sonando' || estado === 'cargando'
  const externa = recurso && !esLocal(recurso)
  const fuente = !recurso
    ? ''
    : recurso.origen === 'archivo'
      ? 'Archivo propio'
      : recurso.origen === 'url'
        ? 'Enlace de audio'
        : recurso.origen === 'spotify'
          ? 'Spotify, fuera de la mezcla'
          : 'YouTube en su reproductor, fuera de la mezcla'
  return (
    <section className="mezclador-grupo" aria-labelledby="grupo-musica">
      <h3 id="grupo-musica">Música</h3>
      <div className="canal" data-estado={hay ? estado : undefined}>
        <div className="canal-cabecera">
          <p className="canal-nombre">{elemento?.nombre ?? 'Sin música'}</p>
          <p className="canal-estado">{hay ? [TEXTO[estado], fuente].filter(Boolean).join('. ') : 'Pulsa una tarjeta de música.'}</p>
        </div>
        <div className="canal-controles">
          <BotonCanal etiqueta={suena ? 'Pausar música' : 'Reproducir música'} onClick={principal} desactivado={!hay || estado === 'cargando'}>
            {suena ? <IconoPausa /> : <IconoPlay />}
          </BotonCanal>
          <BotonCanal etiqueta="Detener música" onClick={detener} desactivado={!hay || estado === 'parado'}>
            <IconoParar />
          </BotonCanal>
          {externa && recurso.origen === 'spotify' ? (
            <p className="canal-nota">Su volumen está en la barra.</p>
          ) : (
            <Fader etiqueta="Volumen de la música" que="la música" valor={v.local} silenciado={v.silenciado} cambiar={v.fijarLocal} silenciar={v.alternarSilencioLocal} />
          )}
        </div>
      </div>
    </section>
  )
}

function Ambientes() {
  const ambientes = useMezcla((s) => s.ambientes)
  return (
    <section className="mezclador-grupo" aria-labelledby="grupo-ambientes">
      <h3 id="grupo-ambientes">
        Ambientes <span className="mezclador-cuenta">{ambientes.length} de {MAX_AMBIENTES}</span>
      </h3>
      {ambientes.length === 0 ? (
        <p className="mezclador-vacio">Pulsa una tarjeta de Ambientes con un archivo propio o un enlace de audio y sonará aquí, en bucle, a la vez que la música.</p>
      ) : (
        <ul className="canales">
          {ambientes.map((c) => (
            <CanalDeAmbiente key={c.id} canal={c} />
          ))}
        </ul>
      )}
    </section>
  )
}

function CanalDeAmbiente({ canal: c }: { canal: CanalAmbiente }) {
  const elemento = useDatos((s) => s.elementos.find((e) => e.id === c.elementoId))
  const pista = useDatos((s) => s.pistas.find((p) => p.id === c.pistaId))
  const recurso = useDatos((s) => s.recursos.find((r) => r.id === pista?.recurso_id))
  const mz = useMezcla()
  const nombre = elemento?.nombre ?? 'Ambiente'
  const detalle = pista?.etiqueta || recurso?.titulo || ''
  const suena = c.estado === 'sonando' || c.estado === 'cargando'
  return (
    <li className="canal" data-estado={c.estado}>
      <div className="canal-cabecera">
        <p className="canal-nombre">
          {nombre}
          {detalle && detalle.toLocaleLowerCase('es') !== nombre.toLocaleLowerCase('es') && <span className="canal-detalle">{detalle}</span>}
        </p>
        <p className="canal-estado">{c.estado === 'error' ? c.aviso || TEXTO.error : TEXTO[c.estado]}</p>
      </div>
      <div className="canal-controles">
        <BotonCanal etiqueta={`${suena ? 'Pausar' : c.estado === 'error' ? 'Reintentar' : 'Reanudar'} ${nombre}`} onClick={() => mz.pausarReanudar(c.id)} desactivado={c.estado === 'cargando'}>
          {suena ? <IconoPausa /> : <IconoPlay />}
        </BotonCanal>
        <BotonCanal etiqueta={`Detener ${nombre}`} onClick={() => mz.detenerAmbiente(c.id)}>
          <IconoParar />
        </BotonCanal>
        <BotonCanal etiqueta={`Repetir ${nombre}`} onClick={() => mz.bucleAmbiente(c.id)} pulsado={c.bucle}>
          <IconoBucle />
        </BotonCanal>
        <Fader etiqueta={`Volumen de ${nombre}`} que={nombre} valor={c.volumen} silenciado={c.silenciado} cambiar={(n) => mz.volumenAmbiente(c.id, n)} silenciar={() => mz.silenciarAmbiente(c.id)} />
      </div>
    </li>
  )
}

function Efectos() {
  const efectos = useMezcla((s) => s.efectos)
  const silenciados = useMezcla((s) => s.efectosSilenciados)
  const { volumenEfectos, silenciarEfectos, detenerEfectos } = useMezcla()
  const volumen = useVolumen((s) => s.efecto)
  const elementos = useDatos((s) => s.elementos)
  const nombres = [...new Set(efectos.map((v) => elementos.find((e) => e.id === v.elementoId)?.nombre ?? 'Efecto'))]
  return (
    <section className="mezclador-grupo" aria-labelledby="grupo-efectos">
      <h3 id="grupo-efectos">Efectos</h3>
      <div className="canal" data-estado={efectos.length ? 'sonando' : undefined}>
        <div className="canal-cabecera">
          <p className="canal-nombre">{nombres.length ? nombres.join(', ') : 'Ninguno sonando'}</p>
          <p className="canal-estado">{efectos.length ? `${efectos.length} ${efectos.length === 1 ? 'sonando' : 'sonando a la vez'}` : 'Pulsa una tarjeta de Efectos: suena una vez.'}</p>
        </div>
        <div className="canal-controles">
          <BotonCanal etiqueta="Detener efectos" onClick={detenerEfectos} desactivado={!efectos.length}>
            <IconoParar />
          </BotonCanal>
          <Fader etiqueta="Volumen de los efectos" que="los efectos" valor={volumen} silenciado={silenciados} cambiar={volumenEfectos} silenciar={silenciarEfectos} />
        </div>
      </div>
    </section>
  )
}

// ── Piezas ──

function BotonCanal(p: { etiqueta: string; onClick: () => void; desactivado?: boolean; pulsado?: boolean; children: ReactNode }) {
  return (
    <button type="button" className="canal-boton" onClick={p.onClick} disabled={p.desactivado} aria-label={p.etiqueta} title={p.etiqueta} aria-pressed={p.pulsado}>
      {p.children}
    </button>
  )
}

/** Deslizador 0–100 con su botón de silencio. */
function Fader(p: { etiqueta: string; que: string; valor: number; silenciado: boolean; cambiar: (n: number) => void; silenciar: () => void; ayuda?: string; visible?: boolean }) {
  const id = useId()
  return (
    <div className="fader" data-silenciado={p.silenciado || undefined} data-maestro={p.visible || undefined}>
      <label className={p.visible ? 'fader-etiqueta' : 'sr'} htmlFor={id}>
        {p.etiqueta}
      </label>
      <button
        type="button"
        className="volumen-silencio"
        onClick={p.silenciar}
        aria-pressed={p.silenciado}
        aria-label={`${p.silenciado ? 'Activar el sonido de' : 'Silenciar'} ${p.que}`}
        title={p.silenciado ? 'Activar sonido' : 'Silenciar'}
      >
        <IconoAltavoz silenciado={p.silenciado} alto={p.valor > 50} />
      </button>
      <input
        id={id}
        type="range"
        min={0}
        max={100}
        step={1}
        value={p.valor}
        aria-valuetext={p.silenciado ? 'Silencio' : `${p.valor} %`}
        aria-describedby={p.ayuda ? `${id}-ayuda` : undefined}
        onChange={(e) => p.cambiar(Number(e.target.value))}
        style={{ ['--relleno' as string]: `${p.valor}%` }}
      />
      <output htmlFor={id} className="volumen-valor">
        {p.silenciado ? 'Silencio' : `${p.valor} %`}
      </output>
      {p.ayuda && (
        <span id={`${id}-ayuda`} className="fader-ayuda">
          {p.ayuda}
        </span>
      )}
    </div>
  )
}

const IconoPlay = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
    <path d="M8 5.2v13.6c0 .8.9 1.3 1.6.8l10-6.8a1 1 0 0 0 0-1.6l-10-6.8C8.9 3.9 8 4.4 8 5.2z" fill="currentColor" />
  </svg>
)
const IconoPausa = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
    <rect x="6" y="5" width="4.2" height="14" rx="1.2" fill="currentColor" />
    <rect x="13.8" y="5" width="4.2" height="14" rx="1.2" fill="currentColor" />
  </svg>
)
const IconoParar = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
    <rect x="5" y="5" width="14" height="14" rx="2" fill="currentColor" />
  </svg>
)
const IconoBucle = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17 2l3 3-3 3" />
    <path d="M4 11V9a4 4 0 0 1 4-4h12" />
    <path d="M7 22l-3-3 3-3" />
    <path d="M20 13v2a4 4 0 0 1-4 4H4" />
  </svg>
)
const IconoAltavoz = ({ silenciado, alto }: { silenciado: boolean; alto: boolean }) => (
  <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor" />
    {silenciado ? (
      <path d="M17 9l5 6M22 9l-5 6" />
    ) : (
      <>
        <path d="M16.5 8.5a5 5 0 0 1 0 7" />
        {alto && <path d="M19.5 5.5a9 9 0 0 1 0 13" />}
      </>
    )}
  </svg>
)
