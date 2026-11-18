// Reproductor (modo local, preview 4173): volumen, tarjetas de una pista, pulsaciones rápidas y misma pista.
const { chromium } = require('playwright');
const { SPOTIFY, YOUTUBE } = require('./falsos.cjs');
const { wav, crearElemento, comprobador, CAPTURAS } = require('./ayuda.cjs');
const URL = 'http://localhost:4173/';
const { comprobar, fin } = comprobador();

(async () => {
  const b = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const ctx = await b.newContext({ viewport: { width: 1280, height: 860 } });
  await ctx.route('https://open.spotify.com/embed/iframe-api/v1', (r) => r.fulfill({ contentType: 'text/javascript', body: SPOTIFY }));
  await ctx.route('https://www.youtube.com/iframe_api', (r) => r.fulfill({ contentType: 'text/javascript', body: YOUTUBE }));
  await ctx.route(/oembed/, (r) => r.fulfill({ json: {} }));
  const p = await ctx.newPage();
  const errores = [];
  p.on('pageerror', (e) => errores.push(String(e)));
  await p.goto(URL);
  await p.evaluate(() => { localStorage.clear(); indexedDB.deleteDatabase('banda-sonora'); });
  await p.reload();
  const audio = () => p.evaluate(() => { const a = window.__audioBandaSonora; return { t: a.currentTime, pausado: a.paused, vol: a.volume, mudo: a.muted, src: a.src } });
  const estado = () => p.locator('.reproductor-estado').innerText();
  const titulo = () => p.locator('.reproductor-titulo').innerText();
  const log = () => p.evaluate(() => window.__log || []);
  const sonando = () => p.waitForFunction(() => window.__audioBandaSonora && !window.__audioBandaSonora.paused, null, { timeout: 8000 });

  // Canal principal: en carpetas normales (desde la fase 2, Ambientes y Efectos con archivo van a la mezcla).
  await crearElemento(p, { tipo: 'lugar', nombre: 'Lluvia', sonidos: [{ archivo: { name: 'lluvia.wav', mimeType: 'audio/wav', buffer: wav(6) } }] });
  await crearElemento(p, { tipo: 'lugar', nombre: 'Taberna', sonidos: [{ archivo: { name: 'taberna.wav', mimeType: 'audio/wav', buffer: wav(5) } }] });
  await crearElemento(p, { tipo: 'momento', nombre: 'Puerta', sonidos: [{ archivo: { name: 'puerta.wav', mimeType: 'audio/wav', buffer: wav(3) } }] });
  await crearElemento(p, { tipo: 'personaje', nombre: 'Nomad', sonidos: [{ enlace: 'https://youtu.be/dQw4w9WgXcQ', etiqueta: 'Tema principal' }] });

  // ── Control de volumen siempre visible ──
  comprobar('Volumen visible sin abrir menús, con porcentaje', (await p.locator('#volumen').isVisible()) && (await p.locator('.volumen-valor').innerText()) === '70 %');

  // ── Tarjeta de una sola pista: toda la tarjeta suena; sin botón «Tema principal» ──
  const nomad = p.locator('.tarjeta', { hasText: 'Nomad' });
  comprobar('Una sola pista: no muestra el botón «Tema principal»', (await nomad.locator('.pista-chip').count()) === 0);
  await nomad.locator('.tarjeta-nota, .tarjeta-nombre').first().click(); // cualquier punto de la superficie
  await p.waitForFunction(() => (window.__log || []).some((l) => l.startsWith('yt:play')));
  comprobar('Pulsar la tarjeta (cualquier punto) reproduce su única pista', (await titulo()) === 'Nomad');
  comprobar('YouTube recibe el volumen de DFY al estar listo (70)', (await log()).includes('yt:volumen 70'));
  await nomad.getByRole('button', { name: 'Editar Nomad' }).click();
  comprobar('«Editar» funciona por separado y no cambia lo que suena', (await p.getByRole('heading', { name: 'Editar Nomad' }).isVisible()) && (await titulo()) === 'Nomad');
  await p.getByRole('button', { name: 'Cancelar' }).click();
  await p.getByRole('button', { name: 'Detener' }).click();
  comprobar('Sin botones anidados en las tarjetas', (await p.locator('.tarjeta button button').count()) === 0);

  // Teclado: Tab hasta la tarjeta y Enter
  await p.getByRole('button', { name: 'Reproducir Puerta' }).focus();
  await p.keyboard.press('Enter');
  await sonando();
  comprobar('Teclado: Enter sobre la tarjeta la reproduce', (await titulo()) === 'Puerta');
  await p.getByRole('button', { name: 'Detener' }).click();

  // ── Volumen de un MP3 durante la reproducción ──
  await p.getByRole('button', { name: 'Reproducir Lluvia' }).click();
  await sonando();
  const antes = await audio();
  comprobar('Empieza con el volumen guardado (70 %)', Math.abs(antes.vol - 0.7) < 0.01);
  await p.locator('#volumen').fill('30');
  await p.waitForTimeout(150);
  const durante = await audio();
  comprobar('Cambiar el volumen mientras suena no lo interrumpe', !durante.pausado && Math.abs(durante.vol - 0.3) < 0.01 && durante.t >= antes.t, `${durante.vol}`);
  comprobar('Porcentaje visible actualizado', (await p.locator('.volumen-valor').innerText()) === '30 %');

  // ── Se mantiene al cambiar de archivo y no vuelve a 100 % ──
  await p.getByRole('button', { name: 'Reproducir Taberna' }).click();
  await sonando();
  const otro = await audio();
  comprobar('Al cambiar de archivo mantiene el volumen (30 %)', otro.src.includes('blob:') && Math.abs(otro.vol - 0.3) < 0.01);

  // ── Silenciar y recuperar ──
  await p.getByRole('button', { name: 'Silenciar' }).click();
  const mudo = await audio();
  comprobar('Silenciar: el audio queda mudo y sigue sonando', mudo.mudo && !mudo.pausado && (await p.locator('.volumen-valor').innerText()) === 'Silencio');
  await p.getByRole('button', { name: 'Activar sonido' }).click();
  const recup = await audio();
  comprobar('Activar sonido: recupera el volumen anterior (30 %)', !recup.mudo && Math.abs(recup.vol - 0.3) < 0.01);

  // ── YouTube usa el mismo volumen de DFY al cambiar de fuente ──
  await p.getByRole('button', { name: 'Reproducir Nomad' }).click();
  await p.waitForTimeout(300);
  comprobar('Al pasar a YouTube aplica el volumen de DFY (30), sin subirlo', (await log()).includes('yt:volumen 30') && (await audio()).pausado);

  // ── Preferencia guardada en el navegador ──
  await p.getByRole('button', { name: 'Detener' }).click();
  await p.reload();
  comprobar('El volumen se recuerda al recargar', (await p.locator('.volumen-valor').innerText()) === '30 %');

  // ── Pulsar dos o tres tarjetas muy rápido: suena la última ──
  await p.getByRole('button', { name: 'Reproducir Lluvia' }).click();
  await p.getByRole('button', { name: 'Reproducir Taberna' }).click();
  await p.getByRole('button', { name: 'Reproducir Puerta' }).click();
  await sonando();
  await p.waitForTimeout(600);
  const ultimo = await p.evaluate(() => window.__audioBandaSonora.src);
  const rutas = await p.evaluate(() => JSON.parse(localStorage.getItem('banda-sonora:biblioteca')).recursos.map((r) => [r.archivo_nombre, r.archivo_ruta]));
  comprobar('Pulsaciones rápidas: suena la última tarjeta y la barra lo dice', (await titulo()) === 'Puerta' && !!ultimo);
  comprobar('…y no queda ninguna de las anteriores sonando', (await p.evaluate(() => document.querySelectorAll('audio').length)) === 0 && !(await audio()).pausado, JSON.stringify(rutas.length));

  // ── Pausar, reanudar y detener (desde la barra) y volver a pulsar la misma tarjeta ──
  await p.getByRole('button', { name: 'Pausar', exact: true }).click();
  await p.waitForTimeout(150);
  const pausa = await audio();
  comprobar('Pausar', pausa.pausado && (await estado()).startsWith('En pausa'));
  await p.getByRole('button', { name: 'Reproducir Puerta' }).click();
  await p.waitForTimeout(200);
  const reanudado = await audio();
  comprobar('Pulsar la tarjeta en pausa la recupera donde estaba (no la reinicia)', !reanudado.pausado && reanudado.t >= pausa.t - 0.05 && reanudado.t > 0.2, `${pausa.t.toFixed(2)}→${reanudado.t.toFixed(2)}`);
  await p.getByRole('button', { name: 'Pausar', exact: true }).click();
  await p.getByRole('button', { name: 'Reproducir', exact: true }).click();
  await p.waitForTimeout(150);
  comprobar('Reanudar', !(await audio()).pausado && (await estado()).startsWith('Sonando'));
  await p.getByRole('button', { name: 'Detener' }).click();
  await p.waitForTimeout(150);
  comprobar('Detener', (await audio()).pausado && (await p.locator('.tarjeta[data-actual]').count()) === 0);

  // ── Móvil: el volumen cabe y se puede usar ──
  await p.setViewportSize({ width: 390, height: 844 });
  await p.getByRole('button', { name: 'Reproducir Lluvia' }).click();
  await sonando();
  await p.screenshot({ path: CAPTURAS + 'reproductor-movil.png' });
  const caja = await p.locator('#volumen').boundingBox();
  comprobar('Móvil: deslizador ancho y sin desbordar', caja.width > 200 && (await p.evaluate(() => document.documentElement.scrollWidth)) <= 390);
  await p.setViewportSize({ width: 1280, height: 860 });
  await p.screenshot({ path: CAPTURAS + 'reproductor-escritorio.png' });

  comprobar('Sin errores de JavaScript', errores.length === 0, errores.join(' / '));
  const f = fin();
  await b.close();
  process.exit(f ? 1 : 0);
})();
