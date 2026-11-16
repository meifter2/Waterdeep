# CLAUDE.md — Banda sonora («Waterdeep: Dragon Heist»)

> Contexto para Claude Code. Breve (≤100 líneas). Actualizar al cerrar cada fase.
> No repetir lo que ya está en el código: solo lo necesario para orientarse.

## Resumen
App web del máster centrada SOLO en la música. Canciones (enlace Spotify/YouTube) en 5 carpetas:
Opening, Ending, Personajes, Lugares, Momentos. Pulsar una tarjeta → suena en el reproductor integrado.
Multiusuario: entrar con Google (Supabase Auth); cada usuario solo ve lo suyo (RLS).
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
Variables (Vercel y `.env.local`): `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`.

## Estructura
```
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
  components/                Seccion, Tarjeta, Editor, Copias, Cuenta, Migracion, Confirmar, reproductor/
  styles/                    tokens, base, app, reproductor, dialogos, entrada
pruebas/                     enlaces.test.ts · musica.cjs (modo local) · supabase.cjs (Supabase simulado)
```

## Comportamiento del reproductor (no romper)
- Un único reproductor por servicio, reutilizado (Spotify `loadUri`, YouTube `loadVideoById`).
- Pulsar la que suena = pausa/reanuda. Cambiar de servicio pausa/detiene el otro. «Repetir» por defecto sí.
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
- `npm run test:enlaces` · `npm run test:musica` (con preview en 4173)
- `npm run build:prueba && npm run preview:prueba` (4174) y `npm run test:supabase`
- Despliegue: Vercel publica cada push a `main` (master-waterdeep.vercel.app).

## Git
Trabajo en `ccr-4e49e839-kg8cvn`; el usuario autorizó llevarlo a `main` (despliegue). Commits pequeños en español.

## Estado de fases
| Fase | Descripción | Estado |
|------|-------------|--------|
| 2 | Banda sonora: tarjeta → canción Spotify/YouTube | Hecha y probada por el usuario |
| 3 | Publicación en Vercel desde `main` | Hecha y funcionando |
| 4 | Supabase: Google, carpetas, RLS por usuario | Código hecho y probado con simulador; falta configurar proyecto (SQL, Google, variables en Vercel) |
