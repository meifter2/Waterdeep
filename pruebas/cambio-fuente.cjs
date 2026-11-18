// Cambiar de fuente con UN solo clic (YouTube ⇄ MP3, Spotify integrado ⇄ MP3), con reproductores que,
// como los reales, envían sus eventos de pausa/parada un instante después de pararlos.
const { chromium } = require('playwright');
const { SPOTIFY, YOUTUBE } = require('./falsos.cjs');
const { wav, crearElemento, comprobador } = require('./ayuda.cjs');
const URL = process.env.URL_PRUEBA || 'http://localhost:4173/';
const { comprobar, fin } = comprobador();

(async () => {
  const b = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const ctx = await b.newContext({ viewport: { width: 1280, height: 860 } });
  await ctx.addInitScript(() => { window.__eventosTardios = true });
  await ctx.route('https://open.spotify.com/embed/iframe-api/v1', (r) => r.fulfill({ contentType: 'text/javascript', body: SPOTIFY }));
  await ctx.route('https://www.youtube.com/iframe_api', (r) => r.fulfill({ contentType: 'text/javascript', body: YOUTUBE }));
  await ctx.route(/oembed/, (r) => r.fulfill({ json: {} }));
  const p = await ctx.newPage();
  const errores = [];
  p.on('pageerror', (e) => errores.push(String(e)));
  await p.goto(URL);
  await p.evaluate(() => { localStorage.clear(); indexedDB.deleteDatabase('banda-sonora'); });
  await p.reload();

  await crearElemento(p, { tipo: 'personaje', nombre: 'Nomad', sonidos: [{ enlace: 'https://youtu.be/dQw4w9WgXcQ' }] });
  // Canal principal: en carpetas normales (desde la fase 2, Ambientes y Efectos con archivo van a la mezcla).
  await crearElemento(p, { tipo: 'lugar', nombre: 'Lluvia', sonidos: [{ archivo: { name: 'lluvia.wav', mimeType: 'audio/wav', buffer: wav(8) } }] });
  await crearElemento(p, { tipo: 'lugar', nombre: 'Puerto', sonidos: [{ enlace: 'https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT' }] });

  const log = () => p.evaluate(() => window.__log || []);
  const audio = () => p.evaluate(() => { const a = window.__audioBandaSonora; return { pausado: a.paused, t: a.currentTime } });
  const vista = async () => ({
    estado: await p.locator('.reproductor-estado').innerText(),
    titulo: await p.locator('.reproductor-titulo').innerText(),
    marcada: await p.locator('.tarjeta[data-sonando] .tarjeta-nombre').allInnerTexts(),
  });
  const unClic = async (nombre) => {
    await p.getByRole('button', { name: `Reproducir ${nombre}` }).click();
    await p.waitForTimeout(1200); // tiempo de sobra para que lleguen los eventos tardíos
  };

  // YouTube → MP3 (el caso del usuario)
  await unClic('Nomad');
  comprobar('YouTube suena', (await log()).some((l) => l.startsWith('yt:play')));
  await unClic('Lluvia');
  let a = await audio(), v = await vista();
  comprobar('YouTube → MP3 con un clic: el MP3 suena', !a.pausado && a.t > 0.3, JSON.stringify(a));
  comprobar('…y la barra y la tarjeta dicen que suena el MP3', v.titulo === 'Lluvia' && v.estado.startsWith('Sonando') && v.marcada.join() === 'Lluvia', JSON.stringify(v));
  comprobar('…y YouTube no vuelve a arrancar por su evento tardío', !(await log()).slice((await log()).lastIndexOf('yt:stop')).some((l) => l.startsWith('yt:play') || l.startsWith('yt:load')));

  // MP3 → YouTube
  await unClic('Nomad');
  a = await audio(); v = await vista();
  comprobar('MP3 → YouTube con un clic', a.pausado && v.titulo === 'Nomad' && v.estado.startsWith('Sonando'), JSON.stringify(v));

  // YouTube → MP3 otra vez (segunda vez, con el reproductor de YouTube ya creado)
  await unClic('Lluvia');
  a = await audio(); v = await vista();
  comprobar('YouTube → MP3 (segunda vez) con un clic', !a.pausado && v.estado.startsWith('Sonando'), JSON.stringify(v));

  // MP3 → Spotify integrado → MP3
  await unClic('Puerto');
  v = await vista();
  comprobar('MP3 → Spotify integrado con un clic', (await audio()).pausado && v.titulo === 'Puerto' && v.estado.startsWith('Sonando'), JSON.stringify(v));
  await unClic('Lluvia');
  a = await audio(); v = await vista();
  comprobar('Spotify integrado → MP3 con un clic', !a.pausado && v.titulo === 'Lluvia' && v.estado.startsWith('Sonando'), JSON.stringify(v));

  comprobar('Sin errores de JavaScript', errores.length === 0, errores.join(' / '));
  const f = fin();
  await b.close();
  process.exit(f ? 1 : 0);
})();
