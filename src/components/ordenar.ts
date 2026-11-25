import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { useDatos } from '../data/store'
import type { Tipo } from '../data/types'

// Reordenar las tarjetas de una carpeta (arrastrar y soltar con ratón, dedo o lápiz, y teclado).
// - Solo se arrastra desde el asa: tocar la tarjeta sigue reproduciendo y el resto de la tarjeta deja desplazar
//   la página en el móvil (el asa es la única zona con touch-action: none).
// - Mientras se mueve, la tarjeta deja un hueco donde caerá y una copia flotante sigue al puntero.
// - Teclado (en el asa): espacio/Intro coge, flechas mueven, espacio/Intro suelta, Esc cancela; se anuncia la posición.
// - Al soltar se guarda el orden (store.reordenar); si falla, se restaura el anterior y se avisa.
// - Dentro de su lista solo reordena. Con `soltar` (Main con carpetas temáticas), soltarla sobre OTRO grupo de la misma
//   categoría (cabecera o tarjetas de una carpeta, aunque esté cerrada, o «Sin carpeta») la mueve a ese grupo.
//   Nunca cambia de categoría.

const UMBRAL_PX = 5

export interface Fantasma {
  id: string
  nombre: string
  x: number
  y: number
  ancho: number
  alto: number
}

interface Gesto {
  id: string
  nombre: string
  pointerId: number
  inicioX: number
  inicioY: number
  dx: number
  dy: number
  ancho: number
  alto: number
  moviendo: boolean
  /** Grupo de destino (otra carpeta) bajo el puntero, si lo hay. */
  zona: string | null
}

/** Opciones para mover entre grupos (carpetas temáticas). */
export interface Soltar {
  /** Grupo de esta lista (valor de `data-soltar` de su contenedor). */
  grupo: string
  alSoltar: (id: string, grupo: string) => void
}

let resaltada: HTMLElement | null = null
const resaltar = (el: HTMLElement | null) => {
  if (resaltada === el) return
  resaltada?.removeAttribute('data-encima')
  resaltada = el
  el?.setAttribute('data-encima', 'true')
}

/** Grupo de destino bajo el puntero: otro contenedor `data-soltar` de la misma categoría. */
function zonaEn(x: number, y: number, tipo: Tipo, propio: string): HTMLElement | null {
  for (const el of document.elementsFromPoint(x, y)) {
    const z = el.closest<HTMLElement>('[data-soltar]')
    if (z) return z.dataset.soltarTipo === tipo && z.dataset.soltar !== propio ? z : null
  }
  return null
}

const mover = (lista: string[], id: string, destino: number) => {
  const sin = lista.filter((x) => x !== id)
  sin.splice(Math.max(0, Math.min(destino, sin.length)), 0, id)
  return sin
}

