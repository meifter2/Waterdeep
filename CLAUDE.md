# CLAUDE.md — DFY · «El sonido de tus aventuras» (antes «Banda sonora»)

> Contexto para Claude Code. Breve (≤100 líneas). Actualizar al cerrar cada fase.

## Resumen
**DFY** = D (dado D20) + FY (guiño a Spotify). Eslogan: «El sonido de tus aventuras». Icono: D20 dorado con ondas
sobre verde muelle (`public/iconos/dfy*.png|svg`). Antes se llamaba «Banda sonora».
Mesa de sonido personal del máster de D&D. Elementos en 7 carpetas (Opening, Ending, Personajes, Lugares,
Momentos, Ambientes, Efectos), cada uno con retrato opcional y una o varias pistas (sonidos de Spotify, YouTube,
archivos propios o enlaces https a audio, con etiqueta, tramo y bucle). Los sonidos se reutilizan sin duplicar.
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
- `003-enlaces-audio.sql` (F2, idempotente, PENDIENTE de ejecutar): admite `origen = 'url'` (enlace https). Sin él, guardar
  un enlace de audio en Supabase falla con aviso «ejecuta bd/003…» (23514); el modo local no lo necesita.
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
- Turnos («generacion») en todos los motores; motor `parado` ignora eventos tardíos; solo informa el motor activo (`activoRef`).
- Connect: cola (solo la última orden); `estadoActual` lee uri/contexto/dispositivo/progreso/volumen; sondeo 4 s ⇒ `otra`.
- Volumen (`data/volumen.ts`): «local» (MP3+YouTube, `banda-sonora:volumen`, 70 %) y «spotify» (REAL del dispositivo, nunca
  forzado; PUT 1/350 ms, 429 ⇒ Retry-After; sin `supports_volume` o iframe ⇒ desactivado; silencio = 0 y recuperar).
- Bucle por pista («Repetir» al vuelo). Tramos: archivo exacto; YouTube start/endSeconds; Spotify aprox.; Connect ±1 s.
  Errores: YouTube 101/150, Spotify ≤30 s (cookies Brave/Safari; móvil siempre 30 s), API no carga ⇒ respaldo.

## Mezcla (F2, `data/mezcla.ts` + `motorMezcla.ts` + `Mezclador.tsx`)
- Un HTMLAudioElement por voz reutilizando `MotorArchivo` (NO Web Audio: streaming de archivos largos, URLs firmadas
  sin CORS, sin AudioContext en móvil). Límite: iPhone ignora el volumen por elemento (el silencio sí va).
- «Audio propio» = `esLocal`: archivo subido o enlace `url` (https + extensión de audio; Dropbox ⇒ raw=1; se comprueba al
  añadir con `comprobarAudio`, que lee la duración). `urlDeRecurso` da la dirección. «Pegar enlace» + «Guardar y reproducir».
- YouTube (normas: reproductor visible ≥200×200, sin tapar, sin aislar/modificar su audio, uno a la vez): un vídeo largo
  en Ambientes suena en el reproductor PRINCIPAL visible (bucle, volumen oficial). NUNCA se le superponen capas locales.
- Enrutado `tocar(pista)`: archivo propio en Ambientes ⇒ canal de ambiente (pulsar activa/detiene; en pausa reanuda;
  con error reintenta), máx. 3, el 4.º se rechaza con aviso · en Efectos ⇒ voz que suena una vez (máx. 6, se corta la
  más antigua; antirrebote 80 ms) · resto (y todo Spotify/YouTube) ⇒ canal principal. Quitado mientras carga ⇒ no suena.
- Política externa: elegir/reanudar Spotify o YouTube como música ⇒ `detenerCapas`. Ambiente/efecto con Spotify/YouTube
  `sonando|cargando|otra` ⇒ NO se corta la música ni se lanza la capa; aviso «Para combinar ambientes y efectos, utiliza música
  en archivo propio.» (`externaSonando`). En pausa/detenida sí se lanza. Elegir música en archivo sustituye a la externa.
- Volumen: maestro × canal (música = `local`, YouTube incluido); `banda-sonora:mezcla` {maestro, ambiente, efecto}; silencios
  no se guardan; al recargar no suena nada. Borrar pista/sonido o cerrar sesión ⇒ se detiene y se suelta. `urlDe` renueva
  URLs firmadas pasadas 5 h o con `renovar` (la mezcla reintenta una vez). Pruebas: `window.__mezclaDFY|__mezclaEstado`.

## Comandos y pruebas
- `npm run dev|build|preview` (4173) · `build:prueba`+`preview:prueba` (4174, Supabase simulado) ·
  `build:spotify`+`preview:spotify` (4175)
- `npm run test:identidad|sql|enlaces|biblioteca|musica|compartir|reproductor|cambio-fuente|transporte|mezclador|enlaces-audio` (4173) ·
  `test:supabase|email|mezclador-supabase` (4174) · `test:spotify` (4175)
- Despliegue: Vercel publica cada push a `main`. Las ramas generan vista previa (usa variables de «Preview»).
  Google en vistas previas: Supabase solo vuelve a URLs de su lista ⇒ usar email o añadir `https://*.vercel.app/**`.

## Git
F1 `ccr-4e49e839-kg8cvn`, F2 `fase-2-mezclador` (se conservan). A `main` SOLO con permiso. Recuperación: pre-F1 `fa42f32`, pre-F2 `38ad9ec`.

## Estado
| Fase | Estado |
|------|--------|
| v3 (Supabase+Google+email, PWA, Connect), identidad DFY, F1 Biblioteca v4 + reproductor + controles | Publicadas en `main` (002 ejecutado) |
| F2 Mezclador básico + ambientes por enlace (audio https, YouTube visible) | En `fase-2-mezclador`, probado con simuladores; falta ejecutar 003 y prueba manual. Sin fundidos (F2B) ni escenas (F3) |
