import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { carpetaDe, carpetasDe, crearCarpeta, eliminarCarpeta, moverACarpeta, moverCarpeta, renombrarCarpeta, sinCarpeta, useCarpetasCerradas } from '../../data/carpetas'
import { useDatos } from '../../data/store'
import type { Carpeta, CarpetaTematica, Elemento } from '../../data/types'
import { BotonConfirmar } from '../Confirmar'
import { ListaTarjetas } from '../ListaTarjetas'
import type { Soltar } from '../ordenar'

/**
 * Una categoría de Main con sus carpetas temáticas desplegables («Xanathar», «Drama»…) y «Sin carpeta».
 * Sin carpetas creadas se ve igual que siempre. Organizar nunca reproduce ni corta nada.
 */
export function SeccionMain({
  carpeta,
  elementos,
  buscando,
  alAnadir,
  alEditar,
  alGuardar,
}: {
  carpeta: Carpeta
  /** Tarjetas visibles de la categoría (ya filtradas por la búsqueda y en su orden). */
  elementos: Elemento[]
  buscando: boolean
  alAnadir: (carpetaId: string | null) => void
  alEditar: (e: Elemento) => void
  alGuardar: (m: string) => void
}) {
  const tipo = carpeta.tipo
  const todas = useDatos((s) => s.carpetas)
  const rel = useDatos((s) => s.carpeta_elementos)
  const sinCarpetas = useDatos((s) => s.sinCarpetas)
  const { cerradas, alternar } = useCarpetasCerradas()
  const [creando, setCreando] = useState(false)
  const lista = useMemo(() => carpetasDe(tipo, todas), [tipo, todas])
  const grupos = useMemo(() => {
    const de = new Map(elementos.map((e) => [e.id, carpetaDe(e, rel, todas)]))
    return {
      carpetas: lista.map((c) => ({ c, tarjetas: elementos.filter((e) => de.get(e.id) === c.id) })),
      sin: elementos.filter((e) => de.get(e.id) === null),
    }
  }, [elementos, lista, rel, todas])

  if (buscando && elementos.length === 0) return null
  const id = `carpeta-${tipo}`
  const conCarpetas = lista.length > 0
  const soltar = (grupo: string): Soltar => ({
    grupo,
    alSoltar: (el, destino) => void moverACarpeta([el], destino.startsWith('sin-') ? null : destino, tipo),
  })

  return (
    <section className={`seccion seccion-${tipo}`} aria-labelledby={id} data-con-carpetas={conCarpetas || undefined}>
      <div className="seccion-cabecera">
        <h2 id={id}>
          {carpeta.titulo}
          {elementos.length > 0 && <span className="seccion-cuenta">{elementos.length}</span>}
        </h2>
        <div className="seccion-botones">
          {!buscando && (
            <button type="button" className="boton boton-pequeno boton-sutil boton-carpeta" onClick={() => setCreando(true)} aria-expanded={creando}>
              <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
                <path d="M3 6a1.5 1.5 0 0 1 1.5-1.5h4.4l2 2h8.6A1.5 1.5 0 0 1 21 8v10.5a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18.5ZM12 10.5v6M9 13.5h6" />
              </svg>
              Nueva carpeta
            </button>
          )}
          {(elementos.length > 0 || conCarpetas) && (
            <button type="button" className="boton boton-pequeno" onClick={() => alAnadir(null)}>
              {carpeta.nuevo}
            </button>
          )}
        </div>
      </div>

      {creando && (
        <NuevaCarpeta
          etiqueta={`Nueva carpeta en ${carpeta.titulo}`}
          alCrear={async (nombre) => {
            const c = await crearCarpeta(tipo, nombre)
            if (c) alGuardar(`Carpeta «${c.nombre}» creada en ${carpeta.titulo}. Arrastra tarjetas a ella o usa «Mover a carpeta».`)
            setCreando(false)
          }}
          alCancelar={() => setCreando(false)}
        />
      )}

      {!conCarpetas ? (
        elementos.length === 0 ? (
          <button type="button" className="seccion-vacia" onClick={() => alAnadir(null)}>
            <span className="seccion-vacia-accion">{carpeta.nuevo}</span>
            <span className="seccion-vacia-texto">{carpeta.vacio}</span>
          </button>
        ) : (
          <ListaTarjetas tipo={tipo} elementos={elementos} reordenable={!buscando} alEditar={alEditar} />
        )
      ) : (
        <div className="carpetas">
          {grupos.carpetas.map(({ c, tarjetas }, i) =>
            buscando && tarjetas.length === 0 ? null : (
              <Grupo
                key={c.id}
                carpeta={c}
                nombre={c.nombre}
                clave={c.id}
                tipo={carpeta}
                tarjetas={tarjetas}
                abierta={buscando || !cerradas.includes(c.id)}
                alAlternar={() => alternar(c.id)}
                buscando={buscando}
                soltar={soltar(c.id)}
                primera={i === 0}
                ultima={i === lista.length - 1}
                alAnadir={() => alAnadir(c.id)}
                alEditar={alEditar}
                alGuardar={alGuardar}
              />
            ),
          )}
          {!(buscando && grupos.sin.length === 0) && (
            <Grupo
              nombre="Sin carpeta"
              clave={sinCarpeta(tipo)}
              tipo={carpeta}
              tarjetas={grupos.sin}
              abierta={buscando || !cerradas.includes(sinCarpeta(tipo))}
              alAlternar={() => alternar(sinCarpeta(tipo))}
              buscando={buscando}
              soltar={soltar(sinCarpeta(tipo))}
              alAnadir={() => alAnadir(null)}
              alEditar={alEditar}
              alGuardar={alGuardar}
            />
          )}
        </div>
      )}
      {sinCarpetas && creando && <p className="aviso-suave">{sinCarpetas}</p>}
    </section>
  )
}

