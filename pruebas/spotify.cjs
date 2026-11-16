// Prueba de «Conectar Spotify» (Spotify Connect) con Spotify simulado.
// Requiere: npm run build:spotify && npm run preview:spotify (puerto 4175).
const { chromium } = require('playwright');
const crypto = require('crypto');
const { SPOTIFY } = require('./falsos.cjs');
const URL = 'http://localhost:4175/';
const PISTA = 'https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT';
let fallos = 0;
const comprobar = (n, ok, extra = '') => { if (!ok) fallos++; console.log(ok ? 'OK ' : 'MAL', n, extra) };

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1280, height: 820 } });
  const api = [];
  let reto = '', tokenBody = '';
  let dispositivos = [{ id: 'pc1', name: 'Mi PC', type: 'Computer', is_active: false, is_restricted: false }];
  let respuestaPlay = 204;

  await ctx.route(/accounts\.spotify\.com\/authorize/, (r) => {
    const u = new globalThis.URL(r.request().url());
    reto = u.searchParams.get('code_challenge');
    api.push('AUTH ' + u.searchParams.get('redirect_uri') + ' ' + u.searchParams.get('scope'));
    return r.fulfill({ status: 302, headers: { location: `${URL}spotify?code=codigo123&state=${u.searchParams.get('state')}` } });
  });
  await ctx.route(/accounts\.spotify\.com\/api\/token/, (r) => {
    tokenBody = r.request().postData();
    return r.fulfill({ json: { access_token: 'acceso', refresh_token: 'refresco', expires_in: 3600 }, headers: { 'access-control-allow-origin': '*' } });
  });
  await ctx.route(/api\.spotify\.com\/v1/, (r) => {
    const req = r.request();
    const ruta = req.url().replace('https://api.spotify.com/v1', '');
    api.push(`${req.method()} ${ruta}${req.postData() ? ' ' + req.postData() : ''}`);
    const cors = { 'access-control-allow-origin': '*' };
    if (ruta.startsWith('/me/player/devices')) return r.fulfill({ json: { devices: dispositivos }, headers: cors });
    if (ruta.startsWith('/me/player/play') && req.method() === 'PUT') return r.fulfill({ status: respuestaPlay, body: respuestaPlay === 401 ? '{}' : '', headers: cors });
    if (ruta === '/me/player') return r.fulfill({ json: { is_playing: true }, headers: cors });
    return r.fulfill({ status: 204, body: '', headers: cors });
  });
  await ctx.route('https://open.spotify.com/embed/iframe-api/v1', (r) => r.fulfill({ contentType: 'text/javascript', body: SPOTIFY }));
  await ctx.route(/youtube\.com|open\.spotify\.com\/oembed/, (r) => r.fulfill({ body: '' }));

  const p = await ctx.newPage();
  const errores = [];
  p.on('pageerror', (e) => errores.push(String(e)));
  await p.goto(URL);
  await p.evaluate(() => localStorage.clear());
  await p.reload();

  // Una canción de Spotify (modo local)
  await p.getByRole('button', { name: /^Añadir lugar/ }).click();
  await p.getByLabel(/^Nombre/).fill('Ciudad nevada');
  await p.getByLabel('Enlace de la canción').fill(PISTA);
  await p.getByRole('button', { name: 'Guardar', exact: true }).click();

  // 1) Conectar
  await p.getByRole('button', { name: 'Conectar Spotify' }).click();
  await p.waitForSelector('text=Spotify conectado', { timeout: 10000 });
  const auth = api.find((x) => x.startsWith('AUTH ')) || '';
  comprobar('Pide permiso con la vuelta /spotify y solo permisos de reproducción', auth.includes(`${URL}spotify`) && auth.includes('user-modify-playback-state') && !auth.includes('playlist'));
  const verificador = new URLSearchParams(tokenBody).get('code_verifier');
  const esperado = crypto.createHash('sha256').update(verificador).digest('base64url');
  comprobar('PKCE correcto (verificador ↔ reto)', esperado === reto);
  comprobar('Canjea el código sin secreto', tokenBody.includes('grant_type=authorization_code') && !tokenBody.includes('client_secret'));
  comprobar('Vuelve a la app y limpia la dirección', p.url() === URL);

  // 2) Pulsar la tarjeta → suena en el dispositivo
  await p.getByRole('button', { name: 'Reproducir la canción de Ciudad nevada' }).click();
  await p.waitForTimeout(500);
  const play = api.find((x) => x.startsWith('PUT /me/player/play?device_id=pc1')) || '';
  comprobar('Manda reproducir la canción completa en «Mi PC»', play.includes('"uris":["spotify:track:4cOdK2wGLETKBW3PvgPWqT"]'));
  comprobar('Activa repetir canción', api.some((x) => x.startsWith('PUT /me/player/repeat?state=track&device_id=pc1')));
  comprobar('La barra dice dónde suena', (await p.locator('.reproductor-estado').innerText()).includes('en Mi PC'));
  comprobar('No carga el reproductor integrado', !(await p.locator('.falso-spotify').count()));

  // 3) Pausar y reanudar desde la barra
  await p.getByRole('button', { name: 'Pausar', exact: true }).click();
  await p.waitForTimeout(300);
  comprobar('Pausar', api.some((x) => x.startsWith('PUT /me/player/pause?device_id=pc1')) && (await p.locator('.reproductor-estado').innerText()).startsWith('En pausa'));
  await p.getByRole('button', { name: 'Reanudar', exact: true }).click();
  await p.waitForTimeout(300);
  comprobar('Reanudar', (await p.locator('.reproductor-estado').innerText()).startsWith('Sonando'));
  await p.getByRole('button', { name: 'Repetir: sí' }).click();
  await p.waitForTimeout(300);
  comprobar('Quitar repetir', api.some((x) => x.startsWith('PUT /me/player/repeat?state=off')));
  await p.getByRole('button', { name: 'Detener' }).click();
  await p.waitForTimeout(300);
  comprobar('Detener pausa Spotify', api.filter((x) => x.startsWith('PUT /me/player/pause')).length >= 2);

  // 4) Spotify cerrado: sin dispositivos
  dispositivos = [];
  await p.getByRole('button', { name: 'Reproducir la canción de Ciudad nevada' }).click();
  await p.waitForTimeout(400);
  comprobar('Sin Spotify abierto: explica qué hacer', (await p.locator('.reproductor-aviso').innerText()).includes('Abre la app de Spotify'));

  // 5) Conexión caducada: vuelve al reproductor integrado
  dispositivos = [{ id: 'm1', name: 'Pixel', type: 'Smartphone', is_active: true, is_restricted: false }];
  respuestaPlay = 401;
  await p.getByRole('button', { name: 'Reproducir la canción de Ciudad nevada' }).click();
  await p.waitForTimeout(800);
  comprobar('Si caduca: se desconecta y usa el reproductor integrado', (await p.getByRole('button', { name: 'Conectar Spotify' }).isVisible()) && (await p.locator('.falso-spotify').count()) === 1);

  // 6) Cancelar el permiso en Spotify
  await p.goto(URL + 'spotify?error=access_denied&state=x');
  await p.waitForSelector('.aviso[role=alert]');
  comprobar('Cancelar en Spotify: lo explica', (await p.locator('.aviso[role=alert]').innerText()).includes('cancelado'));

  comprobar('Sin errores de JavaScript', errores.length === 0, errores.join(' / '));
  console.log(fallos ? `\n${fallos} FALLOS` : '\nTodas las comprobaciones correctas');
  await b.close();
})();
