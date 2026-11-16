import { createClient } from '@supabase/supabase-js'

// Conexión con Supabase. Si faltan las variables de entorno, la app funciona en
// «modo local» (todo en el navegador, sin cuentas): útil en desarrollo y en pruebas.
// La clave es la pública (publishable/anon): está pensada para ir en el navegador.

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const clave = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined

export const supabase =
  url && clave
    ? createClient(url, clave, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } })
    : null

export const modoLocal = supabase === null
