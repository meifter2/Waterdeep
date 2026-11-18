# CLAUDE.md — DFY · «El sonido de tus aventuras» (antes «Banda sonora»)

> Contexto para Claude Code. Breve (≤100 líneas). Actualizar al cerrar cada fase.
## Resumen
**DFY** = D (D20) + FY (Spotify). «El sonido de tus aventuras». Icono: D20 dorado con ondas (`public/iconos/dfy*`). Antes «Banda sonora».
Mesa de sonido del máster de D&D: 7 carpetas (Opening, Ending, Personajes, Lugares, Momentos, Ambientes, Efectos); elementos
con retrato y pistas (Spotify, YouTube, archivos propios, enlaces https a audio o Freesound; etiqueta, tramo, bucle), sin duplicar sonidos.
Cuentas Google o email (Supabase Auth + RLS). Connect opcional (Premium). PWA. Sin variables de Supabase ⇒ «modo local».
Roadmap (NO empezar sin pedirlo): F3 sesión/escenas · F4 biblioteca de solo lectura para jugadores (solo lo publicado).

## Usuario y forma de trabajar
- **Siempre en español**, explicando cada paso. Experto en producto/UX/frontend, no programador. Dicta por voz.
- Plan antes de cambios grandes; preguntar lo importante. **Ahorrar tokens**: empezar aquí. **Archivos ≤ ~1000 líneas** (máx. 1500).
- **NO cambiar**: claves `banda-sonora:*`, IndexedDB `banda-sonora`, políticas «banda sonora: …», `window.__audioBandaSonora`, tablas, buckets, variables, rutas.
- Nada del libro. UI en español. Frontend ⇒ `frontend-design`; Supabase ⇒ `supabase(-postgres-best-practices)`. Nunca secretos ni `.env`.

## Stack
React 19 + TS + Vite · Zustand · CSS plano con tokens · @supabase/supabase-js y @electric-sql/pglite (fijadas).
Variables públicas (Vercel y `.env.local`): `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SPOTIFY_CLIENT_ID`.
Solo servidor (Vercel, Production+Preview; NUNCA con `VITE_`): `FREESOUND_API_KEY`. Función: `api/sonidos.ts` (`tsconfig.api.json`).

## Base de datos (bd/)
- `esquema.sql` (v3, ya ejecutado por el usuario): tabla `canciones`. NO borrarla (la usa la versión publicada).
- `002-biblioteca.sql` (v4, idempotente, solo añade): `elementos`, `recursos`, `pistas` + RLS + buckets privados
  `audio` (50 MB) y `retratos` (5 MB) con políticas por carpeta `<uid>/…` + copia de `canciones` (marca `migrado_de`).
- `003-enlaces-audio.sql` (F2, idempotente, YA EJECUTADO por el usuario: NO volver a pedirlo): admite `origen = 'url'`
  (enlace https). Si faltara, guardar un enlace daría el aviso «ejecuta bd/003…» (23514).
- FK (id, user_id): mismo dueño. Cliente NUNCA envía `user_id`. Sin red a supabase.co/freesound.org: SQL con PGlite, app con simuladores.

## Estructura (`api/sonidos.ts` = función de Vercel)
```
src/data/  types (Elemento/Recurso/Pista, CARPETAS) · repositorio (Supabase|local+IndexedDB, errores traducidos)
           store (biblioteca, borrados optimistas, URLs) · guardar (elemento+pistas, subidas, reutilizar, importar)
           convertir (v2/v3→v4, copias v4, claveEnlace) · reproduccion (pistaId, repetir) · sesion
           mezcla (canales, `tocar`, política externa) · volumen (local, maestro, Spotify, transiciones)
src/lib/   enlaces · archivos (validación, SHA-256, retrato 512 WebP, IndexedDB) · tiempo (m:ss) · apis
           spotifyAuth/spotifyApi (Connect) · compartir · titulo (oEmbed) · pwa · supabase · freesound · audioRemoto
src/components/  Tarjeta (retrato + chips) · Seccion · editor/(EditorElemento, FilaPista, AnadirPista)
           BibliotecaSonidos · BuscarSonidos · Compartido · Copias · Migracion · ConexionSpotify · reproductor/ (motores, Mezclador)
src/styles/ tokens, base, app, tarjetas, reproductor, mezclador, buscar, dialogos, editor, entrada · pruebas/ (Playwright)
```

