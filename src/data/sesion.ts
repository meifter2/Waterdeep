import { create } from 'zustand'
import { modoLocal, supabase, vieneDeRecuperacion } from '../lib/supabase'

// Sesión del usuario (Supabase Auth): Google o email y contraseña. Supabase la recuerda en el navegador.

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
  /** Mensaje informativo (p. ej. «revisa tu correo»). */
  aviso: string
  /** Se ha abierto el enlace de «recuperar contraseña»: hay que elegir una nueva. */
  recuperando: boolean
  ocupado: boolean
  entrarConGoogle: () => Promise<void>
  entrarConEmail: (email: string, contrasena: string) => Promise<void>
  crearCuenta: (email: string, contrasena: string) => Promise<void>
  recuperarContrasena: (email: string) => Promise<void>
  cambiarContrasena: (contrasena: string) => Promise<void>
  limpiarMensajes: () => void
  salir: () => Promise<void>
}

/** Traduce los errores de Supabase Auth a mensajes claros. */
function traducir(e: { message?: string; code?: string; status?: number } | null): string {
  const m = `${e?.code ?? ''} ${e?.message ?? ''}`
  if (/invalid_credentials|Invalid login credentials/i.test(m)) return 'Email o contraseña incorrectos.'
  if (/email_not_confirmed|not confirmed/i.test(m)) return 'Aún no has confirmado tu email. Busca el correo de confirmación (mira también en spam) y pulsa su enlace.'
  if (/weak_password|at least|Password should/i.test(m)) return 'La contraseña es demasiado corta o sencilla. Usa al menos 8 caracteres.'
  if (/user_already_exists|already registered/i.test(m)) return 'Ya existe una cuenta con ese email. Entra con tu contraseña o recupérala.'
  if (/rate_limit|too many|security purposes/i.test(m)) return 'Demasiados intentos o correos seguidos. Espera unos minutos y vuelve a probar.'
  if (/email_address_invalid|invalid.*email|Unable to validate email/i.test(m)) return 'Ese email no parece válido.'
  if (/signup_disabled|Signups not allowed/i.test(m)) return 'El registro con email está desactivado en Supabase.'
  if (/provider.*disabled|email_provider_disabled/i.test(m)) return 'El acceso con email está desactivado en Supabase (Authentication › Sign In / Providers › Email).'
  return 'No se ha podido completar. Revisa la conexión e inténtalo de nuevo.'
}

const volverAqui = () => `${window.location.origin}/`

export const useSesion = create<Sesion>()((set) => {
  // Ejecuta una acción de Auth mostrando «ocupado» y traduciendo errores.
  const accion = async (fn: () => Promise<{ error: unknown } | void>, aviso = '') => {
    if (!supabase) return
    set({ ocupado: true, error: '', aviso: '' })
    try {
      const r = await fn()
      const error = r && (r as { error: unknown }).error
      if (error) set({ error: traducir(error as { message?: string; code?: string }) })
      else if (aviso) set({ aviso })
    } catch {
      set({ error: traducir(null) })
    }
    set({ ocupado: false })
  }

  return {
    estado: modoLocal ? 'dentro' : 'comprobando',
    usuario: null,
    error: '',
    aviso: '',
    recuperando: vieneDeRecuperacion && !modoLocal,
    ocupado: false,

    entrarConGoogle: async () => {
      if (!supabase) return
      set({ error: '', aviso: '' })
      const { error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.origin } })
      if (error) set({ error: 'No se ha podido abrir el inicio de sesión de Google. Inténtalo de nuevo.' })
    },

    entrarConEmail: (email, contrasena) => accion(() => supabase!.auth.signInWithPassword({ email: email.trim(), password: contrasena })),

    crearCuenta: async (email, contrasena) => {
      if (!supabase) return
      set({ ocupado: true, error: '', aviso: '' })
      try {
        const { data, error } = await supabase.auth.signUp({ email: email.trim(), password: contrasena, options: { emailRedirectTo: volverAqui() } })
        if (error) set({ error: traducir(error) })
        else if (!data.session)
          set({
            aviso: `Te hemos enviado un correo a ${email.trim()}. Pulsa su enlace para confirmar la cuenta y después entra aquí con tu email y contraseña.`,
          })
      } catch {
        set({ error: traducir(null) })
      }
      set({ ocupado: false })
    },

    recuperarContrasena: (email) =>
      accion(
        () => supabase!.auth.resetPasswordForEmail(email.trim(), { redirectTo: volverAqui() }),
        `Si hay una cuenta con ${email.trim()}, te llegará un correo con un enlace para elegir una contraseña nueva.`,
      ),

    cambiarContrasena: async (contrasena) => {
      await accion(() => supabase!.auth.updateUser({ password: contrasena }))
      if (!useSesion.getState().error) set({ recuperando: false, aviso: '' })
    },

    limpiarMensajes: () => set({ error: '', aviso: '' }),

    salir: async () => {
      if (!supabase) return
      await supabase.auth.signOut()
    },
  }
})

/** Escucha los cambios de sesión (entrar, salir, renovar, recuperar). Llamar una vez al arrancar. */
export function escucharSesion() {
  if (!supabase) return () => {}
  const { data } = supabase.auth.onAuthStateChange((evento, sesion) => {
    const u = sesion?.user
    useSesion.setState({
      estado: u ? 'dentro' : 'fuera',
      ...(evento === 'PASSWORD_RECOVERY' ? { recuperando: true } : {}),
      ...(evento === 'SIGNED_OUT' ? { recuperando: false } : {}),
      usuario: u
        ? {
            id: u.id,
            email: u.email ?? '',
            nombre: (u.user_metadata?.full_name as string) || (u.user_metadata?.name as string) || u.email?.split('@')[0] || 'Máster',
            avatar: u.user_metadata?.avatar_url as string | undefined,
          }
        : null,
    })
  })
  return () => data.subscription.unsubscribe()
}
