// Controles de reproducción ■ ▶/❚❚ ⟲ con MP3, YouTube y Spotify integrado (modo local, preview 4173).
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

  await crearElemento(p, { tipo: 'ambiente', nombre: 'Lluvia', sonidos: [{ archivo: { name: 'lluvia.wav', mimeType: 'audio/wav', buffer: wav(10) }, inicio: '0:01' }] });
  await crearElemento(p, { tipo: 'personaje', nombre: 'Nomad', sonidos: [{ enlace: 'https://youtu.be/dQw4w9WgXcQ', inicio: '0:05' }] });
  await crearElemento(p, { tipo: 'lugar', nombre: 'Puerto', sonidos: [{ enlace: 'https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT' }] });

  const principal = () => p.locator('.control-principal');
  const btn = (n) => p.getByRole('button', { name: n, exact: true });
  const audio = () => p.evaluate(() => { const a = window.__audioBandaSonora; return { pausado: a.paused, t: a.currentTime } });
  const estado = () => p.locator('.reproductor-estado').innerText();
  const log = () => p.evaluate(() => window.__log || []);
  const nuevos = async (desde) => (await log()).slice(desde);
  const tarjeta = (n) => p.getByRole('button', { name: `Reproducir ${n}` });

  // ── Sin pista: los controles están, pero desactivados ──
  comprobar('Sin pista: ▶ y ■ visibles y desactivados', (await principal().isVisible()) && (await principal().isDisabled()) && (await btn('Detener').isDisabled()));
  comprobar('Etiquetas y tooltips accesibles', (await principal().getAttribute('aria-label')) === 'Reproducir' && (await btn('Detener').getAttribute('title')) === 'Detener' && (await btn('Repetir').getAttribute('aria-pressed')) !== null);
  await p.screenshot({ path: CAPTURAS + 'transporte-vacio.png', clip: { x: 0, y: 760, width: 1280, height: 100 } });

  // ══ MP3 ══
  await tarjeta('Lluvia').click();
  await p.waitForFunction(() => window.__audioBandaSonora && !window.__audioBandaSonora.paused, null, { timeout: 8000 });
  comprobar('MP3: el botón principal pasa a ❚❚ Pausar', (await principal().getAttribute('aria-label')) === 'Pausar');
  await p.waitForTimeout(700);
  await btn('Pausar').click();
  await p.waitForTimeout(150);
  const t1 = (await audio()).t;
  await p.waitForTimeout(600);
  const pausa = await audio();
  comprobar('MP3: pausar conserva la posición', pausa.pausado && Math.abs(pausa.t - t1) < 0.02 && (await estado()).startsWith('En pausa'), `${t1.toFixed(2)}`);
  comprobar('MP3: en pausa el botón vuelve a ▶ Reproducir', (await principal().getAttribute('aria-label')) === 'Reproducir');
  await btn('Reproducir').click();
  await p.waitForTimeout(200);
  const sigue = await audio();
  comprobar('MP3: reanudar continúa desde la misma posición', !sigue.pausado && sigue.t >= t1 && sigue.t < t1 + 0.5, `${t1.toFixed(2)}→${sigue.t.toFixed(2)}`);
  await p.waitForTimeout(500);
  await btn('Detener').click();
  await p.waitForTimeout(150);
  comprobar('MP3: detener para, dice «Detenido» y desmarca la tarjeta', (await audio()).pausado && (await estado()).startsWith('Detenido') && (await p.locator('.tarjeta[data-actual]').count()) === 0);
  comprobar('MP3: tras detener, ■ desactivado y ▶ disponible con la misma pista', (await btn('Detener').isDisabled()) && !(await principal().isDisabled()) && (await p.locator('.reproductor-titulo').innerText()) === 'Lluvia');
  await btn('Reproducir').click(); // sin volver a buscar la tarjeta
  await p.waitForFunction(() => !window.__audioBandaSonora.paused, null, { timeout: 5000 });
  await p.waitForTimeout(250);
  const otraVez = await audio();
  comprobar('MP3: detener → ▶ vuelve a empezar desde el principio del tramo (0:01)', otraVez.t >= 0.95 && otraVez.t < 1.6 && (await estado()).startsWith('Sonando'), otraVez.t.toFixed(2));

  // Doble clic rápido en el principal: el estado mostrado coincide con el real
  await principal().dblclick();
  await p.waitForTimeout(300);
  const tras = await audio();
  const est = await estado();
  comprobar('Doble clic rápido: sin estados cruzados', (tras.pausado && est.startsWith('En pausa')) || (!tras.pausado && est.startsWith('Sonando')), `${tras.pausado} ${est}`);

  // Cambiar a otra pista desde una tarjeta estando en pausa: los controles se actualizan
  if (!tras.pausado) await btn('Pausar').click();
  await tarjeta('Nomad').click();
  await p.waitForFunction(() => (window.__log || []).some((l) => l.startsWith('yt:play')));
  await p.waitForTimeout(200);
  comprobar('Cambiar de pista desde una tarjeta: los controles muestran la nueva (❚❚)', (await principal().getAttribute('aria-label')) === 'Pausar' && (await p.locator('.reproductor-titulo').innerText()) === 'Nomad' && (await audio()).pausado);

  // ══ YouTube ══
  let n = (await log()).length;
  await btn('Pausar').click();
  await p.waitForTimeout(150);
  comprobar('YouTube: pausar', (await nuevos(n)).includes('yt:pause') && (await estado()).startsWith('En pausa'));
  n = (await log()).length;
  await btn('Reproducir').click();
  await p.waitForTimeout(150);
  comprobar('YouTube: reanudar sin recargar el vídeo (misma posición)', (await nuevos(n)).some((l) => l.startsWith('yt:play')) && !(await nuevos(n)).some((l) => l.startsWith('yt:load')));
  n = (await log()).length;
  await btn('Detener').click();
  await p.waitForTimeout(150);
  comprobar('YouTube: detener', (await nuevos(n)).includes('yt:stop') && (await estado()).startsWith('Detenido'));
  n = (await log()).length;
  await btn('Reproducir').click();
  await p.waitForTimeout(250);
  comprobar('YouTube: detener → ▶ vuelve a cargar desde el principio (0:05)', (await nuevos(n)).some((l) => l === 'yt:load dQw4w9WgXcQ start=5') && (await estado()).startsWith('Sonando'), (await nuevos(n)).join(' / '));

  // ══ Spotify integrado ══
  await tarjeta('Puerto').click();
  await p.waitForFunction(() => (window.__log || []).some((l) => l.startsWith('spotify:play')));
  await p.waitForTimeout(200);
  comprobar('Spotify integrado: suena y YouTube se para', (await estado()).startsWith('Sonando') && (await log()).at(-1) !== 'yt:play');
  n = (await log()).length;
  await btn('Pausar').click();
  await p.waitForTimeout(150);
  comprobar('Spotify integrado: pausar', (await nuevos(n)).includes('spotify:pause') && (await estado()).startsWith('En pausa'));
  n = (await log()).length;
  await btn('Reproducir').click();
  await p.waitForTimeout(150);
  comprobar('Spotify integrado: reanudar (sin recargar)', (await nuevos(n)).some((l) => l.startsWith('spotify:play')) && !(await nuevos(n)).some((l) => l.startsWith('spotify:loadUri')));
  await btn('Detener').click();
  await p.waitForTimeout(150);
  n = (await log()).length;
  await btn('Reproducir').click();
  await p.waitForTimeout(400);
  comprobar('Spotify integrado: detener → ▶ la vuelve a cargar desde el principio', (await nuevos(n)).some((l) => l.startsWith('spotify:loadUri')) && (await estado()).startsWith('Sonando'), (await nuevos(n)).join(' / '));

  // ══ Repetir ══
  const repetir = btn('Repetir');
  const antes = await repetir.getAttribute('aria-pressed');
  await repetir.click();
  comprobar('Repetir: alterna y muestra su estado (aria-pressed)', (await repetir.getAttribute('aria-pressed')) !== antes);
  await repetir.click();

  // ══ Diseño ══
  await p.screenshot({ path: CAPTURAS + 'transporte-escritorio.png', clip: { x: 0, y: 640, width: 1280, height: 220 } });
  const tam = await p.evaluate(() => [...document.querySelectorAll('.control')].map((c) => Math.round(c.getBoundingClientRect().width)));
  comprobar('Escritorio: botones grandes (▶ ≥ 52 px, resto ≥ 44 px)', tam[1] >= 52 && tam[0] >= 44 && tam[2] >= 44, tam.join(','));
  await p.setViewportSize({ width: 390, height: 844 });
  await p.waitForTimeout(200);
  await p.screenshot({ path: CAPTURAS + 'transporte-movil.png' });
  const tamM = await p.evaluate(() => [...document.querySelectorAll('.control')].map((c) => Math.round(c.getBoundingClientRect().width)));
  comprobar('Móvil: botones grandes y sin desbordar', tamM[1] >= 52 && tamM[0] >= 44 && (await p.evaluate(() => document.documentElement.scrollWidth)) <= 390, tamM.join(','));

  comprobar('Sin errores de JavaScript', errores.length === 0, errores.join(' / '));
  const f = fin();
  await b.close();
  process.exit(f ? 1 : 0);
})();
