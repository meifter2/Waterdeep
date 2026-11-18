# Propuesta: ambientes mezclables tan fáciles como pegar un enlace de YouTube

Estado: **1.ª versión implementada (Freesound, sección 4)** en `fase-2-mezclador`, probada con simuladores; falta probarla con una clave real. Supabase sin cambios (usa `origen = 'url'` de `bd/003`).

## 1. Qué permite YouTube (condiciones oficiales)

Fuentes: [Developer Policies](https://developers.google.com/youtube/terms/developer-policies),
[Guía de cumplimiento](https://developers.google.com/youtube/terms/developer-policies-guide),
[Required Minimum Functionality](https://developers.google.com/youtube/terms/required-minimum-functionality),
[Parámetros del reproductor](https://developers.google.com/youtube/player_parameters).
(Leídas a través del buscador: desde este entorno no se puede abrir developers.google.com.)

| Caso | ¿Permitido? | Norma |
|---|---|---|
| Reproductor visible que el usuario inicia pulsando ▶ en el propio vídeo | Sí | Uso normal de un reproductor insertado (mínimo 200 × 200 px, sin tapar sus controles) |
| Reproducción iniciada por la app (IFrame API `playVideo`, autoplay) | Sí, con condiciones | Solo con más de la mitad del reproductor visible y **como máximo un reproductor de YouTube reproduciendo automáticamente a la vez por página** |
| Reproducción en segundo plano (reproductor oculto, fuera de pantalla o sin mostrar) | **No** | Prohibido ofrecer funciones que reproduzcan desde un reproductor que no se muestra en la página que el usuario ve |
| Extraer, aislar o separar el audio (MP3 de un vídeo, audio sin vídeo) | **No** | Prohibido separar, aislar o modificar el audio o el vídeo |
| Tapar el reproductor o ponerle capas encima | **No** | Prohibido ocultar cualquier parte del reproductor, incluidos sus controles |
| Volumen y silencio con la API oficial (`setVolume`, `mute`) | Sí | Funciones documentadas del reproductor |
| Otro audio de la app sonando a la vez que un vídeo visible | **Zona gris** | No he encontrado ninguna norma que lo prohíba expresamente. El riesgo es que se interprete como «modificar el audio». |
| Dos vídeos de YouTube sonando a la vez | **No** (si los pone DFY) | Solo puede haber un reproductor con reproducción automática a la vez |

**Conclusión YouTube.** Estas cosas no son viables sin incumplir las normas:
- convertir un vídeo de YouTube en una capa de la mezcla;
- usar YouTube como ambiente oculto;
- poner dos YouTube a la vez.

Lo único discutible es dejar sonar capas MP3 propias mientras se ve un único vídeo de YouTube intacto. Hoy DFY lo bloquea por prudencia. Se podría abrir como **opción explícita del usuario**, sin tocar nunca el vídeo. Lo dejo como decisión aparte (opción Y2) y no la recomiendo como solución principal.

## 2. Spotify

La [Developer Policy](https://developer.spotify.com/policy/) prohíbe expresamente que una app o sistema haga transiciones, mezcle, remezcle o superponga contenido de Spotify con cualquier otro audio. DFY ya lo cumple: Spotify Connect queda fuera de la mezcla y las capas no suenan mientras suena Spotify. **No cambia nada.**

## 3. Fuentes de ambientes con licencia y enlaces permanentes

| Fuente | Licencias | Acceso | Enlace que reproduce DFY | Encaje |
|---|---|---|---|---|
| **[Freesound](https://freesound.org/docs/api/overview.html)** | CC0, CC BY, CC BY-NC (por sonido) | API con clave (`token`); **gratis solo para uso no comercial**. Previews sin OAuth2. | `preview-hq-mp3` (MP3 ~128 kbps, CDN, sin caducidad) | **El mejor**: miles de ambientes (lluvia, taberna, bosque…), filtros por duración y licencia, valoraciones |
| [Openverse](https://docs.openverse.org/api/reference/search_algorithm.html) | CC y dominio público | Sin clave (anónimo: ~20/min, 200/día) | Enlace directo del origen (Freesound, Jamendo, Wikimedia) | Bueno como buscador sin clave; datos de categoría y duración menos fiables |
| Internet Archive | Lo que declare quien sube (hay que filtrar `licenseurl`) | `advancedsearch.php` sin clave; CORS sin confirmar | `archive.org/download/<id>/<archivo>` (estable, redirige) | Grabaciones de horas, pero calidad y licencias muy irregulares |
| Wikimedia Commons | Libres (por archivo) | API con `origin=*` (CORS) | `upload.wikimedia.org/…` (hotlinking permitido, no recomendado) | Pocos ambientes largos; muchos en OGG (Safari antiguo falla) |
| [Tabletop Audio](https://tabletopaudio.com/about.html) | CC BY-NC-ND 4.0 | **Sin API pública** | — | Ideal para rol (pistas de 10 min), pero solo pegando enlaces a mano; su SoundPad no se puede usar fuera de su web |
| Pixabay, BBC Sound Effects | Propias | Sin API de audio / solo descarga | — | Descartadas |

**Clave privada.** La clave de Freesound **no puede ir en el navegador**: viaja en la URL y cualquiera podría copiarla. Solución: una función de servidor de Vercel que guarda la clave en una variable de entorno **sin** prefijo `VITE_` (nunca llega al navegador).

**Enlaces temporales.**
- Se guardan solo URLs permanentes: las previews de Freesound y `archive.org/download`.
- Nunca se guardan enlaces firmados o con caducidad (descargas OAuth de Freesound, redirecciones a servidores numerados de archive.org).
- Si el autor borra un sonido, DFY ya muestra el error del canal.

## 4. Propuesta recomendada (fase 2C): «Buscar ambientes libres» con Freesound

Experiencia: **buscar → escuchar → añadir → sonar en la mezcla**, sin descargar ni subir nada.

1. **Botón «Buscar sonidos»** en la cabecera y en las carpetas Ambientes y Efectos. Abre una ventana con:
   - buscador («lluvia», «tavern», «forest night»…), con la carpeta ya elegida;
   - filtro de duración automático: Ambientes ≥ 1 min; Efectos ≤ 15 s;
   - licencias: CC0 y CC BY por defecto; casilla «Incluir NC (solo uso no comercial)»;
   - resultados con título, autor, licencia, duración, valoración y botón ▶ de escucha. La escucha sigue la regla de siempre: no suena encima de Spotify ni de YouTube.
2. **«Añadir y reproducir»**:
   - crea el elemento y un recurso `origen = 'url'` con el MP3 de la preview, la duración y en `descripcion` el crédito «“Rain” de autor · CC BY 4.0 · freesound.org/s/123»;
   - lo pone a sonar en su canal de la mezcla;
   - reutiliza el sonido si ya estaba (misma URL);
   - no hace falta SQL nuevo, basta con el 003.
3. **Créditos**: el crédito se ve en la biblioteca de sonidos y en el editor (obligatorio en CC BY).
4. **Servidor** (`api/sonidos.ts`, función de Vercel):
   - qué hace: recibe la búsqueda, añade la clave (`FREESOUND_API_KEY`), pide a Freesound solo los campos necesarios (`id, name, username, license, duration, previews, url`) y devuelve una lista limpia;
   - acceso: solo responde a sesiones válidas de DFY, para que nadie gaste la cuota de la clave (60 peticiones/min, 2000/día);
   - caché: guarda los resultados una hora.
5. **Pruebas** con un Freesound simulado:
   - búsqueda, filtros y licencias;
   - escucha previa;
   - añadir y reproducir en la mezcla;
   - créditos;
   - errores (sin clave, cuota agotada, sonido borrado);
   - que la clave nunca aparezca en el código del navegador.
6. **Lo que tendrías que hacer tú (una vez)**:
   - crear una cuenta en Freesound;
   - pedir una clave de API (gratuita, uso no comercial);
   - añadirla en Vercel como `FREESOUND_API_KEY` (Production y Preview).

   Es una variable **nueva**: las actuales no se tocan.

### Ampliaciones posibles (después)
- **Openverse sin clave** como segunda fuente: Jamendo para música y Wikimedia, por el mismo servidor.
- **Internet Archive** para grabaciones de horas, solo con licencia CC o dominio público declarada.
- **Opción Y2**: «Permitir efectos propios mientras se ve un vídeo de YouTube». Desactivada por defecto, con el vídeo siempre visible e intacto. Solo si tú decides asumir esa zona gris.
- **Fundidos (F2B)**: el bucle con fundido cruzado suaviza el corte de ambientes cortos (muchos de Freesound duran 2–10 min).

## 5. Límites honestos
- **Duración:** Freesound tiene muchos ambientes de 1–10 min y pocos de una hora. En bucle sirven para la mesa (Tabletop Audio usa pistas de 10 min), pero el corte se notará hasta tener fundidos.
- **Calidad:** las previews son MP3 de ~128 kbps; suficiente para ambientes. Hay que confirmar en el prototipo que la preview es el sonido completo.
- **Uso comercial:** la API de Freesound es gratuita solo para uso no comercial. Si algún día DFY se vende o se monetiza, habría que licenciarla.
- **Sin pruebas reales todavía:** este entorno no llega a Freesound, Openverse ni archive.org. Se probaría con simuladores y después en la vista previa con tu clave.
