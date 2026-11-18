import { useEffect, useRef, useState, type FormEvent } from 'react'
import { anadirSonido } from '../data/guardar'
import { musicaExternaSonando, tocar } from '../data/mezcla'
import { pistasDe, useDatos } from '../data/store'
import { carpeta } from '../data/types'
import { factorMaestro, useVolumen } from '../data/volumen'
import {
  AVISO_NC,
  DURACIONES,
  RAPIDAS,
  buscarSonidos,
  creditoTexto,
  enlaceFreesound,
  etiquetaLicencia,
  freesoundIdDe,
  sugerenciasEn,
  traduccion,
  type SonidoLibre,
  type TipoBusqueda,
} from '../lib/freesound'
import { escribirTiempo } from '../lib/tiempo'

/** Nombre legible a partir del de Freesound (sin extensión ni guiones bajos). */
const limpiarNombre = (t: string) => t.replace(/\.(wav|mp3|flac|aiff?|ogg|m4a|opus)$/i, '').replace(/_+/g, ' ').trim() || 'Sonido de Freesound'

/**
 * «Buscar sonidos»: busca en Freesound (a través de nuestro servidor), deja escuchar la muestra y la añade a la
 * biblioteca como enlace de audio (sin descargar ni subir nada). «Añadir y reproducir» la pone a sonar en la mezcla.
 */