function NuevaCarpeta({ etiqueta, inicial = '', alCrear, alCancelar }: { etiqueta: string; inicial?: string; alCrear: (n: string) => Promise<void>; alCancelar: () => void }) {
  const [nombre, setNombre] = useState(inicial)
  const [ocupado, setOcupado] = useState(false)
  const enviar = async (e: FormEvent) => {
    e.preventDefault()
    if (!nombre.trim() || ocupado) return
    setOcupado(true)
    await alCrear(nombre)
    setOcupado(false)
  }
  return (
    <form className="carpeta-form" onSubmit={(e) => void enviar(e)} onKeyDown={(e) => e.key === 'Escape' && (e.stopPropagation(), alCancelar())}>
      <label className="sr" htmlFor={`nc-${etiqueta}`}>
        {etiqueta}
      </label>
      <input id={`nc-${etiqueta}`} value={nombre} maxLength={60} autoFocus autoComplete="off" placeholder="Nombre de la carpeta" onChange={(e) => setNombre(e.target.value)} />
      <button type="submit" className="boton boton-pequeno boton-principal" disabled={!nombre.trim() || ocupado}>
        {inicial ? 'Guardar' : 'Crear carpeta'}
      </button>
      <button type="button" className="boton boton-pequeno boton-sutil" onClick={alCancelar}>
        Cancelar
      </button>
    </form>
  )
}

