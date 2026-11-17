import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { BibliotecaSonidos } from '../components/BibliotecaSonidos'
import { Compartido } from '../components/Compartido'
import { ConexionSpotify } from '../components/ConexionSpotify'
import { Copias } from '../components/Copias'
import { Cuenta } from '../components/Cuenta'
import { EditorElemento } from '../components/editor/EditorElemento'
import { Instalar } from '../components/Instalar'
import { Migracion } from '../components/Migracion'
import { Reproductor } from '../components/reproductor/Reproductor'
import { Seccion } from '../components/Seccion'
import { useReproduccion } from '../data/reproduccion'
import { almacenamientoDisponible } from '../data/storage'
import { useDatos } from '../data/store'
import { CARPETAS, type Elemento, type Tipo } from '../data/types'
import { tomarCompartido, type Compartido as DatosCompartidos } from '../lib/compartir'
import { useSpotify } from '../lib/spotifyAuth'
import { modoLocal } from '../lib/supabase'

type Edicion = { elemento: Elemento | null; tipo: Tipo } | null

/** Pantalla principal: carpetas con sus tarjetas y el reproductor abajo. */
export function Biblioteca() {
  const { elementos, recursos, pistas, carga, error, limpiarError } = useDatos()
  const pulsarElemento = useReproduccion((s) => s.pulsarElemento)
  const errorSpotify = useSpotify((s) => s.error)
  const [busqueda, setBusqueda] = useState('')
  const [edicion, setEdicion] = useState<Edicion>(null)
  const [dialogo, setDialogo] = useState<'copias' | 'sonidos' | null>(null)
  const [compartido, setCompartido] = useState<DatosCompartidos | null>(null)
  const [hecho, setHecho] = useState('')
  const buscador = useRef<HTMLInputElement>(null)

  // Sonido compartido desde otra app: se abre su ventana con el enlace ya puesto.
  useEffect(() => {
    if (carga !== 'lista') return
    const c = tomarCompartido()
    if (c) setCompartido(c)
  }, [carga])

  useEffect(() => {
    if (!hecho) return
    const t = setTimeout(() => setHecho(''), 4000)
    return () => clearTimeout(t)
  }, [hecho])

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
    const coincide = (e: Elemento) => {
      if (!q) return true
      const textos = [e.nombre, e.descripcion]
      for (const p of pistas)
        if (p.elemento_id === e.id) textos.push(p.etiqueta, recursos.find((r) => r.id === p.recurso_id)?.titulo ?? '')
      return textos.some((v) => v.toLocaleLowerCase('es').includes(q))
    }
    const filtrados = elementos.filter(coincide).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
    return CARPETAS.map((carpeta) => ({ carpeta, lista: filtrados.filter((e) => e.tipo === carpeta.tipo) }))
  }, [elementos, pistas, recursos, q])

  const alTeclear = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      const primero = porCarpeta.flatMap((g) => g.lista).find((el) => pistas.some((p) => p.elemento_id === el.id))
      if (primero) pulsarElemento(primero.id)
    }
    if (e.key === 'Escape') setBusqueda('')
  }

  const seccion = (i: number) => {
    const { carpeta, lista } = porCarpeta[i]
    return (
      <Seccion
        key={carpeta.tipo}
        carpeta={carpeta}
        elementos={lista}
        buscando={!!q}
        alAnadir={() => setEdicion({ elemento: null, tipo: carpeta.tipo })}
        alEditar={(el) => setEdicion({ elemento: el, tipo: el.tipo })}
      />
    )
  }
  const sinResultados = q && porCarpeta.every((g) => g.lista.length === 0)

  return (
    <div className="app">
      <header className="cabecera">
        <div className="cabecera-marca">
          <h1>Banda sonora</h1>
          {elementos.length > 0 && (
            <p>
              {elementos.length === 1 ? '1 elemento' : `${elementos.length} elementos`}, {recursos.length === 1 ? '1 sonido' : `${recursos.length} sonidos`}
            </p>
          )}
        </div>
        <div className="cabecera-acciones">
          {elementos.length > 0 && (
            <div className="buscador">
              <label className="sr" htmlFor="buscar">
                Buscar
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
          <Instalar />
          <ConexionSpotify />
          <button type="button" className="boton" onClick={() => setDialogo('sonidos')}>
            Sonidos
          </button>
          <button type="button" className="boton" onClick={() => setDialogo('copias')}>
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
        {errorSpotify && (
          <div className="aviso" role="alert">
            <p>{errorSpotify}</p>
            <button type="button" className="enlace" onClick={() => useSpotify.setState({ error: '' })}>
              Cerrar aviso
            </button>
          </div>
        )}
        {hecho && (
          <p className="aviso aviso-ok aviso-flotante" role="status">
            {hecho}
          </p>
        )}
        {modoLocal && almacenamientoDisponible && <p className="aviso-suave">Modo local: todo se guarda solo en este navegador.</p>}
        {carga === 'lista' && <Migracion />}

        {carga === 'cargando' ? (
          <p className="cargando">Cargando tu biblioteca…</p>
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
            <div className="bordes-sesion">
              {seccion(5)}
              {seccion(6)}
            </div>
          </>
        )}
      </main>

      <Reproductor />

      {edicion && <EditorElemento elemento={edicion.elemento} tipoInicial={edicion.tipo} alCerrar={() => setEdicion(null)} alGuardar={setHecho} />}
      {compartido && (
        <Compartido enlaceInicial={compartido.enlace} textoInicial={compartido.texto} alCerrar={() => setCompartido(null)} alGuardar={setHecho} />
      )}
      {dialogo === 'copias' && <Copias alCerrar={() => setDialogo(null)} />}
      {dialogo === 'sonidos' && <BibliotecaSonidos alCerrar={() => setDialogo(null)} />}
    </div>
  )
}
