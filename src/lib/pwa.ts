import { create } from 'zustand'

// Instalación como app (PWA) en Android y escritorio.

type EventoInstalacion = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> }

interface Instalacion {
  evento: EventoInstalacion | null
  instalar: () => Promise<void>
}

export const useInstalacion = create<Instalacion>()((set, get) => ({
  evento: null,
  instalar: async () => {
    const e = get().evento
    if (!e) return
    await e.prompt()
    await e.userChoice
    set({ evento: null })
  },
}))

/** Llamar lo antes posible: el navegador avisa de que se puede instalar una sola vez. */
export function prepararPwa() {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    useInstalacion.setState({ evento: e as EventoInstalacion })
  })
  window.addEventListener('appinstalled', () => useInstalacion.setState({ evento: null }))
  if ('serviceWorker' in navigator && import.meta.env.PROD) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').catch(() => {})
    })
  }
}
