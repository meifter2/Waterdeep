# Base de datos de DFY (Supabase)

DFY se llamaba antes «Banda sonora»: por eso los comentarios del SQL y los nombres de las políticas de Storage
(«banda sonora: …») conservan el nombre anterior. No hace falta cambiarlos.

Ejecutar en **Supabase › SQL Editor › New query › pegar el archivo entero › Run**, en este orden:

| Archivo | Qué hace | ¿Repetible? |
|---|---|---|
| `esquema.sql` | Tabla `canciones` (versión 3). | Sí |
| `002-biblioteca.sql` | Tablas `elementos`, `recursos` y `pistas`; seguridad por usuario (RLS); buckets privados `audio` (50 MB por archivo) y `retratos` (5 MB); copia las `canciones` existentes sin modificarlas. | Sí: no duplica nada |
| `003-enlaces-audio.sql` | Fase 2: admite sonidos que son un enlace https a un archivo de audio (MP3, OGG…) en streaming. Solo amplía una regla de `recursos`; no toca datos. | Sí |

Comprobación tras ejecutar `002`: en **Table Editor** aparecen `elementos`, `recursos` y `pistas` con «RLS enabled»,
y en **Storage** los buckets `audio` y `retratos`, ambos privados.

- La tabla `canciones` no se borra: la usa la versión anterior de la app mientras dure la transición.
- Si se añaden canciones con la versión anterior después de migrar, basta con volver a ejecutar `002`.
- Plan gratuito de Supabase: 1 GB de almacenamiento en total y 50 MB por archivo.

## Variables (Vercel › Settings › Environment Variables)

Todas son públicas (van en el navegador). Marcarlas para **Production** y **Preview**.

| Variable | Dónde se obtiene |
|---|---|
| `VITE_SUPABASE_URL` | Supabase › Project Settings › API Keys › Project URL |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Supabase › Project Settings › API Keys › Publishable key (`sb_publishable_…`) |
| `VITE_SPOTIFY_CLIENT_ID` | developer.spotify.com › tu app › Settings › Client ID (opcional) |

Nunca usar la `service_role` ni la `secret` en la app.
