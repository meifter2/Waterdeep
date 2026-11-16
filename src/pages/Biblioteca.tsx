import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { Copias } from '../components/Copias'
import { Cuenta } from '../components/Cuenta'
import { Editor } from '../components/Editor'
import { Migracion } from '../components/Migracion'
import { Reproductor } from '../components/reproductor/Reproductor'
import { Seccion } from '../components/Seccion'
import { useReproduccion } from '../data/reproduccion'
import { almacenamientoDisponible } from '../data/storage'
import { useDatos } from '../data/store'
import { CARPETAS, type Cancion, type Tipo } from '../data/types'
import { interpretarEnlace } from '../lib/enlaces'
import { modoLocal } from '../lib/supabase'

type Edicion = { cancion: Cancion | null; tipo: Tipo } | null

/** Pantalla principal: carpetas con sus tarjetas y el reproductor abajo. */
export function Biblioteca() {
  const { canciones, carga, error, limpiarError } = useDatos()
  const reproducir = useReproduccion((s) => s.reproducir)
  const [busqueda, setBusqueda] = useState('')
  const [edicion, setEdicion] = useState<Edicion>(null)
  const [copias, setCopias] = useState(false)
  const buscador = useRef<HTMLInputElement>(null)

  // «/» enfoca el buscador desde cualquier parte.
  useEffect(() => {
    const alPulsar = (e: globalThis.KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (e.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName)) {
        e.preventDefault()
        buscador.current?.focus()
      }
    }
    window.addEventListener('keydown', alPulsar)
    return () => window.removeEventListener('keydown', alPulsar)
  }, [])

  const q = busqueda.trim().toLocaleLowerCase('es')
  const porCarpeta = useMemo(() => {
    const filtradas = canciones
      .filter((c) => !q || [c.nombre, c.nota].some((v) => v.toLocaleLowerCase('es').includes(q)))
      .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
    return CARPETAS.map((carpeta) => ({ carpeta, lista: filtradas.filter((c) => c.tipo === carpeta.tipo) }))
  }, [canciones, q])

  const primera = porCarpeta.flatMap((g) => g.lista).find((c) => typeof interpretarEnlace(c.enlace) !== 'string')

  const alTeclear = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && primera) reproducir(primera.id)
    if (e.key === 'Escape') setBusqueda('')
  }

  const seccion = (i: number) => {
    const { carpeta, lista } = porCarpeta[i]
    return (
      <Seccion
        key={carpeta.tipo}
        carpeta={carpeta}
        canciones={lista}
        buscando={!!q}
        alAnadir={() => setEdicion({ cancion: null, tipo: carpeta.tipo })}
        alEditar={(c) => setEdicion({ cancion: c, tipo: c.tipo })}
      />
    )
  }
  const sinResultados = q && porCarpeta.every((g) => g.lista.length === 0)

  return (
    <div className="app">
      <header className="cabecera">
        <div className="cabecera-marca">
          <h1>Banda sonora</h1>
          {canciones.length > 0 && <p>{canciones.length === 1 ? '1 canción' : `${canciones.length} canciones`}</p>}
        </div>
        <div className="cabecera-acciones">
          {canciones.length > 0 && (
            <div className="buscador">
              <label className="sr" htmlFor="buscar">
                Buscar canción
              </label>
              <input
                id="buscar"
                ref={buscador}
                type="search"
                placeholder="Buscar"
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
          <button type="button" className="boton" onClick={() => setCopias(true)}>
            Copias
          </button>
          <Cuenta />
        </div>
      </header>

      <main className="biblioteca" aria-busy={carga === 'cargando'}>
        {error && (
          <div className="aviso" role="alert">
            <p>{error}</p>
            {carga !== 'error' && (
              <button type="button" className="enlace" onClick={limpiarError}>
                Cerrar aviso
              </button>
            )}
          </div>
        )}
        {modoLocal && almacenamientoDisponible && (
          <p className="aviso-suave">Modo local: las canciones se guardan solo en este navegador.</p>
        )}
        {carga === 'lista' && <Migracion />}

        {carga === 'cargando' ? (
          <p className="cargando">Cargando tus canciones…</p>
        ) : carga === 'error' ? null : sinResultados ? (
          <p className="vacio-corto">Nada coincide con «{busqueda}». Prueba con otro nombre o pulsa Esc para ver todo.</p>
        ) : (
          <>
            <div className="bordes-sesion">
              {seccion(0)}
              {seccion(1)}
            </div>
            {seccion(2)}
            {seccion(3)}
            {seccion(4)}
          </>
        )}
      </main>

      <Reproductor />

      {edicion && <Editor cancion={edicion.cancion} tipoInicial={edicion.tipo} alCerrar={() => setEdicion(null)} />}
      {copias && <Copias alCerrar={() => setCopias(false)} />}
    </div>
  )
}
