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

export function aplicarTema(t: Tema) {
  const raiz = document.documentElement
  if (t === 'auto') raiz.removeAttribute('data-theme')
  else raiz.setAttribute('data-theme', t === 'claro' ? 'light' : 'dark')
}
