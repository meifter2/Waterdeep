import { useRef, useState } from 'react'
import { claveEnlace } from '../../data/convertir'
import { useDatos } from '../../data/store'
import type { Recurso } from '../../data/types'
import { ErrorArchivo, validarAudio } from '../../lib/archivos'
import { AYUDA_ENLACE, describirEnlace, interpretarEnlace } from '../../lib/enlaces'
import { tituloDe } from '../../lib/titulo'
import type { FuenteNueva } from '../../data/guardar'

type Modo = 'enlace' | 'archivo' | 'biblioteca'

export type Anadido = { recurso: Recurso } | { nueva: FuenteNueva; titulo: string }

/** Panel para añadir sonidos a un elemento: enlace, archivo propio o de la biblioteca. */
export function AnadirPista({ alAnadir }: { alAnadir: (a: Anadido) => void }) {
  const recursos = useDatos((s) => s.recursos)
  const [modo, setModo] = useState<Modo>('enlace')
  const [enlace, setEnlace] = useState('')
  const [buscando, setBuscando] = useState(false)
  const [busqueda, setBusqueda] = useState('')
  const [mensaje, setMensaje] = useState<{ ok: boolean; texto: string } | null>(null)
  const archivo = useRef<HTMLInputElement>(null)

  const interpretado = enlace.trim() ? interpretarEnlace(enlace) : null
  const errorEnlace = typeof interpretado === 'string' ? interpretado : ''

  const anadirEnlace = async () => {
    if (!interpretado || typeof interpretado === 'string') return
    const clave = claveEnlace(enlace)
    const ya = recursos.find((r) => r.origen !== 'archivo' && claveEnlace(r.enlace) === clave)
    if (ya) {
      alAnadir({ recurso: ya })
      setMensaje({ ok: true, texto: `«${ya.titulo || 'Ese sonido'}» ya estaba en tu biblioteca: se reutiliza.` })
    } else {
      setBuscando(true)
      const titulo = (await tituloDe(interpretado)) ?? ''
      setBuscando(false)
      alAnadir({ nueva: { tipo: 'enlace', enlace: enlace.trim() }, titulo })
      setMensaje({ ok: true, texto: 'Añadida. Se guardará al pulsar «Guardar».' })
    }
    setEnlace('')
  }

  const anadirArchivos = (lista: FileList | null) => {
    if (!lista?.length) return
    const errores: string[] = []
    let n = 0
    for (const f of Array.from(lista)) {
      try {
        validarAudio(f)
        alAnadir({ nueva: { tipo: 'archivo', archivo: f }, titulo: f.name.replace(/\.[^.]+$/, '') })
        n++
      } catch (e) {
        errores.push(e instanceof ErrorArchivo ? e.message : `No se ha podido leer «${f.name}».`)
      }
    }
    setMensaje(
      errores.length
        ? { ok: false, texto: errores.join(' ') }
        : { ok: true, texto: `${n === 1 ? 'Archivo añadido' : `${n} archivos añadidos`}. Se subirán al pulsar «Guardar».` },
    )
  }

  const q = busqueda.trim().toLocaleLowerCase('es')
  const encontrados = recursos
    .filter((r) => !q || [r.titulo, r.archivo_nombre, r.descripcion].some((v) => v.toLocaleLowerCase('es').includes(q)))
    .sort((a, b) => (a.titulo || a.archivo_nombre).localeCompare(b.titulo || b.archivo_nombre, 'es'))
    .slice(0, 40)

  return (
    <div className="anadir-pista">
      <div className="segmentado" role="group" aria-label="Cómo añadir el sonido">
        {(
          [
            ['enlace', 'Enlace'],
            ['archivo', 'Archivo propio'],
            ['biblioteca', 'De la biblioteca'],
          ] as [Modo, string][]
        ).map(([m, t]) => (
          <button key={m} type="button" aria-pressed={modo === m} onClick={() => (setModo(m), setMensaje(null))}>
            {t}
          </button>
        ))}
      </div>

      {modo === 'enlace' && (
        <div className="anadir-fila">
          <div className="campo">
            <label htmlFor="nuevo-enlace">Enlace de Spotify o YouTube</label>
            <input
              id="nuevo-enlace"
              value={enlace}
              inputMode="url"
              autoComplete="off"
              placeholder="https://open.spotify.com/track/…"
              onChange={(e) => setEnlace(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), void anadirEnlace())}
              aria-invalid={errorEnlace ? true : undefined}
              aria-describedby="nuevo-enlace-ayuda"
            />
            <p id="nuevo-enlace-ayuda" className={errorEnlace ? 'error' : interpretado ? 'deteccion' : 'ayuda'}>
              {errorEnlace || (interpretado && typeof interpretado !== 'string' ? `Enlace correcto: ${describirEnlace(interpretado)}.` : AYUDA_ENLACE)}
            </p>
          </div>
          <button type="button" className="boton" disabled={!interpretado || !!errorEnlace || buscando} onClick={() => void anadirEnlace()}>
            {buscando ? 'Añadiendo…' : 'Añadir enlace'}
          </button>
        </div>
      )}

      {modo === 'archivo' && (
        <div className="anadir-fila">
          <p className="ayuda-normal">MP3, M4A, OGG, WAV, WEBM o FLAC. Máximo 50 MB por archivo. Si ya lo subiste antes, se reutiliza.</p>
          <button type="button" className="boton" onClick={() => archivo.current?.click()}>
            Elegir archivos
          </button>
          <input
            ref={archivo}
            type="file"
            accept="audio/*,.mp3,.m4a,.ogg,.opus,.wav,.webm,.flac"
            multiple
            hidden
            aria-label="Archivos de audio"
            onChange={(e) => {
              anadirArchivos(e.target.files)
              e.target.value = ''
            }}
          />
        </div>
      )}

      {modo === 'biblioteca' && (
        <div className="anadir-biblioteca">
          {recursos.length === 0 ? (
            <p className="ayuda-normal">Tu biblioteca aún está vacía. Añade un enlace o un archivo.</p>
          ) : (
            <>
              <label className="sr" htmlFor="buscar-sonido">
                Buscar en la biblioteca
              </label>
              <input id="buscar-sonido" type="search" placeholder="Buscar sonido" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />
              <ul className="lista-sonidos">
                {encontrados.map((r) => (
                  <li key={r.id}>
                    <span className="sonido-origen" data-origen={r.origen} />
                    <span className="sonido-titulo">{r.titulo || r.archivo_nombre || 'Sin título'}</span>
                    <button type="button" className="boton boton-pequeno" onClick={() => (alAnadir({ recurso: r }), setMensaje({ ok: true, texto: `«${r.titulo || 'Sonido'}» añadido.` }))}>
                      Añadir
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}

      {mensaje && (
        <p className={mensaje.ok ? 'deteccion' : 'error'} role="status">
          {mensaje.texto}
        </p>
      )}
    </div>
  )
}
