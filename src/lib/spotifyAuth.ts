import { create } from 'zustand'
import { almacenamientoSeguro } from '../data/storage'

// Conexión con la cuenta de Spotify (OAuth «Authorization Code + PKCE»: sin secretos en la app).
// Permite controlar la app de Spotify del usuario (Spotify Connect) para oír canciones completas.
// El Client ID es público. Si no está configurado, la app usa solo el reproductor integrado.

const CLIENT_ID = import.meta.env.VITE_SPOTIFY_CLIENT_ID as string | undefined
export const spotifyConfigurado = !!CLIENT_ID

const CLAVE = 'banda-sonora:spotify'
const CLAVE_PKCE = 'banda-sonora:spotify-pkce'
const PERMISOS = 'user-modify-playback-state user-read-playback-state'
const CUENTAS = 'https://accounts.spotify.com'
export const rutaVuelta = '/spotify'
const urlVuelta = () => `${window.location.origin}${rutaVuelta}`

interface Tokens {
  access: string
  refresh: string
  caduca: number
}

function leer(): Tokens | null {
  try {
    const t = JSON.parse(almacenamientoSeguro.getItem(CLAVE) ?? 'null') as Tokens | null
    return t?.access && t.refresh ? t : null
  } catch {
    return null
  }
}

interface EstadoSpotify {
  conectado: boolean
  error: string
}

export const useSpotify = create<EstadoSpotify>()(() => ({ conectado: spotifyConfigurado && !!leer(), error: '' }))

function guardar(t: Tokens | null) {
  if (t) almacenamientoSeguro.setItem(CLAVE, JSON.stringify(t))
  else almacenamientoSeguro.removeItem(CLAVE)
  useSpotify.setState({ conectado: !!t })
}

const base64url = (b: ArrayBuffer | Uint8Array) =>
  btoa(String.fromCharCode(...new Uint8Array(b)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')

const aleatorio = (n: number) => base64url(crypto.getRandomValues(new Uint8Array(n)))

/** Lleva al usuario a Spotify para que dé permiso. Vuelve a /spotify. */
export async function conectarSpotify() {
  if (!CLIENT_ID) return
  const verificador = aleatorio(48)
  const estado = aleatorio(12)
  const reto = base64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verificador)))
  // localStorage (no sessionStorage): en Android la vuelta puede abrirse en otra pestaña de Chrome.
  almacenamientoSeguro.setItem(CLAVE_PKCE, JSON.stringify({ verificador, estado, momento: Date.now() }))
  const q = new URLSearchParams({
    response_type: 'code',
    client_id: CLIENT_ID,
    scope: PERMISOS,
    redirect_uri: urlVuelta(),
    code_challenge_method: 'S256',
    code_challenge: reto,
    state: estado,
  })
  window.location.assign(`${CUENTAS}/authorize?${q}`)
}

async function pedirToken(datos: Record<string, string>): Promise<Tokens | null> {
  try {
    const r = await fetch(`${CUENTAS}/api/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: CLIENT_ID!, ...datos }),
    })
    if (!r.ok) return null
    const j = (await r.json()) as { access_token: string; refresh_token?: string; expires_in: number }
    return { access: j.access_token, refresh: j.refresh_token ?? datos.refresh_token ?? '', caduca: Date.now() + j.expires_in * 1000 }
  } catch {
    return null
  }
}

/** Llamar al arrancar: si volvemos de Spotify (/spotify?code=…), canjea el código y limpia la dirección. */
export async function completarConexionSpotify() {
  if (!CLIENT_ID || window.location.pathname !== rutaVuelta) return
  const q = new URLSearchParams(window.location.search)
  window.history.replaceState(null, '', '/')
  let pkce: { verificador: string; estado: string } | null = null
  try {
    pkce = JSON.parse(almacenamientoSeguro.getItem(CLAVE_PKCE) ?? 'null')
  } catch {
    /* nada */
  }
  almacenamientoSeguro.removeItem(CLAVE_PKCE)

  if (q.get('error')) {
    useSpotify.setState({ error: q.get('error') === 'access_denied' ? 'Has cancelado la conexión con Spotify.' : 'Spotify no ha permitido la conexión. Inténtalo de nuevo.' })
    return
  }
  const codigo = q.get('code')
  if (!pkce || !codigo || q.get('state') !== pkce.estado) {
    useSpotify.setState({ error: 'La conexión con Spotify no se ha completado. Pulsa «Conectar Spotify» otra vez.' })
    return
  }
  const t = await pedirToken({ grant_type: 'authorization_code', code: codigo, redirect_uri: urlVuelta(), code_verifier: pkce.verificador })
  if (t) {
    guardar(t)
    useSpotify.setState({ error: '' })
  } else useSpotify.setState({ error: 'Spotify no ha aceptado la conexión. Revisa que la dirección de vuelta esté registrada en tu app de Spotify.' })
}

let renovando: Promise<string | null> | null = null

/** Token de acceso vigente (lo renueva si hace falta) o null si no hay conexión. */
export async function tokenSpotify(): Promise<string | null> {
  const t = leer()
  if (!t) return null
  if (Date.now() < t.caduca - 60_000) return t.access
  renovando ??= pedirToken({ grant_type: 'refresh_token', refresh_token: t.refresh })
    .then((n) => {
      guardar(n)
      return n?.access ?? null
    })
    .finally(() => {
      renovando = null
    })
  return renovando
}

export function desconectarSpotify() {
  guardar(null)
}

/** Si se conecta en otra pestaña (p. ej. la vuelta de Spotify en Android), esta se entera. */
export function escucharSpotifyOtrasPestanas() {
  const alCambiar = (e: StorageEvent) => {
    if (e.key === CLAVE) useSpotify.setState({ conectado: !!leer() })
  }
  window.addEventListener('storage', alCambiar)
  return () => window.removeEventListener('storage', alCambiar)
}
