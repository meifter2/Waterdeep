# CLAUDE.md — Banda sonora («Waterdeep: Dragon Heist»)

> Contexto para Claude Code. Breve (≤100 líneas). Actualizar al cerrar cada fase.
> No repetir lo que ya está en el código: solo lo necesario para orientarse.

## Resumen
App web del máster centrada SOLO en la música. Canciones (enlace Spotify/YouTube) en 5 carpetas:
Opening, Ending, Personajes, Lugares, Momentos. Pulsar una tarjeta → suena en el reproductor integrado.
Multiusuario: entrar con Google (Supabase Auth); cada usuario solo ve lo suyo (RLS).
Spotify Connect opcional: con «Conectar Spotify» suena completa en la app de Spotify del usuario (móvil/PC).
PWA instalable (Android) con «share target»: compartir desde Spotify/YouTube abre el editor con el enlace.
Sin variables de Supabase la app funciona en «modo local» (navegador, sin cuentas).
El usuario tiene Spotify Premium.

## Usuario y forma de trabajar
- Responder **siempre en español**, explicando cada paso. Usuario: experto en producto/UX/frontend, no programador puro.
  Suele dictar por voz: interpretar con cuidado y preguntar si algo es ambiguo.
- Plan antes de cambios grandes; preguntar decisiones importantes no cubiertas aquí.
- **Prioridad: ahorrar tokens.** Empezar SIEMPRE por este archivo; leer solo lo necesario; respuestas concisas.
- **Tamaño de archivo: máximo ~1000 líneas** (límite duro 1500). Dividir por responsabilidad.

## Reglas clave
- **Nada de contenido del libro** en el código. **Interfaz en español** (sentence case).
- **Frontend → skill `frontend-design` obligatoria.** Supabase → skills `supabase` y `supabase-postgres-best-practices`.
- Nunca subir secretos ni `.env`. En el front solo la clave pública (publishable). Nunca service_role/secret.

## Stack
React 19 + TypeScript + Vite · Zustand · CSS plano con tokens · @supabase/supabase-js (versión fijada).
Reproducción: Spotify iFrame API + YouTube IFrame Player API. Fuentes: Alegreya + Alegreya Sans.
Variables (Vercel y `.env.local`): `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SPOTIFY_CLIENT_ID` (todas públicas).

## Estructura
```
public/                      manifest.webmanifest (share_target GET → /?title&text&url), sw.js, iconos/
bd/esquema.sql               tabla `canciones` + RLS + grants + trigger (se pega en el SQL Editor; idempotente)
src/
  App.tsx                    puerta: comprobando / Entrada (Google) / Biblioteca
  pages/Entrada.tsx · Biblioteca.tsx
  data/types.ts              Cancion, Tipo y CARPETAS (títulos y textos de cada carpeta)
  data/repositorio.ts        Supabase o local (misma interfaz) + migración de datos antiguos
  data/store.ts              canciones (cambios optimistas con deshacer) + copias v3
  data/sesion.ts             sesión Google (onAuthStateChange)
  data/reproduccion.ts       qué suena, pausa, repetir
  lib/supabase.ts            cliente (null ⇒ modo local) · lib/enlaces.ts · lib/apis.ts
  lib/compartir.ts           captura lo compartido al arrancar (sobrevive al login) · lib/titulo.ts (oEmbed)
  lib/spotifyAuth.ts         OAuth PKCE (vuelta en /spotify, rewrite en vercel.json), tokens en localStorage
  lib/spotifyApi.ts          Web API: dispositivos, play/pause/repeat, estado (errores traducidos)
  lib/pwa.ts                 registro del SW (solo PROD) + botón «Instalar app»
  components/                ConexionSpotify, Seccion, Tarjeta, Editor (chips de carpeta, recuerda la última), Copias, Cuenta,
                             Migracion, Instalar, Confirmar, reproductor/
  styles/                    tokens, base, app, reproductor, dialogos, entrada
pruebas/                     enlaces.test.ts · musica.cjs · compartir.cjs (PWA) · supabase.cjs · spotify.cjs (simulados)
```

## Comportamiento del reproductor (no romper)
- Un único reproductor por servicio, reutilizado (Spotify `loadUri`, YouTube `loadVideoById`).
- Pulsar la que suena = pausa/reanuda. Cambiar de servicio pausa/detiene el otro. «Repetir» por defecto sí.
- Spotify conectado ⇒ motorSpotifyConnect (elige dispositivo activo/del tipo del aparato; repeat track/context;
  sondeo cada 5 s). Error 'desconectado' ⇒ cae al iframe. En móvil el iframe SIEMPRE da 30 s (límite de Spotify).
- Spotify ≤30 s ⇒ la sesión no llega al iframe (cookies de terceros bloqueadas en Brave/Safari).
  Solución probada: permitir cookies en la página o usar Chrome/Edge.
- YouTube errores 101/150 ⇒ «no permite reproducirlo fuera de YouTube». Vídeo visible ≥200 px.
- Si la API no carga ⇒ iframe básico de respaldo y aviso «Pulsa ▶».

## Datos
- Supabase: el cliente NUNCA envía `user_id` (default `auth.uid()`); RLS con `(select auth.uid()) = user_id`.
- Al entrar con cuenta, si el navegador tiene canciones antiguas se ofrece «Subir a mi cuenta».
- Modo local: `banda-sonora:canciones`; convierte solo la clave antigua `banda-sonora:datos` (v2).
- Este entorno de Claude NO llega a supabase.co (red bloqueada): probar con `pruebas/supabase.cjs`.

## Comandos
- `npm run dev` · `npm run build` · `npm run preview` (4173)
- `npm run test:enlaces` · `npm run test:musica` · `npm run test:compartir` (con preview en 4173)
- `npm run build:prueba && npm run preview:prueba` (4174) y `npm run test:supabase`
- `npm run build:spotify && npm run preview:spotify` (4175) y `npm run test:spotify`
- Despliegue: Vercel publica cada push a `main` (master-waterdeep.vercel.app). `base: '/'` (PWA).
- SW: red primero para páginas; cachea /assets e /iconos; no toca otros dominios. Cambiar `CACHE` si cambia la estrategia.

## Git
Trabajo en `ccr-4e49e839-kg8cvn`; el usuario autorizó llevarlo a `main` (despliegue). Commits pequeños en español.

## Estado de fases
| Fase | Descripción | Estado |
|------|-------------|--------|
| 2 | Banda sonora: tarjeta → canción Spotify/YouTube | Hecha y probada por el usuario |
| 3 | Publicación en Vercel desde `main` | Hecha y funcionando |
| 4 | Supabase: Google, carpetas, RLS por usuario | Código hecho y probado con simulador; falta configurar proyecto (SQL, Google, variables en Vercel) |
| 5 | PWA + compartir desde Android | Hecha y probada con simulador; falta prueba en el móvil |
| 6 | Spotify Connect (canciones completas en móvil y PC) | Hecha y probada con simulador; falta app en developer.spotify.com + variable |
