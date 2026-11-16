import { create } from 'zustand'
import { modoLocal, supabase } from '../lib/supabase'

// Sesión del usuario (Google vía Supabase Auth). Supabase la recuerda en el navegador.

export interface Usuario {
  id: string
  nombre: string
  email: string
  avatar?: string
}

type Estado = 'comprobando' | 'fuera' | 'dentro'

interface Sesion {
  estado: Estado
  usuario: Usuario | null
  error: string
  entrarConGoogle: () => Promise<void>
  salir: () => Promise<void>
}

export const useSesion = create<Sesion>()((set) => ({
  estado: modoLocal ? 'dentro' : 'comprobando',
  usuario: null,
  error: '',

  entrarConGoogle: async () => {
    if (!supabase) return
    set({ error: '' })
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    })
    if (error) set({ error: 'No se ha podido abrir el inicio de sesión de Google. Inténtalo de nuevo.' })
  },

  salir: async () => {
    if (!supabase) return
    await supabase.auth.signOut()
  },
}))

/** Escucha los cambios de sesión (entrar, salir, renovar). Llamar una vez al arrancar. */
export function escucharSesion() {
  if (!supabase) return () => {}
  const { data } = supabase.auth.onAuthStateChange((_evento, sesion) => {
    const u = sesion?.user
    useSesion.setState({
      estado: u ? 'dentro' : 'fuera',
      usuario: u
        ? {
            id: u.id,
            email: u.email ?? '',
            nombre: (u.user_metadata?.full_name as string) || (u.user_metadata?.name as string) || u.email || 'Máster',
            avatar: u.user_metadata?.avatar_url as string | undefined,
          }
        : null,
    })
  })
  return () => data.subscription.unsubscribe()
}
