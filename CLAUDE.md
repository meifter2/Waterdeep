# CLAUDE.md — DFY · «El sonido de tus aventuras» (antes «Banda sonora»)

> Contexto para Claude Code. Breve (≤100 líneas). Actualizar al cerrar cada fase.

## Resumen
**DFY** = D (dado D20) + FY (guiño a Spotify). Eslogan: «El sonido de tus aventuras». Icono: D20 dorado con ondas
sobre verde muelle (`public/iconos/dfy*.png|svg`). Antes se llamaba «Banda sonora».
Mesa de sonido personal del máster de D&D. Elementos en 7 carpetas (Opening, Ending, Personajes, Lugares,
Momentos, Ambientes, Efectos), cada uno con retrato opcional y una o varias pistas (sonidos de Spotify,
YouTube o archivos propios, con etiqueta, tramo inicio/fin y bucle). Los sonidos se reutilizan sin duplicar.
Cuentas con Google o email+contraseña (Supabase Auth + RLS; recuperar contraseña con enlace al correo). Spotify Connect opcional. PWA con «compartir» en Android.
Sin variables de Supabase ⇒ «modo local» (localStorage + IndexedDB). El usuario tiene Spotify Premium.
Roadmap (NO empezar sin pedirlo): F2 mezclador (1.er incremento hecho) · F3 modo sesión/escenas · F4 biblioteca de solo lectura para jugadores
(solo lo publicado expresamente; la cuenta del usuario será la única administradora).

## Usuario y forma de trabajar
- **Siempre en español**, explicando cada paso. Experto en producto/UX/frontend, no programador. Dicta por voz.
- Plan antes de cambios grandes; preguntar decisiones importantes. **Ahorrar tokens**: empezar por este archivo.
- **Archivos ≤ ~1000 líneas** (límite 1500). Dividir por responsabilidad.
- **Nombre antiguo que NO se cambia** (datos): claves `banda-sonora:*`, IndexedDB `banda-sonora`, políticas SQL
  «banda sonora: …», `window.__audioBandaSonora` (pruebas). Tablas, buckets, variables y rutas tampoco.
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
           mezcla (F2: canales, enrutado `tocar`, política externa) · volumen (local, maestro, Spotify)
src/lib/   enlaces · archivos (validación, SHA-256, retrato 512 WebP, IndexedDB) · tiempo (m:ss) · apis
           spotifyAuth/spotifyApi (Connect) · compartir · titulo (oEmbed) · pwa · supabase
src/components/  Tarjeta (retrato + chips) · Seccion · editor/(EditorElemento, FilaPista, AnadirPista)
           BibliotecaSonidos · Compartido · Copias · Migracion · ConexionSpotify · reproductor/ (+ Mezclador, motorMezcla)