function Grupo({
  carpeta,
  nombre,
  clave,
  tipo,
  tarjetas,
  abierta,
  alAlternar,
  buscando,
  soltar,
  primera,
  ultima,
  alAnadir,
  alEditar,
  alGuardar,
}: {
  /** null = «Sin carpeta». */
  carpeta?: CarpetaTematica
  nombre: string
  clave: string
  tipo: Carpeta
  tarjetas: Elemento[]
  abierta: boolean
  alAlternar: () => void
  buscando: boolean
  soltar: Soltar
  primera?: boolean
  ultima?: boolean
  alAnadir: () => void
  alEditar: (e: Elemento) => void
  alGuardar: (m: string) => void
}) {
  const [renombrando, setRenombrando] = useState(false)
  const menu = useRef<HTMLDetailsElement>(null)
  const [menuAbierto, setMenuAbierto] = useState(false)
  const cerrarMenu = () => menu.current?.removeAttribute('open')
  // El menú se cierra al tocar fuera o con Esc (y el foco vuelve a su botón).
  useEffect(() => {
    if (!menuAbierto) return
    const fuera = (e: PointerEvent) => !menu.current?.contains(e.target as Node) && cerrarMenu()
    const esc = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      cerrarMenu()
      menu.current?.querySelector('summary')?.focus()
    }
    document.addEventListener('pointerdown', fuera)
    document.addEventListener('keydown', esc, true)
    return () => {
      document.removeEventListener('pointerdown', fuera)
      document.removeEventListener('keydown', esc, true)
    }
  }, [menuAbierto])
  const cuerpo = `grupo-${clave}`
  const n = tarjetas.length
  // «Sin carpeta» vacía: una fila compacta (sigue siendo destino al arrastrar), sin cuerpo que desplegar.
  const filaVacia = !carpeta && n === 0
  const verCuerpo = abierta && !filaVacia
  return (
    <div
      className="carpeta"
      data-soltar={clave}
      data-soltar-tipo={tipo.tipo}
      data-soltar-nombre={nombre}
      data-abierta={verCuerpo || undefined}
      data-sin={carpeta ? undefined : true}
      data-vacia={n === 0 || undefined}
    >
      <div className="carpeta-cabecera">
        {renombrando && carpeta ? (
          <NuevaCarpeta
            etiqueta={`Nuevo nombre de ${carpeta.nombre}`}
            inicial={carpeta.nombre}
            alCrear={async (nuevo) => {
              if (await renombrarCarpeta(carpeta.id, nuevo)) alGuardar(`Carpeta renombrada: «${nuevo.trim()}».`)
              setRenombrando(false)
            }}
            alCancelar={() => setRenombrando(false)}
          />
        ) : (
          <button
            type="button"
            className="carpeta-alternar"
            aria-expanded={filaVacia ? undefined : abierta}
            aria-controls={filaVacia ? undefined : cuerpo}
            disabled={buscando || filaVacia}
            onClick={alAlternar}
          >
            <svg className="carpeta-flecha" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
              <path d="M6 3.5 10.5 8 6 12.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <svg className="carpeta-icono" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
              {verCuerpo ? (
                <path d="M3 7.5V6a1.5 1.5 0 0 1 1.5-1.5h4.4l2 2h8.6A1.5 1.5 0 0 1 21 8v1.5M3.2 19.5l2.3-8.6A1.5 1.5 0 0 1 7 9.8h14.1a1 1 0 0 1 1 1.3l-2.2 7.6a1.5 1.5 0 0 1-1.4 1.1H4.5A1.5 1.5 0 0 1 3 18.3V7.5" />
              ) : (
                <path d="M3 6a1.5 1.5 0 0 1 1.5-1.5h4.4l2 2h8.6A1.5 1.5 0 0 1 21 8v10.5a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18.5Z" />
              )}
            </svg>
            <span className="carpeta-nombre">{nombre}</span>
            <span className="carpeta-cuenta">
              {n}
              <span className="sr">{n === 1 ? ' tarjeta' : ' tarjetas'}</span>
            </span>
          </button>
        )}
        {carpeta && !renombrando && !buscando && (
          <details className="carpeta-menu" ref={menu} onToggle={(e) => setMenuAbierto(e.currentTarget.open)}>
            <summary aria-label={`Opciones de la carpeta ${nombre}`} title="Opciones de la carpeta">
              <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="currentColor">
                <circle cx="5" cy="12" r="1.8" />
                <circle cx="12" cy="12" r="1.8" />
                <circle cx="19" cy="12" r="1.8" />
              </svg>
            </summary>
            <div className="carpeta-menu-lista">
              <button type="button" onClick={() => (cerrarMenu(), alAnadir())}>
                {tipo.nuevo} aquí
              </button>
              <button type="button" onClick={() => (cerrarMenu(), setRenombrando(true))}>
                Renombrar
              </button>
              <button type="button" disabled={primera} onClick={() => (cerrarMenu(), void moverCarpeta(carpeta.id, -1))}>
                Subir
              </button>
              <button type="button" disabled={ultima} onClick={() => (cerrarMenu(), void moverCarpeta(carpeta.id, 1))}>
                Bajar
              </button>
              <BotonConfirmar
                className="carpeta-menu-peligro"
                etiqueta="Eliminar carpeta"
                pregunta={`¿Eliminar la carpeta «${nombre}»? ${n === 1 ? 'Su tarjeta pasará' : `Sus ${n} tarjetas pasarán`} a «Sin carpeta». No se borra ninguna tarjeta, sonido ni sesión.`}
                opciones={[
                  {
                    etiqueta: 'Eliminar carpeta',
                    peligro: true,
                    accion: () => {
                      cerrarMenu()
                      void eliminarCarpeta(carpeta.id).then((ok) => ok && alGuardar(`Carpeta «${nombre}» eliminada. Sus tarjetas están en «Sin carpeta».`))
                    },
                  },
                ]}
              />
            </div>
          </details>
        )}
        {filaVacia && !buscando && <span className="carpeta-pista">Suelta aquí una tarjeta para sacarla de su carpeta</span>}
      </div>
      {verCuerpo && (
        <div className="carpeta-cuerpo" id={cuerpo}>
          {n > 0 ? (
            <ListaTarjetas tipo={tipo.tipo} elementos={tarjetas} reordenable={!buscando} soltar={soltar} alEditar={alEditar} />
          ) : carpeta ? (
            <p className="carpeta-vacia">
              Carpeta vacía. Arrastra tarjetas aquí por su asa o{' '}
              <button type="button" className="enlace" onClick={alAnadir}>
                {tipo.nuevo.toLowerCase()}
              </button>
              .
            </p>
          ) : null}
        </div>
      )}
    </div>
  )
}
