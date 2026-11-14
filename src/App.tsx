import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { Copias } from './components/Copias'
import { Editor } from './components/Editor'
import { Reproductor } from './components/reproductor/Reproductor'
import { Tarjeta } from './components/Tarjeta'
import { useReproduccion } from './data/reproduccion'
import { escucharOtrasPestanas, useDatos } from './data/store'
import { almacenamientoDisponible } from './data/storage'
import type { Personaje } from './data/types'
import { precargar } from './lib/apis'
import { interpretarEnlace } from './lib/enlaces'

const SIN_GRUPO = 'Sin grupo'

export function App() {
  const personajes = useDatos((s) => s.personajes)
  const reproducir = useReproduccion((s) => s.reproducir)
  const [busqueda, setBusqueda] = useState('')
  // undefined = cerrado, null = nuevo, Personaje = editar
  const [editando, setEditando] = useState<Personaje | null | undefined>(undefined)
  const [copias, setCopias] = useState(false)
  const buscador = useRef<HTMLInputElement>(null)

  useEffect(() => escucharOtrasPestanas(), [])
  useEffect(() => precargar(), [])

  // «/» enfoca el buscador desde cualquier parte.
  useEffect(() => {
    const alPulsar = (e: globalThis.KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (e.key === '/' && !['INPUT', 'TEXTAREA'].includes(t.tagName)) {
        e.preventDefault()
        buscador.current?.focus()
      }
    }
    window.addEventListener('keydown', alPulsar)
    return () => window.removeEventListener('keydown', alPulsar)
  }, [])

  const grupos = useMemo(() => {
    const q = busqueda.trim().toLocaleLowerCase('es')
    const filtrados = personajes
      .filter((p) => !q || [p.nombre, p.grupo, p.nota].some((v) => v.toLocaleLowerCase('es').includes(q)))
      .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
    const mapa = new Map<string, Personaje[]>()
    for (const p of filtrados) {
      const g = p.grupo.trim() || SIN_GRUPO
      mapa.set(g, [...(mapa.get(g) ?? []), p])
    }
    return [...mapa.entries()].sort(([a], [b]) => (a === SIN_GRUPO ? 1 : b === SIN_GRUPO ? -1 : a.localeCompare(b, 'es')))
  }, [personajes, busqueda])

  const primero = grupos[0]?.[1][0]

  // Intro en el buscador: suena el primer resultado.
  const alTeclear = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && primero && typeof interpretarEnlace(primero.enlace) !== 'string') {
      reproducir(primero.id)
    }
    if (e.key === 'Escape') setBusqueda('')
  }

  return (
    <div className="app">
      <header className="cabecera">
        <div className="cabecera-marca">
          <h1>Banda sonora</h1>
          {personajes.length > 0 && <p>{personajes.length === 1 ? '1 personaje' : `${personajes.length} personajes`}</p>}
        </div>
        <div className="cabecera-acciones">
          {personajes.length > 0 && (
            <div className="buscador">
              <label className="sr" htmlFor="buscar">
                Buscar personaje
              </label>
              <input
                id="buscar"
                ref={buscador}
                type="search"
                placeholder="Buscar personaje"
                value={busqueda}
                autoComplete="off"
                onChange={(e) => setBusqueda(e.target.value)}
                onKeyDown={alTeclear}
                aria-describedby="buscar-ayuda"
              />
              <span id="buscar-ayuda" className="sr">
                Pulsa Intro para que suene el primer resultado.
              </span>
            </div>
          )}
          <button type="button" className="boton boton-principal" onClick={() => setEditando(null)}>
            Añadir personaje
          </button>
          <button type="button" className="boton" onClick={() => setCopias(true)}>
            Copias
          </button>
        </div>
      </header>

      <main className="biblioteca">
        {!almacenamientoDisponible && (
          <p className="aviso" role="status">
            Este navegador no permite guardar datos. Lo que añadas se perderá al cerrar: haz una copia en «Copias».
          </p>
        )}

        {personajes.length === 0 ? (
          <div className="vacio">
            <h2>Pon música a tus personajes</h2>
            <p>
              Añade un personaje y pega el enlace de su canción de Spotify o YouTube. Durante la partida, pulsa su nombre y
              sonará.
            </p>
            <button type="button" className="boton boton-principal" onClick={() => setEditando(null)}>
              Añadir el primer personaje
            </button>
          </div>
        ) : grupos.length === 0 ? (
          <p className="vacio-corto">Ningún personaje coincide con «{busqueda}». Prueba con otro nombre o pulsa Esc para ver todos.</p>
        ) : (
          grupos.map(([grupo, lista], i) => (
            <section key={grupo} className="grupo" aria-labelledby={`g-${i}`}>
              <h2 id={`g-${i}`}>{grupo}</h2>
              <ul className="tarjetas">
                {lista.map((p) => (
                  <Tarjeta key={p.id} personaje={p} alEditar={() => setEditando(p)} />
                ))}
              </ul>
            </section>
          ))
        )}
      </main>

      <Reproductor />

      {editando !== undefined && <Editor personaje={editando} alCerrar={() => setEditando(undefined)} />}
      {copias && <Copias alCerrar={() => setCopias(false)} />}
    </div>
  )
}