## Reproductor (no romper)
- Canal principal: UNA pista cada vez (el reproductor de siempre). Nunca superponer Spotify/YouTube con otras fuentes.
- **Pulsar tarjeta/chip = reproducir esa pista** (`reproducir`/`reproducirElemento`), nunca pausar. Si es la misma y suena de
  verdad, no se reinicia; si está en pausa, se reanuda; si Spotify cambió a otra, se vuelve a poner. Pausar/Reanudar/Detener
  solo en la barra. Órdenes atendidas UNA vez (`ordenAtendida`). Tarjeta = un botón; chips si hay varias pistas.
- Orden de tarjetas (`components/ordenar.ts`): asa (único `touch-action:none`), puntero en la ventana, teclado (espacio,
  flechas, Esc). `elementos.orden`: 0 = alfabético; `reordenar` numera 1..n, optimista, revierte si falla; nuevo ⇒ al final.
- Barra (`Transporte.tsx`): ■ · ▶/❚❚ `principal()` · ⟲. ■ RECUERDA la pista (`parado`; ▶ la repite desde el inicio);
  `olvidar()` (borrar/salir) la olvida. `cargando` ⇒ ▶ desactivado. Connect: ■ solo pausa si suena lo de DFY.
- Turnos en los motores; `parado` ignora eventos tardíos; solo informa el activo. Connect: cola, sondeo 4 s ⇒ `otra`; volumen REAL.
- Tramos: archivo exacto; YouTube start/endSeconds; Spotify aprox.; iframe ≤30 s (Brave/Safari/móvil). «Misma pista» exige mismo tramo.
  Connect: `position_ms` + comprobación a 1,5 s ⇒ `irA` (seek) si quedó antes del inicio (solo si suena lo de DFY). Integrado:
  `startAt` + hasta 3 `seek`. Externo: sin inicio posible ⇒ aviso (`avisoTramoExterno`). Prueba: `spotify-inicio` (4175).

## Mezcla (F2, `data/mezcla.ts` + `motorMezcla.ts` + `Mezclador.tsx`)
- Un HTMLAudioElement por voz (`MotorArchivo`; NO Web Audio: streaming, URLs firmadas sin CORS). iPhone ignora el volumen.
- «Audio propio» = `esLocal`: archivo subido o enlace `url` (https + extensión de audio; Dropbox ⇒ raw=1; se comprueba al
  añadir con `comprobarAudio`, que lee la duración). `urlDeRecurso` da la dirección. «Pegar enlace» + «Guardar y reproducir».
- YouTube (normas: reproductor visible ≥200×200, sin tapar, sin aislar/modificar su audio, uno a la vez): un vídeo largo
  en Ambientes suena en el reproductor PRINCIPAL visible (bucle, volumen oficial). Capas encima: solo con el interruptor.
- Enrutado `tocar(pista)`: archivo propio en Ambientes ⇒ canal de ambiente (pulsar activa/detiene; en pausa reanuda;
  con error reintenta), máx. 3, el 4.º se rechaza con aviso · en Efectos ⇒ voz que suena una vez (máx. 6, se corta la
  más antigua; antirrebote 80 ms) · resto (y todo Spotify/YouTube) ⇒ canal principal. Quitado mientras carga ⇒ no suena.
- Política externa: Spotify NUNCA se mezcla en DFY (su política). Tarjeta de Spotify con capas sonando ⇒ se abre en la app
  oficial (open.spotify.com; puede pedir ▶; DFY no la controla). Con Spotify de DFY sonando la capa no suena: aviso + «Abrir la
  canción en Spotify y seguir» (`pasarASpotify`). `otra` ⇒ bloquea (■ la suelta). YouTube bloquea salvo «Permitir ambientes con
  YouTube» (`youtubeConCapas`, apagado por defecto, en `banda-sonora:mezcla`). Elegir/reanudar externa ⇒ `detenerCapas`.