export function BuscarSonidos({ alCerrar, alGuardar }: { alCerrar: () => void; alGuardar: (mensaje: string) => void }) {
  const recursos = useDatos((s) => s.recursos)
  const pistas = useDatos((s) => s.pistas)
  const [tipo, setTipo] = useState<TipoBusqueda>('ambiente')
  const [texto, setTexto] = useState('')
  const [duracion, setDuracion] = useState('cualquiera')
  const [nc, setNc] = useState(false)
  const [estado, setEstado] = useState<'inicio' | 'buscando' | 'listo' | 'error'>('inicio')
  const [error, setError] = useState('')
  const [resultados, setResultados] = useState<SonidoLibre[]>([])
  const [pagina, setPagina] = useState(1)
  const [hayMas, setHayMas] = useState(false)
  const [buscado, setBuscado] = useState('')
  const [escuchando, setEscuchando] = useState<number | null>(null)
  const [aviso, setAviso] = useState('')
  const [anadiendo, setAnadiendo] = useState<number | null>(null)
  const dialogo = useRef<HTMLDialogElement>(null)
  const previa = useRef<HTMLAudioElement | null>(null)
  const turno = useRef(0)
  const ultimaVez = useRef(0)

  const campo = useRef<HTMLInputElement>(null)
  useEffect(() => {
    const d = dialogo.current
    if (d && !d.open) d.showModal()
    campo.current?.focus() // se abre para buscar: el cursor va al buscador
    // Al cerrar (X, Esc o «Cerrar») se para SOLO la muestra de Freesound; la música y los ambientes de DFY siguen.
    return () => pararPrevia()
  }, [])

  /** Cierre nativo de la ventana (como Esc): el foco vuelve al botón que la abrió. */
  const cerrar = () => {
    pararPrevia()
    if (dialogo.current?.open) dialogo.current.close()
    else alCerrar()
  }

  const pararPrevia = () => {
    const a = previa.current
    if (a) {
      a.pause()
      a.removeAttribute('src')
      a.load()
    }
    setEscuchando(null)
  }

  const buscar = async (q: string, pag = 1, opciones = { tipo, duracion, nc }) => {
    const consulta = q.trim()
    if (!consulta) return
    // Sin ráfagas: como mucho una búsqueda nueva cada 0,8 s (la cuota de Freesound es compartida).
    const ahora = Date.now()
    if (pag === 1 && ahora - ultimaVez.current < 800 && consulta === buscado && estado === 'buscando') return
    ultimaVez.current = ahora
    const n = ++turno.current
    setEstado('buscando')
    setError('')
    setAviso('')
    try {
      const r = await buscarSonidos({ q: consulta, ...opciones, pagina: pag })
      if (n !== turno.current) return // ha llegado tarde: hay una búsqueda más nueva
      setResultados((antes) => (pag === 1 ? r.resultados : [...antes, ...r.resultados.filter((x) => !antes.some((y) => y.id === x.id))]))
      setPagina(pag)
      setHayMas(r.hayMas)
      setBuscado(consulta)
      setEstado('listo')
    } catch (e) {
      if (n !== turno.current) return
      setError(e instanceof Error ? e.message : 'No se ha podido buscar.')
      setEstado('error')
    }
  }

  const enviar = (ev: FormEvent) => {
    ev.preventDefault()
    void buscar(texto)
  }

  const cambiarTipo = (t: TipoBusqueda) => {
    setTipo(t)
    setDuracion('cualquiera')
    pararPrevia()
    if (buscado) void buscar(buscado, 1, { tipo: t, duracion: 'cualquiera', nc })
  }

  const escuchar = (s: SonidoLibre) => {
    if (escuchando === s.id) return pararPrevia()
    if (musicaExternaSonando()) {
      setAviso('Pausa Spotify o YouTube para escuchar la muestra: no se mezclan con otros sonidos.')
      return
    }
    const a = (previa.current ??= new Audio())
    ;(window as unknown as { __previaDFY?: HTMLAudioElement }).__previaDFY = a
    a.onended = () => setEscuchando(null)
    a.onerror = () => {
      setEscuchando(null)
      setAviso('No se puede escuchar esta muestra ahora mismo.')
    }
    a.src = s.preview
    a.volume = factorMaestro()
    a.muted = useVolumen.getState().maestroSilenciado
    setAviso('')
    setEscuchando(s.id)
    a.play().catch(() => setEscuchando(null))
  }

  /** Pista de la biblioteca que ya usa este sonido (si se añadió antes). */
  const yaEsta = (s: SonidoLibre) => {
    const r = recursos.find((x) => freesoundIdDe(x.enlace) === s.id)
    return r ? pistas.find((p) => p.recurso_id === r.id) : undefined
  }

  const anadir = async (s: SonidoLibre, reproducir: boolean) => {
    pararPrevia()
    setAnadiendo(s.id)
    setAviso('')
    try {
      const nombre = limpiarNombre(s.titulo).slice(0, 120)
      const el = await anadirSonido({
        fuente: { tipo: 'enlace', enlace: enlaceFreesound(s), duracion_ms: s.duracion_ms, descripcion: creditoTexto(s) },
        titulo: nombre,
        etiqueta: '',
        nuevo: { tipo, nombre },
      })
      alGuardar(`«${el.nombre}» añadido a ${carpeta(el.tipo).titulo}.`)
      const nueva = pistasDe(useDatos.getState().pistas, el.id).at(-1)
      if (reproducir && nueva) tocar(nueva.id)
    } catch (e) {
      setAviso(e instanceof Error && e.message ? e.message : 'No se ha podido añadir.')
    } finally {
      setAnadiendo(null)
    }
  }

  const sugeridas = sugerenciasEn(texto)

  return (
    <dialog ref={dialogo} className="dialogo dialogo-ancho buscar-sonidos" onClose={alCerrar} aria-labelledby="buscar-titulo">
      <div className="copias">
        <header className="buscar-cabecera">
          <h2 id="buscar-titulo">Buscar sonidos</h2>
          <button type="button" className="dialogo-cerrar" onClick={cerrar} aria-label="Cerrar Buscar sonidos" title="Cerrar (Esc)">
            <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </header>
        <p className="ayuda-normal">
          Sonidos libres de Freesound. Suenan desde Freesound: no se descargan ni se suben a tu cuenta, y sus créditos quedan guardados.
        </p>

        <div className="segmentado" role="group" aria-label="Qué buscas">
          <button type="button" aria-pressed={tipo === 'ambiente'} onClick={() => cambiarTipo('ambiente')}>
            Ambientes
          </button>
          <button type="button" aria-pressed={tipo === 'efecto'} onClick={() => cambiarTipo('efecto')}>
            Efectos
          </button>
        </div>

        <form className="buscar-fila" onSubmit={enviar} role="search">
          <div className="campo">
            <label htmlFor="buscar-texto">Qué sonido (en español o en inglés)</label>
            <input id="buscar-texto" ref={campo} type="search" value={texto} autoComplete="off" maxLength={100} placeholder={tipo === 'ambiente' ? 'lluvia, tavern, forest…' : 'puerta, sword, explosion…'} onChange={(e) => setTexto(e.target.value)} />
          </div>
          <button type="submit" className="boton boton-principal" disabled={!texto.trim() || estado === 'buscando'}>
            Buscar
          </button>
        </form>

        {sugeridas.length > 0 ? (
          <div className="buscar-ideas" aria-label="Probar en inglés">
            <span>En inglés hay muchos más:</span>
            {sugeridas.map((s) => (
              <button key={s} type="button" className="pista-chip" onClick={() => (setTexto(s), void buscar(s))}>
                {s}
              </button>
            ))}
          </div>
        ) : (
          !texto && (
            <div className="buscar-ideas" aria-label="Ideas">
              <span>Ideas:</span>
              {RAPIDAS[tipo].map((p) => (
                <button key={p} type="button" className="pista-chip" onClick={() => (setTexto(traduccion(p)), void buscar(traduccion(p)))}>
                  {p}
                </button>
              ))}
            </div>
          )
        )}

        <div className="buscar-filtros">
          <div className="campo">
            <label htmlFor="buscar-duracion">Duración</label>
            <select
              id="buscar-duracion"
              value={duracion}
              onChange={(e) => {
                setDuracion(e.target.value)
                if (buscado) void buscar(buscado, 1, { tipo, duracion: e.target.value, nc })
              }}
            >
              {DURACIONES[tipo].map((d) => (
                <option key={d.valor} value={d.valor}>
                  {d.texto}
                </option>
              ))}
            </select>
          </div>
          <label className="casilla">
            <input
              type="checkbox"
              checked={nc}
              onChange={(e) => {
                setNc(e.target.checked)
                if (buscado) void buscar(buscado, 1, { tipo, duracion, nc: e.target.checked })
              }}
            />
            Incluir sonidos CC BY-NC (solo uso no comercial)
          </label>
        </div>

        <p className="buscar-estado" role="status">
          {estado === 'buscando'
            ? 'Buscando…'
            : estado === 'listo'
              ? resultados.length
                ? `${resultados.length} ${resultados.length === 1 ? 'sonido' : 'sonidos'} para «${buscado}».`
                : `Nada para «${buscado}». Prueba en inglés o con otra duración.`
              : ''}
        </p>
        {error && (
          <p className="aviso" role="alert">
            {error}
          </p>
        )}
        {aviso && (
          <p className="aviso" role="alert">
            {aviso}
          </p>
        )}

        {resultados.length > 0 && (
          <ul className="buscar-resultados">
            {resultados.map((s) => {
              const ya = yaEsta(s)
              const etiqueta = etiquetaLicencia(s.licencia, s.licenciaUrl)
              return (
                <li key={s.id} className="sonido-libre" data-escuchando={escuchando === s.id || undefined}>
                  <button
                    type="button"
                    className="canal-boton buscar-escuchar"
                    onClick={() => escuchar(s)}
                    aria-pressed={escuchando === s.id}
                    aria-label={`${escuchando === s.id ? 'Parar' : 'Escuchar'} ${s.titulo}`}
                    title={escuchando === s.id ? 'Parar la muestra' : 'Escuchar la muestra'}
                  >
                    {escuchando === s.id ? (
                      <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
                        <rect x="6" y="5" width="4.2" height="14" rx="1.2" fill="currentColor" />
                        <rect x="13.8" y="5" width="4.2" height="14" rx="1.2" fill="currentColor" />
                      </svg>
                    ) : (
                      <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
                        <path d="M8 5.2v13.6c0 .8.9 1.3 1.6.8l10-6.8a1 1 0 0 0 0-1.6l-10-6.8C8.9 3.9 8 4.4 8 5.2z" fill="currentColor" />
                      </svg>
                    )}
                  </button>
                  <div className="sonido-libre-textos">
                    <p className="sonido-libre-titulo">{s.titulo}</p>
                    <p className="sonido-libre-credito">
                      de {s.autor} · {escribirTiempo(s.duracion_ms)}
                      {s.valoracion != null && ` · ★ ${s.valoracion}`} ·{' '}
                      <span className="licencia" data-licencia={s.licencia}>
                        {etiqueta}
                      </span>
                      {s.licencia === 'by-nc' && <span className="licencia-nc"> {AVISO_NC}</span>} ·{' '}
                      <a href={s.pagina} target="_blank" rel="noopener noreferrer">
                        Ver en Freesound
                      </a>
                    </p>
                  </div>
                  <div className="sonido-libre-acciones">
                    {ya ? (
                      <button type="button" className="boton boton-pequeno" onClick={() => tocar(ya.id)} aria-label={`Reproducir ${s.titulo} (ya en tu biblioteca)`}>
                        Ya en tu biblioteca: reproducir
                      </button>
                    ) : (
                      <>
                        <button type="button" className="boton boton-pequeno boton-principal" disabled={anadiendo != null} onClick={() => void anadir(s, true)} aria-label={`Añadir y reproducir ${s.titulo}`}>
                          {anadiendo === s.id ? 'Añadiendo…' : 'Añadir y reproducir'}
                        </button>
                        <button type="button" className="boton boton-pequeno" disabled={anadiendo != null} onClick={() => void anadir(s, false)} aria-label={`Añadir ${s.titulo}`}>
                          Añadir
                        </button>
                      </>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
        {hayMas && estado !== 'buscando' && (
          <button type="button" className="boton" onClick={() => void buscar(buscado, pagina + 1)}>
            Más resultados
          </button>
        )}

        <p className="ayuda-normal buscar-pie">
          Se añaden a {carpeta(tipo).titulo}. Respeta la licencia de cada sonido: CC0 no pide nada; CC BY pide citar al autor (DFY guarda el crédito);
          CC BY-NC además prohíbe el uso comercial.
        </p>
        <div className="editor-acciones">
          <button type="button" className="boton" onClick={cerrar}>
            Cerrar
          </button>
        </div>
      </div>
    </dialog>
  )
}
