// Inicio y tramo de canciones de Spotify en sus tres modalidades: Spotify Connect, reproductor integrado y apertura externa.
// Spotify simulado (puede IGNORAR position_ms, como hacen algunos dispositivos reales). Puerto 4175 (build:spotify).
const { chromium } = require('playwright');
const { SPOTIFY } = require('./falsos.cjs');
const { crearElemento, wav, comprobador } = require('./ayuda.cjs');
const URL = 'http://localhost:4175/';
const { comprobar, fin } = comprobador();
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

const A = '1111111111111111111111', B = '2222222222222222222222', C = '3333333333333333333333', D = '4444444444444444444444', M = 'previewPreview00000001';
const web = (id) => `https://open.spotify.com/track/${id}`;
const uri = (id) => `spotify:track:${id}`;

(async () => {
  const b = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });

  // ── Spotify Web API simulada ──
  const api = [];
  const sp = { uri: null, sonando: false, progreso: 0 };
  let ignorarPosicion = false; // el dispositivo empieza en 0:00 aunque se pida otra posición
  let retrasoPlay = 0;
  const cors = { 'access-control-allow-origin': '*' };
  const dispositivo = { id: 'pc1', name: 'Mi PC', type: 'Computer', is_active: true, is_restricted: false, volume_percent: 60, supports_volume: true };
  const montar = async (ctx) => {
    await ctx.route(/accounts\.spotify\.com\/authorize/, (r) => {
      const u = new globalThis.URL(r.request().url());
      return r.fulfill({ status: 302, headers: { location: `${URL}spotify?code=c&state=${u.searchParams.get('state')}` } });
    });
    await ctx.route(/accounts\.spotify\.com\/api\/token/, (r) => r.fulfill({ json: { access_token: 'a', refresh_token: 'r', expires_in: 3600 }, headers: cors }));
    await ctx.route(/api\.spotify\.com\/v1/, async (r) => {
      const req = r.request();
      const u = new globalThis.URL(req.url());
      const m = req.method();
      api.push({ m, ruta: u.pathname.replace('/v1', '') + u.search, cuerpo: req.postData() ? JSON.parse(req.postData()) : null });
      if (u.pathname.endsWith('/me/player/devices')) return r.fulfill({ json: { devices: [dispositivo] }, headers: cors });
      if (u.pathname.endsWith('/me/player/play') && m === 'PUT') {
        if (retrasoPlay) await esperar(retrasoPlay);
        const c = req.postData() ? JSON.parse(req.postData()) : null;
        if (c?.uris) Object.assign(sp, { uri: c.uris[0], progreso: ignorarPosicion ? 0 : c.position_ms || 0 });
        sp.sonando = true;
        return r.fulfill({ status: 204, body: '', headers: cors });
      }
      if (u.pathname.endsWith('/me/player/seek')) { sp.progreso = Number(u.searchParams.get('position_ms')); return r.fulfill({ status: 204, body: '', headers: cors }); }
      if (u.pathname.endsWith('/me/player/pause')) { sp.sonando = false; return r.fulfill({ status: 204, body: '', headers: cors }); }
      if (u.pathname.endsWith('/me/player') && m === 'GET') {
        if (!sp.uri) return r.fulfill({ status: 204, body: '', headers: cors });
        return r.fulfill({ json: { is_playing: sp.sonando, progress_ms: sp.progreso, item: { uri: sp.uri }, context: null, device: dispositivo }, headers: cors });
      }
      return r.fulfill({ status: 204, body: '', headers: cors });
    });
    await ctx.route('https://open.spotify.com/embed/iframe-api/v1', (r) => r.fulfill({ contentType: 'text/javascript', body: SPOTIFY }));
    await ctx.route(/youtube\.com|open\.spotify\.com\/oembed/, (r) => r.fulfill({ body: '' }));
  };
  const plays = () => api.filter((x) => x.m === 'PUT' && x.ruta.startsWith('/me/player/play'));
  const seeks = () => api.filter((x) => x.ruta.startsWith('/me/player/seek')).map((x) => Number(new globalThis.URL('https://x' + x.ruta).searchParams.get('position_ms')));

  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
  await montar(ctx);
  await ctx.addInitScript(() => { window.__abiertos = []; window.open = (u) => { window.__abiertos.push(String(u)); return null; }; });
  const p = await ctx.newPage();
  const errores = [];
  p.on('pageerror', (e) => errores.push(String(e)));
  await p.goto(URL);
  await p.evaluate(() => { localStorage.clear(); localStorage.setItem('banda-sonora:mezcla', JSON.stringify({ transicion: 'instantaneo', entrada: 0, salida: 0 })); });
  await p.reload();

  await crearElemento(p, { tipo: 'personaje', nombre: 'Uno', sonidos: [{ enlace: web(A), inicio: '1:00' }] });
  await crearElemento(p, { tipo: 'personaje', nombre: 'Dos', sonidos: [{ enlace: web(B), inicio: '1:30' }] });
  await crearElemento(p, { tipo: 'momento', nombre: 'Tramo', sonidos: [{ enlace: web(C), inicio: '1:00', fin: '2:00' }] });
  await crearElemento(p, { tipo: 'lugar', nombre: 'Normal', sonidos: [{ enlace: web(D) }] });
  await crearElemento(p, { tipo: 'lugar', nombre: 'Muestra', sonidos: [{ enlace: web(M), inicio: '1:00' }] });
  await crearElemento(p, { tipo: 'ambiente', nombre: 'Lluvia', sonidos: [{ archivo: { name: 'lluvia.wav', mimeType: 'audio/wav', buffer: wav(8) } }] });
  const tarjeta = (n) => p.getByRole('button', { name: `Reproducir ${n}`, exact: true });
  const estado = () => p.locator('.reproductor-estado').innerText();
  const sonando = () => p.waitForFunction(() => document.querySelector('.reproductor-estado')?.textContent.startsWith('Sonando'), null, { timeout: 8000 });

  // ════ 2) Reproductor integrado (sin conectar Spotify) ════
  await p.evaluate(() => { window.__spotifyTictac = true; });
  const log = () => p.evaluate(() => window.__log || []);
  await tarjeta('Uno').click();
  await sonando();
  await esperar(900);
  let l = await log();
  comprobar('Integrado: se crea con el inicio oficial (startAt = 60 s)', l.some((x) => x === `spotify:create ${uri(A)} startAt=60`), l.join(' | '));
  comprobar('Integrado: si el reproductor empieza en 0:00, salta a 1:00', l.includes('spotify:seek 60'));
  let n = l.length;
  await p.evaluate(() => { window.__spotifyIgnoraSeek = 1; });
  await tarjeta('Dos').click();
  await esperar(2500);
  l = (await log()).slice(n);
  comprobar('Integrado: si el primer salto se pierde al arrancar, se reintenta (1:30)', l.filter((x) => x === 'spotify:seek 90').length >= 2, l.join(' | '));
  n = (await log()).length;
  await p.getByRole('button', { name: 'Pausar', exact: true }).click();
  await esperar(300);
  await p.getByRole('button', { name: 'Reproducir', exact: true }).click();
  await esperar(1500);
  comprobar('Integrado: pausar y reanudar no vuelve a saltar al inicio', !(await log()).slice(n).some((x) => x.startsWith('spotify:seek')));
  // Cambiar el inicio de la MISMA tarjeta y volver a pulsarla: se aplica el inicio nuevo.
  await p.getByRole('button', { name: 'Editar Dos' }).click();
  await p.locator('dialog[open] [id$="-inicio"]').fill('1:00');
  await p.getByRole('button', { name: 'Guardar', exact: true }).click();
  await p.waitForSelector('dialog[open]', { state: 'detached' });
  n = (await log()).length;
  await tarjeta('Dos').click();
  await esperar(2000);
  l = (await log()).slice(n);
  comprobar('Integrado: misma tarjeta con inicio nuevo (1:30 → 1:00): no se ignora', l.some((x) => x.startsWith(`spotify:loadUri ${uri(B)}`)) && l.includes('spotify:seek 60'), l.join(' | '));
  // Muestra de 30 s: no llega a 1:00 → aviso, sin saltos inútiles.
  n = (await log()).length;
  await tarjeta('Muestra').click();
  await esperar(1500);
  l = (await log()).slice(n);
  comprobar('Integrado: muestra de 30 s con inicio en 1:00 → aviso claro y sin saltos imposibles', !l.some((x) => x.startsWith('spotify:seek')) && (await p.locator('.reproductor-aviso').first().innerText()).includes('no llega a 1:00'), l.join(' | '));
  await p.getByRole('button', { name: 'Detener', exact: true }).click();
  await p.evaluate(() => { window.__spotifyTictac = false; });

  // ════ 1) Spotify Connect ════
  await p.getByRole('button', { name: 'Conectar Spotify' }).click();
  await p.waitForSelector('text=Spotify conectado', { timeout: 10000 });
  const cuerpo = () => plays().at(-1)?.cuerpo;

  await tarjeta('Uno').click();
  await sonando();
  await esperar(1900);
  comprobar('Connect: inicio en 1:00 → se pide con position_ms = 60000', cuerpo()?.uris?.[0] === uri(A) && cuerpo().position_ms === 60000 && sp.progreso === 60000, JSON.stringify(cuerpo()));
  comprobar('Connect: si Spotify respeta el inicio, no hace falta saltar', seeks().length === 0);

  ignorarPosicion = true; // a partir de aquí, el dispositivo empieza en 0:00
  await tarjeta('Dos').click();
  await sonando();
  await esperar(2200);
  comprobar('Connect: el dispositivo ignora position_ms y empieza en 0:00 → DFY lo comprueba y salta a 1:00 (seek oficial)', cuerpo()?.position_ms === 60000 && seeks().at(-1) === 60000 && sp.progreso === 60000, `${JSON.stringify(cuerpo())} seeks=${seeks()}`);

  let np = plays().length;
  let ns = seeks().length;
  await tarjeta('Dos').click(); // la misma, sonando de verdad y en su sitio
  await esperar(1500);
  comprobar('Connect: volver a pulsar la misma tarjeta no la reinicia ni salta', plays().length === np && seeks().length === ns);

  await p.getByRole('button', { name: 'Pausar', exact: true }).click();
  await esperar(400);
  await p.getByRole('button', { name: 'Reproducir', exact: true }).click();
  await esperar(1800);
  comprobar('Connect: pausar y reanudar sigue donde estaba (sin saltos al inicio)', seeks().length === ns && !plays().at(-1).cuerpo?.uris);

  // Cambiar el inicio de la MISMA tarjeta (1:00 → 1:30) y pulsarla: Spotify ya tiene esa canción, pero el inicio nuevo cuenta.
  ignorarPosicion = false;
  await tarjeta('Uno').click();
  await sonando();
  await esperar(1700);
  await p.getByRole('button', { name: 'Editar Uno' }).click();
  await p.locator('dialog[open] [id$="-inicio"]').fill('1:30');
  await p.getByRole('button', { name: 'Guardar', exact: true }).click();
  await p.waitForSelector('dialog[open]', { state: 'detached' });
  np = plays().length;
  await tarjeta('Uno').click();
  await esperar(1500);
  comprobar('Connect: misma tarjeta con inicio nuevo → se vuelve a pedir desde 1:30 (antes se ignoraba)', plays().length === np + 1 && cuerpo()?.position_ms === 90000 && sp.progreso === 90000, JSON.stringify(cuerpo()));

  await tarjeta('Tramo').click();
  await sonando();
  await esperar(1800);
  comprobar('Connect: tramo de 1:00 a 2:00 → empieza en 1:00', cuerpo()?.uris?.[0] === uri(C) && cuerpo().position_ms === 60000 && sp.progreso === 60000);

  // Varias tarjetas muy rápido (respuestas lentas y dispositivo que ignora la posición): solo cuenta la última.
  ignorarPosicion = true;
  retrasoPlay = 300;
  ns = seeks().length;
  await tarjeta('Uno').click();
  await tarjeta('Dos').click();
  await tarjeta('Tramo').click();
  await esperar(3500);
  retrasoPlay = 0;
  const nuevos = seeks().slice(ns);
  comprobar('Connect: pulsaciones rápidas → suena la última desde su inicio, sin saltos de las anteriores', sp.uri === uri(C) && sp.progreso === 60000 && nuevos.every((x) => x === 60000), `${sp.uri} ${sp.progreso} seeks=${nuevos}`);

  // El usuario cambia de canción en la app de Spotify justo después: DFY no le envía ningún salto.
  ns = seeks().length;
  await tarjeta('Dos').click();
  await esperar(200);
  Object.assign(sp, { uri: uri('otraCancionDeFuera00001'), progreso: 5000 });
  await esperar(2200);
  comprobar('Connect: si en Spotify ya suena otra canción, DFY no le hace seek', seeks().length === ns && sp.uri.includes('otraCancionDeFuera') && sp.progreso === 5000);

  // ■ y ▶: vuelve a empezar desde el inicio.
  ignorarPosicion = false;
  await tarjeta('Uno').click();
  await sonando();
  await p.getByRole('button', { name: 'Detener', exact: true }).click();
  await esperar(300);
  np = plays().length;
  await p.getByRole('button', { name: 'Reproducir', exact: true }).click();
  await esperar(1500);
  comprobar('Connect: ■ y ▶ vuelve a empezar desde el inicio (1:30)', plays().length === np + 1 && cuerpo()?.position_ms === 90000);

  await tarjeta('Normal').click();
  await sonando();
  await esperar(1800);
  comprobar('Connect: sin inicio configurado, ni position_ms ni saltos', cuerpo()?.uris?.[0] === uri(D) && cuerpo().position_ms === undefined && seeks().every((x) => x !== 0));

  // ════ 3) Spotify abierto fuera de DFY (con ambientes sonando) ════
  await p.getByRole('button', { name: 'Detener', exact: true }).click();
  await p.getByRole('button', { name: 'Activar ambiente Lluvia' }).click();
  await p.waitForFunction(() => window.__mezclaEstado().ambientes.some((c) => c.estado === 'sonando'), null, { timeout: 8000 });
  comprobar('Externo: la tarjeta avisa antes de pulsarla de que el inicio no se aplicará', (await tarjeta('Uno').getAttribute('title')).includes('inicio en 1:30') && (await tarjeta('Uno').getAttribute('title')).includes('desde el principio'));
  await tarjeta('Uno').click();
  await esperar(300);
  const aviso = await p.locator('.reproductor-aviso[data-mezcla]').innerText();
  comprobar('Externo: se abre la canción en Spotify SIN prometer el inicio, y se avisa claramente', (await p.evaluate(() => window.__abiertos.at(-1))) === web(A) && aviso.includes('empieza desde el principio') && aviso.includes('inicio en 1:30'), aviso);
  await tarjeta('Normal').click();
  await esperar(300);
  comprobar('Externo: sin inicio configurado, no hay aviso de inicio', !(await p.locator('.reproductor-aviso[data-mezcla]').innerText()).includes('desde el principio'));

  comprobar('Sin errores de JavaScript', errores.length === 0, errores.join(' / '));
  const f = fin();
  await b.close();
  process.exit(f ? 1 : 0);
})();