export function useOrdenar(ids: string[], tipo: Tipo, nombres: Record<string, string>, soltar?: Soltar) {
  const [vista, setVista] = useState<string[] | null>(null)
  const [fantasma, setFantasma] = useState<Fantasma | null>(null)
  const [levantada, setLevantada] = useState<string | null>(null)
  const [anuncio, setAnuncio] = useState('')
  const lista = useRef<HTMLUListElement>(null)
  const gesto = useRef<Gesto | null>(null)
  const orden = vista ?? ids
  const ordenRef = useRef(orden)
  ordenRef.current = orden

  const guardar = useCallback(
    async (nuevo: string[]) => {
      const cambia = nuevo.some((id, i) => id !== ids[i])
      setVista(null)
      if (cambia) await useDatos.getState().reordenar(tipo, nuevo)
    },
    [ids, tipo],
  )

  const guardarRef = useRef(guardar)
  guardarRef.current = guardar

  const soltarRef = useRef(soltar)
  soltarRef.current = soltar

  const cancelar = useCallback(() => {
    resaltar(null)
    gesto.current = null
    setFantasma(null)
    setVista(null)
    setLevantada(null)
  }, [])

  // Esc cancela un arrastre con el puntero.
  useEffect(() => {
    if (!fantasma) return
    const alPulsar = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        cancelar()
        setAnuncio('Movimiento cancelado.')
      }
    }
    window.addEventListener('keydown', alPulsar, true)
    return () => window.removeEventListener('keydown', alPulsar, true)
  }, [fantasma, cancelar])

  /** Posición de destino según el puntero, entre las demás tarjetas de esta lista (orden de lectura). */
  const destinoEn = (x: number, y: number, id: string) => {
    const caja = (o: string) => lista.current?.querySelector<HTMLElement>(`[data-elemento="${o}"]`)?.getBoundingClientRect()
    const dentro = (c: DOMRect) => x >= c.left && x <= c.right && y >= c.top && y <= c.bottom
    // Sobre su propio hueco: se queda donde está (sin saltos).
    const propia = caja(id)
    const actual = ordenRef.current.indexOf(id)
    if (propia && dentro(propia)) return actual
    const otras = ordenRef.current.filter((o) => o !== id)
    const cajas = otras.map(caja).filter((c): c is DOMRect => !!c)
    if (!cajas.length) return 0
    // La tarjeta más cercana al puntero (distancia al rectángulo: 0 si está encima), y a igualdad, al centro.
    const distancia = (c: DOMRect) => Math.hypot(Math.max(c.left - x, 0, x - c.right), Math.max(c.top - y, 0, y - c.bottom))
    let mejor = 0
    cajas.forEach((c, i) => {
      const d = distancia(c)
      const dm = distancia(cajas[mejor])
      const centro = (k: DOMRect) => Math.hypot(x - (k.left + k.width / 2), y - (k.top + k.height / 2))
      if (d < dm || (d === dm && centro(c) < centro(cajas[mejor]))) mejor = i
    })
    const c = cajas[mejor]
    const mismaFila = y >= c.top && y <= c.bottom
    const antes = mismaFila ? x < c.left + c.width / 2 : y < c.top + c.height / 2
    return antes ? mejor : mejor + 1
  }

  const asa = (id: string) => ({
    'data-asa': id,
    'aria-pressed': levantada === id,
    onPointerDown: (e: PointerEvent<HTMLButtonElement>) => {
      if (e.button !== 0 || levantada || gesto.current) return
      const li = lista.current?.querySelector<HTMLElement>(`[data-elemento="${id}"]`)
      if (!li) return
      const c = li.getBoundingClientRect()
      const g: Gesto = { id, nombre: nombres[id] ?? '', pointerId: e.pointerId, inicioX: e.clientX, inicioY: e.clientY, dx: e.clientX - c.left, dy: e.clientY - c.top, ancho: c.width, alto: c.height, moviendo: false, zona: null }
      gesto.current = g
      // El movimiento y el soltar se escuchan en la ventana: al reordenarse la lista, la tarjeta puede moverse en el
      // documento y perder la «captura» del puntero; así el gesto nunca se queda enganchado.
      const mueve = (ev: globalThis.PointerEvent) => {
        if (gesto.current !== g || ev.pointerId !== g.pointerId) return
        if (!g.moviendo) {
          if (Math.hypot(ev.clientX - g.inicioX, ev.clientY - g.inicioY) < UMBRAL_PX) return
          g.moviendo = true
          setVista(ordenRef.current)
          setAnuncio(`Moviendo ${g.nombre}.`)
        }
        ev.preventDefault()
        setFantasma({ id: g.id, nombre: g.nombre, x: ev.clientX - g.dx, y: ev.clientY - g.dy, ancho: g.ancho, alto: g.alto })
        const s = soltarRef.current
        const zona = s ? zonaEn(ev.clientX, ev.clientY, tipo, s.grupo) : null
        if (zona) {
          // Sobre otra carpeta: la lista propia vuelve a su orden y se resalta el destino.
          if (g.zona !== zona.dataset.soltar) setAnuncio(`Soltar en ${zona.dataset.soltarNombre ?? 'otra carpeta'}.`)
          g.zona = zona.dataset.soltar ?? null
          resaltar(zona)
          setVista(ids)
        } else {
          g.zona = null
          resaltar(null)
          const destino = destinoEn(ev.clientX, ev.clientY, g.id)
          setVista((v) => {
            const nueva = mover(v ?? ordenRef.current, g.id, destino)
            return nueva.join() === (v ?? []).join() ? v : nueva
          })
        }
        // Cerca del borde de la pantalla, la página se desplaza sola (móvil y listas largas).
        const barra = Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--alto-reproductor')) || 0
        if (ev.clientY < 40) window.scrollBy(0, -12)
        else if (ev.clientY > window.innerHeight - barra - 40) window.scrollBy(0, 12)
      }
      const suelta = (ev: globalThis.PointerEvent) => {
        if (ev.pointerId !== g.pointerId) return
        quitar()
        if (gesto.current !== g) return
        gesto.current = null
        setFantasma(null)
        if (!g.moviendo) return // un toque en el asa no hace nada (y no reproduce)
        if (g.zona && soltarRef.current) {
          const nombreZona = resaltada?.dataset.soltarNombre ?? 'otra carpeta'
          resaltar(null)
          setVista(null)
          setAnuncio(`${g.nombre} movido a ${nombreZona}.`)
          soltarRef.current.alSoltar(g.id, g.zona)
          return
        }
        resaltar(null)
        const final = ordenRef.current
        setAnuncio(`${g.nombre} colocado en la posición ${final.indexOf(g.id) + 1} de ${final.length}.`)
        void guardarRef.current(final)
      }
      const corta = (ev: globalThis.PointerEvent) => {
        if (ev.pointerId !== g.pointerId) return
        quitar()
        if (gesto.current === g) cancelar()
      }
      const quitar = () => {
        window.removeEventListener('pointermove', mueve)
        window.removeEventListener('pointerup', suelta)
        window.removeEventListener('pointercancel', corta)
      }
      window.addEventListener('pointermove', mueve, { passive: false })
      window.addEventListener('pointerup', suelta)
      window.addEventListener('pointercancel', corta)
    },
    onKeyDown: (e: KeyboardEvent<HTMLButtonElement>) => {
      const nombre = nombres[id] ?? ''
      const total = ordenRef.current.length
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault()
        if (levantada !== id) {
          setLevantada(id)
          setVista(ordenRef.current)
          setAnuncio(`${nombre} cogido, posición ${ordenRef.current.indexOf(id) + 1} de ${total}. Muévelo con las flechas y pulsa espacio para soltarlo, o Esc para cancelar.`)
        } else {
          const final = ordenRef.current
          setLevantada(null)
          setAnuncio(`${nombre} colocado en la posición ${final.indexOf(id) + 1} de ${total}.`)
          void guardar(final)
        }
        return
      }
      if (levantada !== id) return
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        cancelar()
        setAnuncio(`Movimiento cancelado. ${nombre} vuelve a su sitio.`)
        return
      }
      const paso = e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : 0
      if (!paso) return
      e.preventDefault()
      const actual = ordenRef.current.indexOf(id)
      const destino = Math.max(0, Math.min(total - 1, actual + paso))
      if (destino === actual) return
      const nueva = mover(ordenRef.current, id, destino)
      setVista(nueva)
      setAnuncio(`${nombre}, posición ${destino + 1} de ${total}.`)
      // Al reordenarse la lista, el asa conserva el foco.
      requestAnimationFrame(() => lista.current?.querySelector<HTMLElement>(`[data-asa="${id}"]`)?.focus())
    },
    onBlur: () => {
      // Si el foco se va a otra parte con la tarjeta cogida, se cancela (salvo el reenfoque tras moverla).
      setTimeout(() => {
        if (levantada === id && document.activeElement?.getAttribute('data-asa') !== id) cancelar()
      }, 0)
    },
  })

  return { orden, lista, fantasma, levantada, anuncio, asa }
}