src/styles/ tokens, base, app, tarjetas, reproductor, mezclador, dialogos, editor, entrada · pruebas/ (Playwright + simuladores)
```

## Reproductor (no romper)
- Canal principal: UNA pista cada vez (el reproductor de siempre). Nunca superponer Spotify/YouTube con otras fuentes.
- **Pulsar tarjeta/chip = reproducir esa pista** (`reproducir`/`reproducirElemento`), nunca pausar. Si es la misma y suena de
  verdad, no se reinicia; si está en pausa, se reanuda; si Spotify cambió a otra, se vuelve a poner. Pausar/Reanudar/Detener
  solo en la barra. Las órdenes de la barra se atienden UNA vez (`ordenAtendida`), no al cambiar de fuente.
- Barra (`Transporte.tsx`): ■ Detener · ▶/❚❚ `principal()` · ⟲ Repetir (aria-pressed). Detener RECUERDA la pista
  (estado `parado`); ▶ la vuelve a poner desde el inicio del tramo. `olvidar()` (borrar/cerrar sesión) la olvida.
  Mientras `cargando`, ▶ desactivado. Connect: alternar ignora duplicados; Detener solo pausa si suena lo de DFY.
- Tarjeta: toda la superficie es un botón (pista principal = primera); chips solo si hay varias pistas; Editar aparte.
- Turnos («generacion») en todos los motores; motor `parado` ignora eventos tardíos (YouTube tras `stopVideo` relanzaba
  el vídeo bajo el MP3); el reproductor solo acepta avisos del motor activo (`activoRef`).
- Connect: órdenes en cola (solo la última se ejecuta); `estadoActual` lee uri/contexto/dispositivo/progreso/volumen;
  sondeo 4 s detecta cambios externos (estado `otra`); el corte del tramo verifica la canción antes de relanzarla.
- Volumen (`data/volumen.ts`): «local» (MP3 + YouTube, clave `banda-sonora:volumen`, 70 % por defecto) y «spotify»
  (volumen REAL del dispositivo, leído, nunca forzado; PUT limitado a 1/350 ms, 429 ⇒ Retry-After; sin `supports_volume`
  ⇒ desactivado). Silencio en Spotify = bajar a 0 y recuperar. El iframe de Spotify no admite volumen (deslizador desactivado).
- Bucle por pista; «Repetir» de la barra lo cambia al vuelo. Archivo: HTMLAudio (+ volume/muted). YouTube: start/endSeconds,
  setVolume/mute. Spotify integrado: seek/pausa por `playback_update` (aprox.). Connect: `position_ms` + temporizador (±1 s).
- Errores: YouTube 101/150, Spotify ≤30 s (cookies Brave/Safari; en móvil el iframe SIEMPRE da 30 s), API no carga ⇒ respaldo.

## Mezcla (F2, `data/mezcla.ts` + `motorMezcla.ts` + `Mezclador.tsx`)
- Un HTMLAudioElement por voz reutilizando `MotorArchivo` (NO Web Audio: streaming de archivos largos, URLs firmadas
  sin CORS, sin AudioContext en móvil). Límite: iPhone ignora el volumen por elemento (el silencio sí va).
- Enrutado `tocar(pista)`: archivo propio en Ambientes ⇒ canal de ambiente (pulsar activa/detiene; en pausa reanuda;
  con error reintenta), máx. 3, el 4.º se rechaza con aviso · en Efectos ⇒ voz que suena una vez (máx. 6, se corta la
  más antigua; antirrebote 80 ms) · resto (y todo Spotify/YouTube) ⇒ canal principal.
- Política externa: «la última pulsación manda». Empieza/reanuda Spotify o YouTube ⇒ `detenerCapas`; activar una capa con
  Spotify/YouTube de DFY sonando ⇒ `detener()` (estado `otra` = canción del usuario: no se toca). Avisos en la barra.
- Cada canal: estado, volumen, silencio, bucle (de la pista). Quitado mientras carga ⇒ no suena. Reproductor desmontado ⇒ para todo.
- Volumen: maestro × canal (música = `local`; YouTube incluido). Clave nueva `banda-sonora:mezcla` {maestro, ambiente,
  efecto}; los silencios no se guardan. Al recargar no suena nada. Sin tablas nuevas.
- Borrar pista/elemento/sonido (suscripción a `pistas`) o cerrar sesión ⇒ se detiene y se suelta el archivo. `urlDe`
  renueva URLs firmadas pasadas 5 h o con `renovar` (la mezcla reintenta una vez). Pruebas: `window.__mezclaDFY|__mezclaEstado`.

## Comandos y pruebas
- `npm run dev|build|preview` (4173) · `build:prueba`+`preview:prueba` (4174, Supabase simulado) ·
  `build:spotify`+`preview:spotify` (4175)
- `npm run test:identidad|sql|enlaces|biblioteca|musica|compartir|reproductor|cambio-fuente|transporte|mezclador` (4173) ·
  `test:supabase|email|mezclador-supabase` (4174) · `test:spotify` (4175)
- Despliegue: Vercel publica cada push a `main`. Las ramas generan vista previa (usa variables de «Preview»).
  Google en vistas previas: Supabase solo vuelve a URLs de su lista ⇒ usar email o añadir `https://*.vercel.app/**`.

## Git
F1 `ccr-4e49e839-kg8cvn`, F2 `fase-2-mezclador` (se conservan). A `main` SOLO con permiso. Recuperación: pre-F1 `fa42f32`, pre-F2 `38ad9ec`.

## Estado
| Fase | Estado |
|------|--------|
| v3 (Supabase+Google+email, PWA, Connect), identidad DFY, F1 Biblioteca v4 + reproductor + controles | Publicadas en `main` (002 ejecutado) |
| F2 Mezclador básico (3 ambientes, efectos, maestro, panel) | Hecho en `fase-2-mezclador`, probado con simuladores; falta prueba manual en la vista previa. Sin fundidos ni escenas (F3) |
