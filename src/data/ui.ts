import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { almacenamientoSeguro } from './storage'

export type Tema = 'auto' | 'claro' | 'oscuro'

interface UI {
  /** Difumina los bloques sellados por si alguien mira la pantalla del máster. */
  ocultarSecretos: boolean
  tema: Tema
  alternarSecretos: () => void
  cambiarTema: (t: Tema) => void
}

export const useUI = create<UI>()(
  persist(
    (set) => ({
      ocultarSecretos: false,
      tema: 'auto',
      alternarSecretos: () => set((s) => ({ ocultarSecretos: !s.ocultarSecretos })),
      cambiarTema: (tema) => set({ tema }),
    }),
    {
      name: 'waterdeep-mesa:ui',
      storage: createJSONStorage(() => almacenamientoSeguro),
      partialize: (s) => ({ ocultarSecretos: s.ocultarSecretos, tema: s.tema }),
    },
  ),
)

// Recuerda si el atributo lo puso la app, para no borrar el que ponga un visor externo.
let puestoPorLaApp = false

export function aplicarTema(t: Tema) {
  const raiz = document.documentElement
  if (t === 'auto') {
    if (puestoPorLaApp) raiz.removeAttribute('data-theme')
    puestoPorLaApp = false
    return
  }
  raiz.setAttribute('data-theme', t === 'claro' ? 'light' : 'dark')
  puestoPorLaApp = true
}

/** true si la app se muestra dentro de otra página (p. ej. un visor). */
export const enMarco = (() => {
  try {
    return window.self !== window.top
  } catch {
    return true
  }
})()
