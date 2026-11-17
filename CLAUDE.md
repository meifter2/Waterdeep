# CLAUDE.md — Banda sonora («Waterdeep: Dragon Heist»)

> Contexto para Claude Code. Breve (≤100 líneas). Actualizar al cerrar cada fase.

## Resumen
Mesa de sonido personal del máster de D&D. Elementos en 7 carpetas (Opening, Ending, Personajes, Lugares,
Momentos, Ambientes, Efectos), cada uno con retrato opcional y una o varias pistas (sonidos de Spotify,
YouTube o archivos propios, con etiqueta, tramo inicio/fin y bucle). Los sonidos se reutilizan sin duplicar.
Cuentas con Google (Supabase Auth + RLS). Spotify Connect opcional. PWA con «compartir» en Android.
Sin variables de Supabase ⇒ «modo local» (localStorage + IndexedDB). El usuario tiene Spotify Premium.
Roadmap (NO empezar sin pedirlo): F2 mezclador · F3 modo sesión/escenas · F4 biblioteca de solo lectura para jugadores
(solo lo publicado expresamente; la cuenta del usuario será la única administradora).

## Usuario y forma de trabajar
- **Siempre en español**, explicando cada paso. Experto en producto/UX/frontend, no programador. Dicta por voz.
- Plan antes de cambios grandes; preguntar decisiones importantes. **Ahorrar tokens**: empezar por este archivo.
- **Archivos ≤ ~1000 líneas** (límite 1500). Dividir por responsabilidad.
- Nada de contenido del libro. Interfaz en español (sentence case). Frontend ⇒ skill `frontend-design`;
  Supabase ⇒ skills `supabase` y `supabase-postgres-best-practices`. Nunca subir secretos ni `.env`.

## Stack
React 19 + TS + Vite · Zustand · CSS plano con tokens · @supabase/supabase-js y @electric-sql/pglite (fijadas).
Variables públicas (Vercel y `.env.local`): `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SPOTIFY_CLIENT_ID`.

## Base de datos (bd/)
- `esquema.sql` (v3, ya ejecutado por el usuario): tabla `canciones`. NO borrarla (la usa la versión publicada).
- `002-biblioteca.sql` (v4, idempotente, solo añade): `elementos`, `recursos`, `pistas` + RLS + buckets privados
  `audio` (50 MB) y `retratos` (5 MB) con políticas por carpeta `<uid>/…` + copia de `canciones` (marca `migrado_de`).
- Pistas con FK compuestas (id, user_id) ⇒ mismo dueño garantizado. Borrar elemento ⇒ borra sus pistas, no recursos.
- El cliente NUNCA envía `user_id` (default `auth.uid()`). Archivos: URL firmada 6 h.
- Este entorno NO llega a supabase.co: el SQL se valida con PGlite (`pruebas/sql.test.mjs`) y la app con simuladores.

## Estructura
```
src/data/  types (Elemento/Recurso/Pista, CARPETAS) · repositorio (Supabase|local+IndexedDB, errores traducidos)
           store (biblioteca, borrados optimistas, URLs) · guardar (elemento+pistas, subidas, reutilizar, importar)
           convertir (v2/v3→v4, copias v4, claveEnlace) · reproduccion (pistaId, repetir) · sesion
src/lib/   enlaces · archivos (validación, SHA-256, retrato 512 WebP, IndexedDB) · tiempo (m:ss) · apis
           spotifyAuth/spotifyApi (Connect) · compartir · titulo (oEmbed) · pwa · supabase
src/components/  Tarjeta (retrato + chips) · Seccion · editor/(EditorElemento, FilaPista, AnadirPista)
           BibliotecaSonidos · Compartido · Copias · Migracion · ConexionSpotify · reproductor/
src/styles/ tokens, base, app, tarjetas, reproductor, dialogos, editor, entrada
```

## Reproductor (no romper)
- Suena UNA pista cada vez (mezcla = fase 2). Pulsar la que suena = pausa/reanuda. Nombre de tarjeta = 1.ª pista.
- Bucle por pista (ambientes/música sí, efectos no); «Repetir» en la barra lo cambia al vuelo.
- Archivo: HTMLAudio + temporizador recalculado en `timeupdate` (±15 ms). YouTube: start/endSeconds oficiales.
  Spotify integrado: seek/pausa por `playback_update` (aprox.). Connect: `position_ms` + temporizador (aprox. ±1 s);
  con fin, repeat de Spotify en «off» y repite la app. En móvil el iframe de Spotify SIEMPRE da 30 s.
- Errores: YouTube 101/150, Spotify ≤30 s (cookies Brave/Safari), API no carga ⇒ iframe de respaldo.

## Comandos y pruebas
- `npm run dev|build|preview` (4173) · `build:prueba`+`preview:prueba` (4174, Supabase simulado) ·
  `build:spotify`+`preview:spotify` (4175)
- `npm run test:sql|enlaces|biblioteca|musica|compartir` (4173) · `test:supabase` (4174) · `test:spotify` (4175)
- Despliegue: Vercel publica cada push a `main`. Las ramas generan vista previa (usa variables de «Preview»).

## Git
Trabajo en `ccr-4e49e839-kg8cvn`. Pasar a `main` SOLO con permiso y tras validar el SQL en Supabase.

## Estado
| Fase | Estado |
|------|--------|
| Banda sonora, Vercel, Supabase+Google, PWA, Spotify Connect | Hechas (v3 publicada en `main`) |
| F1 Biblioteca (v4) | Hecha en la rama, probada con simuladores; falta ejecutar 002 y probar la vista previa |
