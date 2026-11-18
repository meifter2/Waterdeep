// Mezclador (fase 2): música + ambientes + efectos a la vez, en modo local (preview 4173).
// Los casos con Supabase (enlace caducado, carga lenta cancelada, cerrar sesión) están en mezclador-supabase.cjs.
const { chromium } = require('playwright');
const { SPOTIFY, YOUTUBE } = require('./falsos.cjs');
const { wav, crearElemento, comprobador, CAPTURAS } = require('./ayuda.cjs');
const URL = 'http://localhost:4173/';
const { comprobar, fin } = comprobador();
const cerca = (a, b) => Math.abs(a - b) < 0.011;

(async () => {
  const b = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const ctx = await b.newContext({ viewport: { width: 1280, height: 860 } });
  await ctx.route('https://open.spotify.com/embed/iframe-api/v1', (r) => r.fulfill({ contentType: 'text/javascript', body: SPOTIFY }));
  await ctx.route('https://www.youtube.com/iframe_api', (r) => r.fulfill({ contentType: 'text/javascript', body: YOUTUBE }));
  await ctx.route(/oembed/, (r) => r.fulfill({ json: {} }));
  // «Abrir en Spotify» abre una pestaña: aquí solo se anota a dónde.
  await ctx.addInitScript(() => { window.__abiertos = []; window.open = (u) => { window.__abiertos.push(String(u)); return null; }; });
  const p = await ctx.newPage();
  const errores = [];
  p.on('pageerror', (e) => errores.push(String(e)));
  await p.goto(URL);
  await p.evaluate(() => { localStorage.clear(); indexedDB.deleteDatabase('banda-sonora'); localStorage.setItem('banda-sonora:mezcla', JSON.stringify({ transicion: 'instantaneo', entrada: 0, salida: 0 })); }); // fundidos: ver fundidos.cjs
  await p.reload();

  // Duraciones distintas: archivos idénticos se reutilizarían como un único sonido.
  const archivo = (nombre, s) => ({ archivo: { name: nombre + '.wav', mimeType: 'audio/wav', buffer: wav(s) } });
  await crearElemento(p, { tipo: 'lugar', nombre: 'Taberna', sonidos: [archivo('taberna', 20)] });
  await crearElemento(p, { tipo: 'lugar', nombre: 'Mercado', sonidos: [archivo('mercado', 21)] });
  await crearElemento(p, { tipo: 'ambiente', nombre: 'Lluvia', sonidos: [archivo('lluvia', 6)] });
  await crearElemento(p, { tipo: 'ambiente', nombre: 'Conversaciones', sonidos: [archivo('conversaciones', 7)] });
  await crearElemento(p, { tipo: 'ambiente', nombre: 'Viento', sonidos: [archivo('viento', 8)] });
  await crearElemento(p, { tipo: 'ambiente', nombre: 'Fuego', sonidos: [archivo('fuego', 9)] });
  await crearElemento(p, { tipo: 'efecto', nombre: 'Puerta', sonidos: [archivo('puerta', 1)] });
  await crearElemento(p, { tipo: 'personaje', nombre: 'Nomad', sonidos: [{ enlace: 'https://youtu.be/dQw4w9WgXcQ' }] });
  await crearElemento(p, { tipo: 'lugar', nombre: 'Puerto', sonidos: [{ enlace: 'https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT' }] });

  // ── Ayudas ──
  const estado = () =>
    p.evaluate(() => {
      const e = window.__mezclaEstado();
      const d = window.__mezclaDFY ? window.__mezclaDFY.diagnostico() : [];
      const a = window.__audioBandaSonora;
      const audio = (id) => d.find((x) => x.id === id) || {};
      return {
        amb: e.ambientes.map((c) => ({ nombre: c.nombre, estado: c.estado, ...audio(c.id) })),
        ef: e.efectos.map((v) => ({ nombre: v.nombre, estado: v.estado })),
        voces: d,
        aviso: e.aviso,
        principal: a ? { pausado: a.paused, src: a.src, volumen: a.volume, silenciado: a.muted } : null,
      };
    });
  const ambiente = (n) => p.getByRole('button', { name: new RegExp(`^(Activar|Detener) ambiente ${n}$`) });
  const efecto = (n) => p.getByRole('button', { name: `Lanzar efecto ${n}`, exact: true });
  const musica = (n) => p.getByRole('button', { name: `Reproducir ${n}`, exact: true });
  const btn = (n) => p.getByRole('button', { name: n, exact: true });
  const panel = () => p.locator('#mezclador');
  const ambSonando = (s) => s.amb.filter((c) => c.estado === 'sonando' && c.pausado === false).map((c) => c.nombre).sort().join(',');
  const audiblesOcultos = (s) => s.voces.filter((v) => !v.pausado).length + (s.principal && !s.principal.pausado ? 1 : 0);
  const esperarAmb = (nombres) =>
    p.waitForFunction((n) => {
      const e = window.__mezclaEstado();
      const d = window.__mezclaDFY ? window.__mezclaDFY.diagnostico() : [];
      return e.ambientes.filter((c) => c.estado === 'sonando' && d.some((x) => x.id === c.id && !x.pausado)).map((c) => c.nombre).sort().join(',') === n;
    }, nombres.split(',').sort().join(','), { timeout: 8000 });
  const esperarPrincipal = () => p.waitForFunction(() => window.__audioBandaSonora && !window.__audioBandaSonora.paused, null, { timeout: 8000 });

  // ══ 1. Música local + lluvia + conversaciones a la vez ══
  await musica('Taberna').click();
  await esperarPrincipal();
  await ambiente('Lluvia').click();
  await ambiente('Conversaciones').click();
  await esperarAmb('Lluvia,Conversaciones');
  let s = await estado();
  const srcs = new Set([s.principal.src, ...s.amb.map((c) => c.src)]);
  comprobar('1. Música + lluvia + conversaciones suenan a la vez, cada una con su audio', !s.principal.pausado && ambSonando(s) === 'Conversaciones,Lluvia' && srcs.size === 3, JSON.stringify(s.amb.map((c) => c.nombre)));
  comprobar('1. Los ambientes van en bucle por defecto', s.amb.every((c) => c.bucle));
  comprobar('1. Las tarjetas de ambiente se marcan como activas (aria-pressed)', (await ambiente('Lluvia').getAttribute('aria-pressed')) === 'true' && (await ambiente('Viento').getAttribute('aria-pressed')) === 'false');
  comprobar('1. La barra indica las capas que suenan', (await p.locator('.boton-mezcla-cuenta').innerText()) === '2');

  // ══ 2. Tres ambientes y el límite ══
  await ambiente('Viento').click();
  await esperarAmb('Lluvia,Conversaciones,Viento');
  await ambiente('Fuego').click();
  await p.waitForTimeout(300);
  s = await estado();
  comprobar('2. Tres ambientes sonando a la vez', ambSonando(s) === 'Conversaciones,Lluvia,Viento');
  comprobar('2. El cuarto no entra y se explica por qué', s.amb.length === 3 && !s.amb.some((c) => c.nombre === 'Fuego') && (await p.locator('.reproductor-aviso[data-mezcla]').innerText()).includes('Ya suenan 3 ambientes'));
  // Pulsar otra vez un ambiente lo detiene y libera su audio; entonces sí cabe otro.
  await ambiente('Viento').click();
  await p.waitForTimeout(200);
  s = await estado();
  comprobar('2. Pulsar de nuevo un ambiente lo detiene y suelta su archivo', s.amb.length === 2 && s.voces.filter((v) => v.capa === 'ambiente').length === 2 && (await ambiente('Viento').getAttribute('aria-pressed')) === 'false');
  await ambiente('Fuego').click();
  await esperarAmb('Lluvia,Conversaciones,Fuego');
  comprobar('2. Con un hueco libre, el nuevo ambiente sí entra', true);
  await ambiente('Fuego').click();
  await esperarAmb('Lluvia,Conversaciones');

  // ══ 3. Efecto sin detener música ni ambientes ══
  await efecto('Puerta').click();
  await p.waitForFunction(() => window.__mezclaEstado().efectos.some((v) => v.estado === 'sonando'), null, { timeout: 5000 });
  s = await estado();
  comprobar('3. El efecto suena y la música y los ambientes siguen', !s.principal.pausado && ambSonando(s) === 'Conversaciones,Lluvia' && s.ef.length === 1);
  await p.waitForTimeout(150);
  await efecto('Puerta').click();
  await p.waitForTimeout(150);
  await efecto('Puerta').click();
  await p.waitForTimeout(250);
  s = await estado();
  comprobar('3. Se puede repetir rápido: varias puertas a la vez', s.voces.filter((v) => v.capa === 'efecto' && !v.pausado).length >= 2, `${s.ef.length} lanzados`);
  await p.waitForFunction(() => window.__mezclaEstado().efectos.length === 0, null, { timeout: 5000 });
  comprobar('3. Al terminar, el efecto se va solo (no queda nada sonando)', (await estado()).voces.filter((v) => v.capa === 'efecto' && !v.pausado).length === 0);
  await efecto('Puerta').dblclick();
  await p.waitForTimeout(150);
  comprobar('3. Un doble toque accidental no lanza dos copias', (await estado()).ef.length === 1);
  for (let i = 0; i < 9; i++) {
    await efecto('Puerta').click();
    await p.waitForTimeout(90);
  }
  s = await estado();
  comprobar('3. Límite de voces: como mucho 6 efectos a la vez', s.voces.filter((v) => v.capa === 'efecto').length <= 6 && s.voces.filter((v) => v.capa === 'efecto' && !v.pausado).length <= 6 && s.ef.length <= 6, `${s.ef.length}`);
  await p.waitForFunction(() => window.__mezclaEstado().efectos.length === 0, null, { timeout: 5000 });

  // ══ 4. Cambiar la música principal sin detener los ambientes ══
  const antes = await estado();
  await musica('Mercado').click();
  await p.waitForFunction((src) => window.__audioBandaSonora.src !== src && !window.__audioBandaSonora.paused, antes.principal.src, { timeout: 5000 });
  s = await estado();
  comprobar('4. Cambia la música y los ambientes siguen con el mismo audio', ambSonando(s) === 'Conversaciones,Lluvia' && s.amb.every((c) => antes.amb.some((x) => x.src === c.src && c.t >= x.t)));

  // ══ 5–7. Panel, volúmenes y silencios ══
  await p.locator('.boton-mezcla').click();
  await panel().waitFor();
  s = await estado();
  comprobar('5. Abrir el panel no interrumpe nada', !s.principal.pausado && ambSonando(s) === 'Conversaciones,Lluvia');
  comprobar('5. El panel muestra cada canal con su nombre', (await panel().locator('.canal-nombre').allInnerTexts()).join('|').includes('Lluvia') && (await panel().innerText()).includes('Mercado'));
  await p.getByLabel('Volumen de Lluvia').fill('30');
  await p.waitForTimeout(100);
  s = await estado();
  const lluvia = () => s.amb.find((c) => c.nombre === 'Lluvia');
  const conv = () => s.amb.find((c) => c.nombre === 'Conversaciones');
  comprobar('5. Volumen independiente: solo cambia la lluvia', cerca(lluvia().volumen, 0.3) && cerca(conv().volumen, 0.6) && cerca(s.principal.volumen, 0.7), `${lluvia().volumen} ${conv().volumen} ${s.principal.volumen}`);
  await p.getByLabel('Volumen de la música').fill('50');
  await p.waitForTimeout(100);
  s = await estado();
  comprobar('5. El volumen de la música no toca los ambientes', cerca(s.principal.volumen, 0.5) && cerca(lluvia().volumen, 0.3));

  await btn('Silenciar Lluvia').click();
  await p.waitForTimeout(100);
  s = await estado();
  comprobar('6. Silenciar un canal no afecta a los demás', lluvia().silenciado && !conv().silenciado && !s.principal.silenciado && !lluvia().pausado);

  await p.getByLabel('Maestro').fill('50');
  await p.waitForTimeout(100);
  s = await estado();
  comprobar('7. El maestro afecta a toda la mezcla local', cerca(s.principal.volumen, 0.25) && cerca(conv().volumen, 0.3) && cerca(lluvia().volumen, 0.15), `${s.principal.volumen} ${conv().volumen}`);
  await btn('Silenciar la mezcla').click();
  await p.waitForTimeout(100);
  s = await estado();
  comprobar('7. Silenciar la mezcla calla todo (sin pausar)', s.principal.silenciado && s.amb.every((c) => c.silenciado && !c.pausado));
  await efecto('Puerta').click();
  await p.waitForTimeout(200);
  comprobar('7. Un efecto lanzado con la mezcla en silencio tampoco suena', (await estado()).voces.filter((v) => v.capa === 'efecto' && v.id).every((v) => v.silenciado));
  await btn('Activar el sonido de la mezcla').click();
  await p.waitForTimeout(100);
  s = await estado();
  comprobar('7. Al quitar el silencio vuelven los volúmenes (y la lluvia sigue en silencio)', !s.principal.silenciado && cerca(s.principal.volumen, 0.25) && !conv().silenciado && cerca(conv().volumen, 0.3) && lluvia().silenciado);
  await btn('Activar el sonido de Lluvia').click();
  await p.screenshot({ path: CAPTURAS + 'mezclador-escritorio.png' });

  // ══ 8. Detener todo ══
  await efecto('Puerta').click();
  await p.waitForTimeout(150);
  await btn('Detener todo').click();
  await p.waitForTimeout(400);
  s = await estado();
  comprobar('8. Detener todo: nada suena, ni oculto', audiblesOcultos(s) === 0 && s.amb.length === 0 && s.ef.length === 0, JSON.stringify(s.voces));
  comprobar('8. Los archivos de los ambientes se sueltan', s.voces.filter((v) => v.capa === 'ambiente').length === 0);
  comprobar('8. La barra queda en «Detenido» y recuerda la música', (await p.locator('.reproductor-estado').innerText()).startsWith('Detenido') && !(await p.locator('.control-principal').isDisabled()));
  comprobar('8. Las tarjetas dejan de marcarse', (await p.locator('.tarjeta[data-actual]').count()) === 0);

  // ══ 9. Cambios rápidos y cancelación ══
  await ambiente('Lluvia').click();
  await ambiente('Lluvia').click();
  await ambiente('Lluvia').click();
  await esperarAmb('Lluvia');
  await p.waitForTimeout(300);
  s = await estado();
  comprobar('9. Activar/detener/activar rápido: un único canal de lluvia, sin duplicados', s.amb.length === 1 && s.voces.filter((v) => v.capa === 'ambiente').length === 1 && s.voces.filter((v) => !v.pausado).length === 1);
  await ambiente('Lluvia').click();
  await ambiente('Conversaciones').click();
  await ambiente('Conversaciones').click();
  await p.waitForTimeout(500);
  s = await estado();
  comprobar('9. Lo que se detiene mientras carga no llega a sonar', s.amb.length === 0 && audiblesOcultos(s) === 0, JSON.stringify(s.voces));
  await ambiente('Lluvia').click();
  await esperarAmb('Lluvia');
  await musica('Taberna').click();
  await musica('Mercado').click();
  await musica('Taberna').click();
  await esperarPrincipal();
  await p.waitForTimeout(400);
  s = await estado();
  comprobar('9. Músicas seguidas: suena la última y el ambiente no se toca', (await p.locator('.reproductor-titulo').innerText()) === 'Taberna' && !s.principal.pausado && ambSonando(s) === 'Lluvia');

  // ══ 11. Mezcla local y Spotify/YouTube: no se superponen, y una capa nunca corta la música externa ══
  const AVISO = 'Para combinar ambientes y efectos, utiliza música en archivo propio';
  const avisoBarra = async () => ((await p.locator('.reproductor-aviso[data-mezcla]').count()) ? p.locator('.reproductor-aviso[data-mezcla]').innerText() : '');
  const logDesde = async (n) => (await p.evaluate(() => window.__log)).slice(n);
  const nLog = () => p.evaluate(() => window.__log.length);
  await efecto('Puerta').click();
  await p.waitForTimeout(100);
  await musica('Nomad').click(); // elegir expresamente una música externa: sustituye y aparta las capas
  await p.waitForFunction(() => (window.__log || []).some((l) => l.startsWith('yt:play')), null, { timeout: 8000 });
  await p.waitForTimeout(300);
  s = await estado();
  comprobar('11. Elegir YouTube detiene ambientes, efectos y el MP3 (sin audio oculto)', audiblesOcultos(s) === 0 && s.amb.length === 0 && s.ef.length === 0);
  comprobar('11. …y se explica en la barra', (await avisoBarra()).includes('YouTube no se mezcla'));

  let n = await nLog();
  await ambiente('Lluvia').click();
  await p.waitForTimeout(500);
  s = await estado();
  let log = await logDesde(n);
  comprobar('11. Ambiente con YouTube sonando: NO corta YouTube', !log.includes('yt:stop') && !log.includes('yt:pause') && (await p.locator('.reproductor-estado').innerText()).startsWith('Sonando'), log.join(' / '));
  comprobar('11. …no lanza el ambiente (nada suena por debajo)', s.amb.length === 0 && s.voces.filter((v) => !v.pausado).length === 0 && (await ambiente('Lluvia').getAttribute('aria-pressed')) === 'false');
  comprobar('11. …y avisa con el mensaje acordado', (await avisoBarra()).includes(AVISO), await avisoBarra());
  n = await nLog();
  await efecto('Puerta').click();
  await p.waitForTimeout(400);
  s = await estado();
  log = await logDesde(n);
  comprobar('11. Efecto con YouTube sonando: no corta YouTube ni suena el efecto', !log.includes('yt:stop') && !log.includes('yt:pause') && s.ef.length === 0 && s.voces.filter((v) => !v.pausado).length === 0, log.join(' / '));

  // Con YouTube en pausa ya no suena nada externo: las capas sí pueden sonar.
  await btn('Pausar').click();
  await p.waitForTimeout(200);
  n = await nLog();
  await ambiente('Lluvia').click();
  await esperarAmb('Lluvia');
  comprobar('11. Con YouTube en pausa, el ambiente sí suena y YouTube sigue en pausa', !(await logDesde(n)).some((l) => l.startsWith('yt:play')) && (await p.locator('.reproductor-estado').innerText()).startsWith('En pausa'));
  // Reanudar YouTube con ▶ es elegirlo expresamente: aparta las capas.
  await btn('Reproducir').click();
  await p.waitForTimeout(400);
  s = await estado();
  comprobar('11. Reanudar YouTube desde la barra aparta las capas (no se superponen)', s.amb.length === 0 && s.voces.filter((v) => !v.pausado).length === 0 && (await p.locator('.reproductor-estado').innerText()).startsWith('Sonando'));

  // Elegir expresamente una música en archivo sustituye a YouTube; luego los ambientes ya combinan.
  n = await nLog();
  await musica('Taberna').click();
  await esperarPrincipal();
  comprobar('11. Elegir una música en archivo sustituye a YouTube', (await logDesde(n)).includes('yt:stop') && (await p.locator('.reproductor-titulo').innerText()) === 'Taberna');
  await ambiente('Lluvia').click();
  await esperarAmb('Lluvia');
  comprobar('11. …y entonces el ambiente se combina con ella', !(await estado()).principal.pausado);

  // ══ Spotify con ambientes sonando: la tarjeta abre la canción en la app oficial (DFY nunca la mezcla) ══
  const PUERTO = 'https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT';
  const abiertos = () => p.evaluate(() => window.__abiertos);
  n = await nLog();
  await musica('Puerto').click();
  await p.waitForTimeout(400);
  s = await estado();
  log = await logDesde(n);
  comprobar('11. Spotify con ambientes sonando: se abre en la app de Spotify y DFY no la reproduce', (await abiertos()).at(-1) === PUERTO && !log.some((l) => l.startsWith('spotify:')), log.join(' / '));
  comprobar('11. …el ambiente sigue, la música anterior se detiene y se avisa de pulsar ▶ en Spotify', ambSonando(s) === 'Lluvia' && s.principal.pausado && (await avisoBarra()).includes('pulsa ▶ allí'));
  comprobar('11. …la tarjeta lo anuncia antes de pulsarla', (await musica('Puerto').getAttribute('title')).startsWith('Hay ambientes sonando: se abrirá en la app de Spotify'));

  // Sin capas sonando, la tarjeta de Spotify funciona como siempre (en DFY).
  await btn('Detener todo').click();
  await p.waitForTimeout(200);
  const abiertosAntes = (await abiertos()).length;
  await musica('Puerto').click();
  await p.waitForFunction(() => (window.__log || []).some((l) => l.startsWith('spotify:play')), null, { timeout: 8000 });
  await p.waitForTimeout(300);
  comprobar('11. Sin ambientes, Spotify suena en DFY como siempre', (await abiertos()).length === abiertosAntes && (await p.locator('.reproductor-estado').innerText()).startsWith('Sonando'));
  n = await nLog();
  await efecto('Puerta').click();
  await p.waitForTimeout(200);
  await ambiente('Conversaciones').click();
  await p.waitForTimeout(400);
  s = await estado();
  log = await logDesde(n);
  comprobar('11. Efecto o ambiente con Spotify de DFY sonando: Spotify sigue y la capa no suena', !log.includes('spotify:pause') && (await p.locator('.reproductor-estado').innerText()).startsWith('Sonando') && s.ef.length === 0 && s.amb.length === 0 && (await avisoBarra()).includes(AVISO), log.join(' / '));
  comprobar('11. …y el aviso ofrece pasar la canción a la app de Spotify', await btn('Abrir la canción en Spotify y seguir').isVisible());
  n = await nLog();
  await btn('Abrir la canción en Spotify y seguir').click();
  await esperarAmb('Conversaciones');
  log = await logDesde(n);
  comprobar('11. «Abrir en Spotify y seguir»: DFY pausa su canción, abre la app y lanza el ambiente', log.includes('spotify:pause') && (await abiertos()).at(-1) === PUERTO && (await p.locator('.reproductor-estado').innerText()).startsWith('Detenido'), log.join(' / '));
  comprobar('11. Los controles de volumen siguen intactos', (await p.locator('.boton-mezcla').isEnabled()) && (await p.locator('#volumen').isVisible()));
  await btn('Detener todo').click();
  await p.waitForTimeout(200);

  // ══ «Permitir ambientes con YouTube» (desactivado por defecto) ══
  const interruptor = p.getByLabel('Permitir ambientes con YouTube');
  comprobar('11b. El interruptor de YouTube empieza desactivado', !(await interruptor.isChecked()));
  await interruptor.check();
  await ambiente('Lluvia').click();
  await esperarAmb('Lluvia');
  n = await nLog();
  await musica('Nomad').click();
  await p.waitForFunction((k) => (window.__log || []).slice(k).some((l) => l.startsWith('yt:')), n, { timeout: 8000 });
  await p.waitForTimeout(400);
  s = await estado();
  comprobar('11b. Activado: al poner YouTube, el ambiente sigue sonando', ambSonando(s) === 'Lluvia' && (await p.locator('.reproductor-estado').innerText()).startsWith('Sonando'));
  n = await nLog();
  await efecto('Puerta').click();
  await ambiente('Conversaciones').click();
  await esperarAmb('Lluvia,Conversaciones');
  s = await estado();
  log = await logDesde(n);
  comprobar('11b. …y se pueden añadir efectos y ambientes sin tocar el vídeo', s.ef.length >= 1 && s.amb.length === 2 && !log.some((l) => /^yt:(stop|pause|silencio)/.test(l)), log.join(' / '));
  const yt = await p.locator('.marco-youtube').boundingBox();
  const panelYt = await p.locator('#mezclador').boundingBox();
  const tapa = panelYt && yt && !(panelYt.x + panelYt.width <= yt.x || yt.x + yt.width <= panelYt.x || panelYt.y + panelYt.height <= yt.y || yt.y + yt.height <= panelYt.y);
  comprobar('11b. Normas: el vídeo sigue visible, de al menos 200 × 200 y sin nada encima', !!yt && yt.width >= 200 && yt.height >= 200 && !tapa && (await p.locator('.marco-youtube').isVisible()), JSON.stringify(yt));
  comprobar('11b. Normas: un único reproductor de YouTube en la página', (await p.locator('.marco-youtube > *').count()) === 1 && (await p.locator('iframe[src*="youtube"]').count()) === 0);
  await p.reload();
  await p.waitForSelector('.tarjeta');
  await p.locator('.boton-mezcla').click();
  comprobar('11b. El interruptor se recuerda al recargar (y no suena nada solo)', (await p.getByLabel('Permitir ambientes con YouTube').isChecked()) && (await estado()).voces.length === 0);
  await p.getByLabel('Permitir ambientes con YouTube').uncheck();
  await musica('Nomad').click();
  await p.waitForFunction(() => (window.__log || []).some((l) => l.startsWith('yt:play')), null, { timeout: 8000 });
  await p.waitForTimeout(300);
  await ambiente('Lluvia').click();
  await p.waitForTimeout(400);
  comprobar('11b. Desactivado: YouTube vuelve a no mezclarse y el aviso explica el interruptor', (await estado()).amb.length === 0 && (await avisoBarra()).includes('Permitir ambientes con YouTube'));
  await btn('Detener todo').click();
  await p.waitForTimeout(200);
  await btn('Cerrar la mezcla').click();

  // ══ 12. Borrar un sonido que está sonando ══
  await ambiente('Lluvia').click();
  await esperarAmb('Lluvia');
  await btn('Sonidos').click();
  await p.locator('.biblioteca-lista li', { hasText: 'lluvia' }).getByRole('button', { name: 'Borrar' }).click();
  await p.getByRole('button', { name: 'Borrar definitivamente' }).click();
  await p.waitForTimeout(400);
  s = await estado();
  comprobar('12. Borrar el sonido que suena: su canal se detiene y se suelta', s.amb.length === 0 && s.voces.filter((v) => v.capa === 'ambiente').length === 0 && audiblesOcultos(s) === 0);
  await btn('Cerrar').click();

  // ══ 10. Archivo inexistente ══
  // Se borra a mano el archivo de Fuego del almacén del navegador (como si se hubiera perdido).
  await p.evaluate(async () => {
    const b = JSON.parse(localStorage.getItem('banda-sonora:biblioteca'));
    const r = b.recursos.find((x) => x.titulo === 'fuego');
    await new Promise((ok) => {
      const peticion = indexedDB.open('banda-sonora', 1);
      peticion.onsuccess = () => {
        const t = peticion.result.transaction('archivos', 'readwrite');
        t.objectStore('archivos').delete(r.archivo_ruta);
        t.oncomplete = ok;
      };
    });
  });
  await p.reload();
  await p.waitForSelector('.tarjeta');
  await ambiente('Fuego').click();
  await p.waitForFunction(() => window.__mezclaEstado().ambientes.some((c) => c.estado === 'error'), null, { timeout: 5000 });
  s = await estado();
  comprobar('10. Archivo que ya no existe: el canal dice que no se puede y no suena nada', s.amb[0].estado === 'error' && audiblesOcultos(s) === 0);
  await p.locator('.boton-mezcla').click();
  comprobar('10. El panel explica el problema', (await panel().innerText()).includes('No se ha podido abrir el archivo'));
  await btn('Detener Fuego').click();
  comprobar('10. Se puede quitar el canal con error', (await estado()).amb.length === 0);

  // ══ 13. Recargar: preferencias sí, reproducción no ══
  await p.getByLabel('Maestro').fill('40');
  await ambiente('Conversaciones').click();
  await esperarAmb('Conversaciones');
  await p.getByLabel('Volumen de Conversaciones').fill('25');
  await p.getByLabel('Volumen de los efectos').fill('65');
  await p.reload();
  await p.waitForSelector('.tarjeta');
  await p.waitForTimeout(800);
  s = await estado();
  comprobar('13. Al recargar no suena nada solo', s.amb.length === 0 && s.voces.length === 0 && (!s.principal || s.principal.pausado));
  await p.locator('.boton-mezcla').click();
  comprobar('13. Se conservan el maestro y el volumen de efectos', (await p.getByLabel('Maestro').inputValue()) === '40' && (await p.getByLabel('Volumen de los efectos').inputValue()) === '65');
  await ambiente('Conversaciones').click();
  await esperarAmb('Conversaciones');
  s = await estado();
  comprobar('13. Un ambiente nuevo empieza con el último volumen de ambiente usado', (await p.getByLabel('Volumen de Conversaciones').inputValue()) === '25' && cerca(s.amb[0].volumen, 0.25 * 0.4));
  const claves = await p.evaluate(() => ({ vol: JSON.parse(localStorage.getItem('banda-sonora:volumen')), mezcla: JSON.parse(localStorage.getItem('banda-sonora:mezcla')) }));
  comprobar('13. La clave antigua de volumen sigue igual; la mezcla usa una propia', claves.vol && 'local' in claves.vol && claves.mezcla.maestro === 40 && !('ambientes' in claves.mezcla), JSON.stringify(claves));

  // ══ 14. Móvil ══
  await p.setViewportSize({ width: 390, height: 844 });
  await p.waitForTimeout(300);
  await p.screenshot({ path: CAPTURAS + 'mezclador-movil.png' });
  const caja = await panel().boundingBox();
  const medidas = await p.evaluate(() => ({
    ancho: document.documentElement.scrollWidth,
    botones: [...document.querySelectorAll('#mezclador .canal-boton, #mezclador .volumen-silencio, #mezclador .mezclador-cerrar')].map((x) => Math.round(Math.min(x.getBoundingClientRect().width, x.getBoundingClientRect().height))),
    barra: document.querySelector('.reproductor').getBoundingClientRect().top,
  }));
  comprobar('14. Móvil: el panel cabe en la pantalla, sin scroll horizontal', caja.x >= 0 && caja.x + caja.width <= 390 && caja.y >= 0 && medidas.ancho <= 390, JSON.stringify(caja));
  comprobar('14. Móvil: el panel queda encima de la barra (los controles de siempre se ven)', caja.y + caja.height <= medidas.barra + 1 && (await p.locator('.control-principal').isVisible()));
  comprobar('14. Móvil: botones del panel de 44 px o más (para el dedo)', medidas.botones.every((x) => x >= 44), medidas.botones.join(','));
  await btn('Detener todo').click();
  await p.keyboard.press('Escape');
  await p.waitForTimeout(100);
  comprobar('14. Esc cierra el panel', (await panel().count()) === 0 && (await p.locator('.boton-mezcla').getAttribute('aria-expanded')) === 'false');

  comprobar('Sin errores de JavaScript', errores.length === 0, errores.join(' / '));
  const f = fin();
  await b.close();
  process.exit(f ? 1 : 0);
})();
