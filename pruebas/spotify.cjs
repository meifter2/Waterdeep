// Prueba de «Conectar Spotify» (Spotify Connect) con Spotify simulado.
// Requiere: npm run build:spotify && npm run preview:spotify (puerto 4175).
const { chromium } = require('playwright');
const crypto = require('crypto');
const { SPOTIFY } = require('./falsos.cjs');
const { crearElemento, wav } = require('./ayuda.cjs');
const URL = 'http://localhost:4175/';
const PISTA = 'https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT';
let fallos = 0;
const comprobar = (n, ok, extra = '') => { if (!ok) fallos++; console.log(ok ? 'OK ' : 'MAL', n, extra) };

(async () => {
  const b = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const ctx = await b.newContext({ viewport: { width: 1280, height: 820 } });
  const api = [];
  let reto = '', tokenBody = '';
  let dispositivos = [{ id: 'pc1', name: 'Mi PC', type: 'Computer', is_active: false, is_restricted: false, volume_percent: 64, supports_volume: true }];
  let respuestaPlay = 204;
  let retrasoPlay = 0;
  let limitarVolumen = 0; // nº de respuestas 429 a dar a los cambios de volumen
  // Estado REAL simulado de Spotify (lo que «suena» en la app).
  const sp = { uri: null, contexto: null, sonando: false, progreso: 0, dispositivo: 'pc1' };
  const cors = { 'access-control-allow-origin': '*', 'access-control-expose-headers': 'Retry-After' };
  const dispo = (id) => dispositivos.find((d) => d.id === id) || dispositivos[0];

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
  await ctx.route(/api\.spotify\.com\/v1/, async (r) => {
    const req = r.request();
    const u = new globalThis.URL(req.url());
    const ruta = req.url().replace('https://api.spotify.com/v1', '');
    const metodo = req.method();
    api.push(`${metodo} ${ruta}${req.postData() ? ' ' + req.postData() : ''}`);
    const id = u.searchParams.get('device_id');
    if (u.pathname.endsWith('/me/player/devices')) return r.fulfill({ json: { devices: dispositivos.map((d) => ({ ...d, is_active: d.id === sp.dispositivo && !!sp.uri })) }, headers: cors });
    if (u.pathname.endsWith('/me/player/play') && metodo === 'PUT') {
      if (retrasoPlay) await new Promise((ok) => setTimeout(ok, retrasoPlay));
      if (respuestaPlay !== 204) return r.fulfill({ status: respuestaPlay, body: '{}', headers: cors });
      const cuerpo = req.postData() ? JSON.parse(req.postData()) : null;
      if (cuerpo?.uris) Object.assign(sp, { uri: cuerpo.uris[0], contexto: null, progreso: cuerpo.position_ms || 0 });
      else if (cuerpo?.context_uri) Object.assign(sp, { uri: 'spotify:track:primeraDeLaLista0000001', contexto: cuerpo.context_uri, progreso: 0 });
      Object.assign(sp, { sonando: true, dispositivo: id || sp.dispositivo });
      return r.fulfill({ status: 204, body: '', headers: cors });
    }
    if (u.pathname.endsWith('/me/player/pause')) { sp.sonando = false; return r.fulfill({ status: 204, body: '', headers: cors }); }
    if (u.pathname.endsWith('/me/player/volume')) {
      if (limitarVolumen > 0) { limitarVolumen--; return r.fulfill({ status: 429, body: '', headers: { ...cors, 'Retry-After': '1' } }); }
      const d = dispo(id);
      if (d.supports_volume === false) return r.fulfill({ status: 403, json: { error: { status: 403, reason: 'VOLUME_CONTROL_DISALLOW' } }, headers: cors });
      d.volume_percent = Number(u.searchParams.get('volume_percent'));
      return r.fulfill({ status: 204, body: '', headers: cors });
    }
    if (u.pathname.endsWith('/me/player') && metodo === 'GET') {
      if (!sp.uri) return r.fulfill({ status: 204, body: '', headers: cors });
      return r.fulfill({
        json: { is_playing: sp.sonando, progress_ms: sp.progreso, item: { uri: sp.uri }, context: sp.contexto ? { uri: sp.contexto } : null, device: { ...dispo(sp.dispositivo), is_active: true } },
        headers: cors,
      });
    }
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
  await crearElemento(p, { tipo: 'lugar', nombre: 'Ciudad nevada', sonidos: [{ enlace: PISTA }] });
  await crearElemento(p, { tipo: 'momento', nombre: 'Clímax', sonidos: [{ enlace: PISTA, inicio: '0:30', fin: '0:31' }] });
  const B = 'spotify:track:1111111111111111111111', C = 'spotify:track:2222222222222222222222', D = 'spotify:track:3333333333333333333333';
  const web = (u) => 'https://open.spotify.com/track/' + u.split(':')[2];
  await crearElemento(p, { tipo: 'personaje', nombre: 'Ending Waterdeep', sonidos: [{ enlace: web(B) }] });
  await crearElemento(p, { tipo: 'personaje', nombre: 'Persecución', sonidos: [{ enlace: web(C) }] });
  await crearElemento(p, { tipo: 'personaje', nombre: 'Huida', sonidos: [{ enlace: web(D), inicio: '0:10', fin: '0:11' }] });
  await crearElemento(p, { tipo: 'ambiente', nombre: 'Lluvia MP3', sonidos: [{ archivo: { name: 'lluvia.wav', mimeType: 'audio/wav', buffer: wav(6) } }] });
  const estado = () => p.locator('.reproductor-estado').innerText();
  const plays = () => api.filter((x) => x.startsWith('PUT /me/player/play'));

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
  await p.getByRole('button', { name: 'Reproducir Ciudad nevada' }).click();
  await p.waitForTimeout(500);
  const play = api.find((x) => x.startsWith('PUT /me/player/play?device_id=pc1')) || '';
  comprobar('Manda reproducir la canción completa en «Mi PC»', play.includes('"uris":["spotify:track:4cOdK2wGLETKBW3PvgPWqT"]'));
  comprobar('Activa repetir canción', api.some((x) => x.startsWith('PUT /me/player/repeat?state=track&device_id=pc1')));
  comprobar('La barra dice dónde suena', (await p.locator('.reproductor-estado').innerText()).includes('en Mi PC'));
  comprobar('No carga el reproductor integrado', !(await p.locator('.falso-spotify').count()));

  // 2b) Tramo: el inicio va a Spotify (position_ms); con fin, la app corta (aprox.) y no usa repetir de Spotify
  await p.getByRole('button', { name: 'Reproducir Clímax' }).click();
  await p.waitForTimeout(500);
  comprobar('Tramo: empieza en 0:30 (position_ms)', api.some((x) => x.startsWith('PUT /me/player/play?device_id=pc1') && x.includes('"position_ms":30000')));
  comprobar('Tramo con fin: no activa repetir canción de Spotify', api.filter((x) => x.startsWith('PUT /me/player/repeat')).at(-1).includes('state=off'));
  const antesCorte = api.filter((x) => x.includes('"position_ms":30000')).length;
  await p.waitForTimeout(1500);
  comprobar('Tramo en bucle: al llegar al fin vuelve al inicio (aprox.)', api.filter((x) => x.includes('"position_ms":30000')).length > antesCorte);
  await p.getByRole('button', { name: 'Reproducir Ciudad nevada' }).click();
  await p.waitForTimeout(400);

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

  // 3b) BUG: cambian la canción desde la app oficial y se vuelve a pulsar la misma tarjeta
  await p.getByRole('button', { name: 'Reproducir Ending Waterdeep' }).click();
  await p.waitForFunction(() => document.querySelector('.reproductor-estado')?.textContent.startsWith('Sonando'));
  Object.assign(sp, { uri: 'spotify:track:otraCancionDeFuera00001', contexto: null, sonando: true }); // desde la app de Spotify
  const antesBug = plays().length;
  await p.getByRole('button', { name: 'Reproducir Ending Waterdeep' }).click();
  await p.waitForTimeout(600);
  comprobar('Cambio externo + misma tarjeta: vuelve a poner su canción', plays().length > antesBug && plays().at(-1).includes(B) && sp.uri === B, sp.uri);
  // y si no se toca nada, el sondeo detecta el cambio externo y la tarjeta deja de marcarse
  Object.assign(sp, { uri: 'spotify:track:otraCancionDeFuera00001', sonando: true });
  await p.waitForFunction(() => document.querySelector('.reproductor-estado')?.textContent.startsWith('Spotify está con otra'), null, { timeout: 7000 }).catch(() => {});
  comprobar('Detecta el cambio hecho en la app de Spotify y no finge que suena lo de DFY', (await estado()).startsWith('Spotify está con otra') && (await p.locator('.tarjeta[data-actual]').count()) === 0, await estado());
  await p.getByRole('button', { name: 'Reproducir Ending Waterdeep' }).click();
  await p.waitForTimeout(600);
  comprobar('…y al pulsar la tarjeta la recupera', sp.uri === B && (await estado()).startsWith('Sonando'));
  // Misma tarjeta con la canción ya sonando: no la reinicia
  const antesMisma = plays().length;
  await p.getByRole('button', { name: 'Reproducir Ending Waterdeep' }).click();
  await p.waitForTimeout(500);
  comprobar('Misma tarjeta sonando de verdad: no la reinicia', plays().length === antesMisma);

  // 3c) Pulsar tres tarjetas muy rápido (respuestas lentas): acaba sonando la última
  retrasoPlay = 300;
  const antesRapido = plays().length;
  await p.getByRole('button', { name: 'Reproducir Ciudad nevada' }).click();
  await p.getByRole('button', { name: 'Reproducir Persecución' }).click();
  await p.getByRole('button', { name: 'Reproducir Ending Waterdeep' }).click();
  await p.waitForTimeout(1500);
  retrasoPlay = 0;
  const rapidas = plays().slice(antesRapido);
  comprobar('Pulsaciones rápidas: suena la última (Ending)', sp.uri === B && (await p.locator('.reproductor-titulo').innerText()) === 'Ending Waterdeep', sp.uri);
  comprobar('…sin enviar órdenes ya sustituidas (Persecución se descarta)', !rapidas.some((x) => x.includes(C)) && rapidas.at(-1).includes(B), rapidas.length + ' órdenes');

  // 3d) El temporizador de repetición de una canción anterior no la relanza sobre la nueva
  await p.getByRole('button', { name: 'Reproducir Huida' }).click();
  await p.waitForTimeout(300);
  await p.getByRole('button', { name: 'Reproducir Persecución' }).click();
  await p.waitForTimeout(1600);
  const trasHuida = plays().slice(plays().findIndex((x) => x.includes(C)));
  comprobar('El corte de «Huida» no vuelve a lanzarla sobre «Persecución»', sp.uri === C && !trasHuida.some((x) => x.includes(D)), sp.uri);

  // 3e) Spotify → MP3 → Spotify (nunca superpuestos)
  await p.getByRole('button', { name: 'Reproducir Lluvia MP3' }).click();
  await p.waitForFunction(() => window.__audioBandaSonora && !window.__audioBandaSonora.paused, null, { timeout: 8000 });
  comprobar('Spotify → MP3: pausa Spotify y suena el archivo', !sp.sonando);
  await p.getByRole('button', { name: 'Reproducir Persecución' }).click();
  await p.waitForTimeout(600);
  comprobar('MP3 → Spotify: para el archivo y vuelve Spotify', (await p.evaluate(() => window.__audioBandaSonora.paused)) && sp.sonando && sp.uri === C);

  // 3f) Volumen de Spotify: se lee del dispositivo, se cambia con el deslizador, sin forzarlo al conectar
  comprobar('Lee el volumen real del dispositivo (64 %) sin forzarlo', (await p.locator('.volumen-valor').innerText()) === '64 %' && !api.some((x) => x.includes('/me/player/volume')) && (await p.locator('.volumen-nota').innerText()).includes('Spotify en Mi PC'));
  const nVol = () => api.filter((x) => x.includes('/me/player/volume')).length;
  for (const v of ['60', '55', '50', '45', '40']) await p.locator('#volumen').fill(v);
  await p.waitForTimeout(900);
  comprobar('Arrastrar el volumen: pocas peticiones y siempre el último valor', dispo('pc1').volume_percent === 40 && nVol() <= 3, `${nVol()} peticiones`);
  comprobar('Cambiar el volumen no interrumpe la canción', sp.sonando && sp.uri === C);
  await p.getByRole('button', { name: 'Silenciar' }).click();
  await p.waitForTimeout(500);
  comprobar('Silenciar en Spotify: lo baja a 0', dispo('pc1').volume_percent === 0);
  await p.getByRole('button', { name: 'Activar sonido' }).click();
  await p.waitForTimeout(500);
  comprobar('Activar sonido: recupera el valor anterior (40 %)', dispo('pc1').volume_percent === 40);
  limitarVolumen = 1;
  await p.locator('#volumen').fill('35');
  await p.waitForTimeout(1800);
  comprobar('Límite de peticiones (429): espera y reintenta el último valor', dispo('pc1').volume_percent === 35);
  comprobar('El volumen de DFY (archivos) no se ha tocado', (await p.evaluate(() => JSON.parse(localStorage.getItem('banda-sonora:volumen') ?? '{"local":70}').local)) === 70);

  // 3g) Dispositivo sin control de volumen
  dispositivos = [{ id: 'tv1', name: 'Altavoz', type: 'Speaker', is_active: false, is_restricted: false, volume_percent: 30, supports_volume: false }];
  sp.dispositivo = 'tv1';
  await p.getByRole('button', { name: 'Reproducir Ciudad nevada' }).click();
  await p.waitForTimeout(700);
  comprobar('Dispositivo sin volumen: deslizador desactivado y explicado', (await p.locator('#volumen').isDisabled()) && (await p.locator('.volumen-nota').innerText()).includes('ajústalo en Spotify'));
  dispositivos = [{ id: 'pc1', name: 'Mi PC', type: 'Computer', is_active: false, is_restricted: false, volume_percent: 35, supports_volume: true }];
  sp.dispositivo = 'pc1';
  await p.getByRole('button', { name: 'Detener' }).click();

  // 4) Spotify cerrado: sin dispositivos
  dispositivos = [];
  await p.getByRole('button', { name: 'Reproducir Ciudad nevada' }).click();
  await p.waitForTimeout(400);
  comprobar('Sin Spotify abierto: explica qué hacer', (await p.locator('.reproductor-aviso').innerText()).includes('Abre la app de Spotify'));
  comprobar('…y no afirma que está sonando', !(await estado()).startsWith('Sonando') && (await p.locator('.tarjeta[data-sonando]').count()) === 0, await estado());

  // 5) Conexión caducada: vuelve al reproductor integrado
  dispositivos = [{ id: 'm1', name: 'Pixel', type: 'Smartphone', is_active: true, is_restricted: false, volume_percent: 50, supports_volume: true }];
  respuestaPlay = 401;
  await p.getByRole('button', { name: 'Reproducir Ciudad nevada' }).click();
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