- Freesound («Buscar sonidos», X fija): navegador → `/api/sonidos` (sesión Supabase en `/auth/v1/user`, Origin/Sec-Fetch,
  parámetros acotados, clave en `Authorization: Token`, nunca reenvía textos de Freesound) → API v2. Licencias filtradas en el
  servidor por URL: CC0 y BY; BY-NC solo con casilla y marcado «Solo uso no comercial». Se guarda como `url`: enlace =
  MP3 de escucha + `#freesound=ID`; `descripcion` = «Freesound #ID · «Título» · autor · CC BY 4.0 · página» (`creditoDe`).
  MP3 caducado ⇒ `urlDeRecurso(r, true)` pide el vigente por id y actualiza el enlace (mezcla y canal principal). Sin estado
  en memoria: el límite es el de Freesound (429 ⇒ Retry-After); caché `private`. Sin clave / modo local ⇒ mensaje claro.
- Fundidos (F2B): `MotorArchivo` volumen = volumen × factor (`fundir`/`entrarCon`, por tiempo, igual potencia). Ambientes con
  entrada/salida (`saliendo`, se recuperan al volver a pulsar). Música propia: `MotorMusica` (2 reproductores; la anterior baja
  cuando la nueva SUENA; si falla, sigue la anterior). Instantáneo/Suave (3/3 s, defecto)/Cinematográfico (6/8 s) o a mano
  (`banda-sonora:mezcla`). Efectos, Detener todo, borrado, salir y Spotify/YouTube: SIEMPRE instantáneos. Pruebas que miden
  volúmenes fijan «instantaneo».
- Volumen: maestro × canal (música = `local`, YouTube incluido); `banda-sonora:mezcla` {maestro, ambiente, efecto}; silencios
  no se guardan; al recargar no suena nada. Borrar pista/sonido o cerrar sesión ⇒ se detiene y se suelta. `urlDe` renueva
  URLs firmadas pasadas 5 h o con `renovar` (la mezcla reintenta una vez). Pruebas: `window.__mezclaDFY|__mezclaEstado`.

## Comandos y pruebas
- `npm run dev|build|preview` (4173) · `build:prueba` (4174, Supabase simulado) · `build:spotify` (4175) · `npm run test:identidad|sql|enlaces|biblioteca|musica|compartir|reproductor|cambio-fuente|transporte|mezclador|enlaces-audio|fundidos`
  (4173) · `test:supabase|email|mezclador-supabase|buscar-sonidos|ordenar` (4174; la última usa la función real con Freesound
  simulado) · `test:spotify` (4175) · `test:api-sonidos` (Node, sin servidor). Freesound REAL: sin verificar hasta tener clave.

## Git
Vercel publica cada push a `main`; ramas ⇒ vista previa (variables «Preview»; Google no vuelve a ellas ⇒ usar email).
Ramas: F1 `ccr-4e49e839-kg8cvn`, F2 `fase-2-mezclador`, F2B `fase-2-fundidos`. A `main` SOLO con permiso. Vuelta atrás: pre-F2 `38ad9ec`, pre-F2B `7c51514`.

## Estado
| Fase | Estado |
|------|--------|
| v3 (Supabase+Google+email, PWA, Connect), identidad DFY, F1 Biblioteca v4 + reproductor + controles | Publicadas en `main` (002 ejecutado) |
| F2 Mezclador + ambientes por enlace + «Buscar sonidos» (Freesound) | Publicada en `main` (7c51514); Freesound real sin verificar (falta clave) |
| F2B Fundidos + X en «Buscar sonidos» + reordenar tarjetas | Publicada en `main` (433155b); falta prueba manual en producción |
| Corrección: inicio/tramo de Spotify (Connect, integrado, externo) | En `fase-2-fundidos`, sin integrar en `main` |
