# CLAUDE.md — Banda sonora («Waterdeep: Dragon Heist»)

> Contexto para Claude Code. Breve (≤100 líneas). Actualizar al cerrar cada fase.
> No repetir lo que ya está en el código: solo lo necesario para orientarse.

## Resumen
App web del máster centrada SOLO en la música: cada personaje tiene una canción (enlace de
Spotify o YouTube). Pulsar el personaje → suena en el reproductor integrado. Nada más por ahora
(sin dados, fichas, combate…: retirados a petición del usuario; están en el historial de git).
Datos en el navegador (localStorage). El usuario tiene Spotify Premium.

## Usuario y forma de trabajar
- Responder **siempre en español**, explicando cada paso. Usuario: experto en producto/UX/frontend, no programador puro.
  Suele dictar por voz: interpretar con cuidado y preguntar si algo es ambiguo.
- Plan antes de cambios grandes; preguntar decisiones importantes no cubiertas aquí.
- **Prioridad: ahorrar tokens.** Empezar SIEMPRE por este archivo; leer solo lo necesario
  (grep/offset en archivos largos); no releer lo ya leído; respuestas concisas.
- **Tamaño de archivo: máximo ~1000 líneas** (límite duro 1500). Dividir por responsabilidad.

## Reglas clave
- **Nada de contenido del libro** en el código (textos, mapas, tramas). El máster mete su material.
- **Interfaz en español** (sentence case, sin mayúsculas sostenidas).
- **Frontend → skill `frontend-design` obligatoria.**
- Nunca subir secretos ni `.env`.

## Stack
React 19 + TypeScript + Vite · Zustand (persist → localStorage) · CSS plano con tokens.
Reproducción: Spotify iFrame API + YouTube IFrame Player API (scripts oficiales cargados en ejecución).
Fuentes: Alegreya (títulos) + Alegreya Sans (interfaz).

## Estructura
```
src/
  App.tsx                     pantalla única: cabecera, buscador, grupos de tarjetas
  data/types.ts               Personaje { nombre, enlace, grupo, nota }
  data/store.ts               personajes + persistencia + validación de copias
  data/reproduccion.ts        estado del reproductor (qué suena, pausa, repetir)
  lib/enlaces.ts              interpreta enlaces Spotify/YouTube (todos los formatos)
  lib/apis.ts                 carga de las APIs oficiales (con límite de 10 s)
  components/reproductor/     Reproductor (barra inferior) + motorSpotify + motorYoutube
  components/                 Tarjeta, Editor (dialog), Copias (dialog), Confirmar
  styles/                     tokens, base, app, reproductor, dialogos
pruebas/                      enlaces.test.ts (formatos) · musica.cjs (flujo con APIs simuladas)
```

## Comportamiento del reproductor (no romper)
- Un único reproductor por servicio, reutilizado (Spotify `loadUri`, YouTube `loadVideoById`).
- Pulsar el personaje que suena = pausa/reanuda. Cambiar de servicio pausa/detiene el otro.
- «Repetir» (por defecto sí) reinicia al terminar. Spotify con duración ≤30 s ⇒ aviso de sesión no iniciada.
- YouTube errores 101/150 ⇒ «no permite reproducirlo fuera de YouTube». Vídeo visible ≥200 px (normas de YouTube).
- Si la API no carga ⇒ iframe básico de respaldo y aviso «Pulsa ▶».
- La música NO suena dentro del visor de artifacts de claude.ai (bloquea iframes externos).

## Comandos
- `npm install` · `npm run dev` · `npm run build` (typecheck + build) · `npm run preview`
- `npm run test:enlaces` · `npm run test:musica` (requiere `npm run preview` en :4173 y Playwright)
- Despliegue: Vercel (plan Hobby) publica automáticamente cada push a `main`.

## Convenciones
- Código y nombres en español. Componentes funcionales; sin librería de UI ni router.
- Selectores CSS anidados para evitar choques. Accesibilidad: labels, foco visible, reduced-motion.

## Git
Trabajo en `ccr-4e49e839-kg8cvn`; el usuario autorizó llevarlo a `main` (despliegue). Commits pequeños en español.

## Estado de fases
| Fase | Descripción | Estado |
|------|-------------|--------|
| 1 | Beta amplia (fichas, combate, dados…) | Retirada por el usuario |
| 2 | Banda sonora: personaje → canción Spotify/YouTube | Hecha; falta prueba real del usuario |
| 3 | Publicación en Vercel desde `main` | Hecha; falta prueba real del usuario |
