# CLAUDE.md — Mesa del Máster («Waterdeep: Dragon Heist»)

> Contexto para Claude Code. Breve (≤100 líneas). Actualizar al cerrar cada fase.
> No repetir lo que ya está en el código: solo lo necesario para orientarse.

## Resumen
App web para que el máster dirija la campaña: fichas (PNJ, facciones, lugares, pistas,
personajes, sesiones) con **secretos sellados**, combate, dados y una **vista de jugadores**
sin secretos. Beta local: todo vive en el navegador (localStorage).

## Usuario y forma de trabajar
- Responder **siempre en español**, explicando cada paso. Usuario: experto en producto/UX/frontend, no programador puro.
- Plan antes de código en cambios grandes; preguntar decisiones importantes no cubiertas aquí.
- Leer solo los archivos necesarios para cada tarea.

## Reglas clave
- **Secretos del máster protegidos**: la vista de jugadores lee SOLO `proyeccionPublica()` (lista blanca).
  Un campo nuevo es privado salvo que se marque `publico: true` en `entities.ts`. Lo secreto lleva `secreto: true`.
- **Nada de contenido del libro**: ni textos, ni mapas, ni nombres/tramas propios de la aventura. Datos demo inventados.
- **Interfaz en español** (sentence case, sin mayúsculas sostenidas en etiquetas).
- **Frontend → skill `frontend-design` obligatoria.**
- Color lacre (`--lacre`) reservado a lo secreto. Nunca subir secretos ni `.env`.

## Stack
React 19 + TypeScript + Vite · React Router (HashRouter) · Zustand (persist → localStorage) · CSS plano con tokens.
Fuentes: Alegreya (títulos) + Alegreya Sans (interfaz), vía Google Fonts.

## Estructura
```
src/
  data/types.ts       modelo de datos (Datos, Entidad, Combate…)
  data/entities.ts    config declarativa de cada colección (campos, secreto/público, textos)
  data/store.ts       store Zustand + persistencia + import/validación + sync entre pestañas
  data/publico.ts     proyección pública (lo único que ve el jugador)
  data/demo.ts        campaña de ejemplo inventada
  data/ui.ts          tema y modo «ocultar secretos»
  data/storage.ts     localStorage tolerante a fallos
  components/         Layout (riel), Ficha (formulario genérico), Sello/BloqueSellado, Dados
  pages/              Mesa, Combate, Coleccion (lista+ficha genérica), VistaJugadores, Ajustes
  styles/             tokens.css (paleta claro/oscuro), base.css, app.css
```
Añadir un campo a una ficha = añadirlo en `entities.ts` (se pinta solo).

## Comandos
- `npm install` · `npm run dev` (desarrollo) · `npm run build` (typecheck + build a `dist/`)
- `npm run preview` (sirve `dist/`) · `npm run typecheck`
- Migraciones/despliegue: no aplica aún (sin backend).

## Convenciones
- Código y nombres en español. Componentes funcionales, sin librería de UI.
- Clases CSS en español; anidar selectores genéricos (`.ficha-campos .campo`) para evitar choques.
- Accesibilidad: labels en todos los campos, foco visible, `prefers-reduced-motion`.
- Auditoría de fugas: prueba Playwright que carga demo y verifica que ningún texto secreto aparece en `#/jugadores`.

## Git
Rama: `ccr-4e49e839-kg8cvn`. Commits pequeños en español.

## Estado de fases
| Fase | Descripción | Estado |
|------|-------------|--------|
| 0 | CLAUDE.md y contexto | Hecho |
| 1 | Beta local: fichas, secretos, mesa, combate, dados, vista jugadores, copias JSON | Hecho, pendiente de prueba manual del usuario |
| 2 | Backend (p. ej. Supabase + RLS) para que cada jugador use su móvil con secretos protegidos en servidor | Por decidir |
