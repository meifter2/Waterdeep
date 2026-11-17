const { chromium } = require('playwright');
const { SPOTIFY, YOUTUBE } = require('./falsos.cjs');
const { crearElemento } = require('./ayuda.cjs');
const URL = 'http://localhost:4173/';
const OUT = process.env.CAPTURAS || require('os').tmpdir() + '/';
let fallos = 0;
const comprobar = (nombre, ok, extra='') => { if (!ok) fallos++; console.log(ok ? 'OK ' : 'MAL', nombre, extra) };

async function preparar(ctx, { bloquear = false } = {}) {
  await ctx.route('https://open.spotify.com/embed/iframe-api/v1', r => bloquear ? r.abort() : r.fulfill({ contentType: 'text/javascript', body: SPOTIFY }));
  await ctx.route('https://www.youtube.com/iframe_api', r => bloquear ? r.abort() : r.fulfill({ contentType: 'text/javascript', body: YOUTUBE }));
  await ctx.route(/open\.spotify\.com\/embed\/(track|playlist|album)|youtube\.com\/embed/, r => r.fulfill({ contentType: 'text/html', body: '<body style="margin:0;background:#444;color:#fff;font:14px sans-serif;display:grid;place-items:center;height:100vh">Reproductor básico (respaldo)</body>' }));
}

async function anadir(p, nombre, enlace, tipo = 'personaje', nota = '') {
  await crearElemento(p, { tipo, nombre, descripcion: nota, sonidos: enlace ? [{ enlace }] : [] });
}
const log = (p) => p.evaluate(() => window.__log || []);
const estado = (p) => p.locator('.reproductor-estado').innerText();

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1280, height: 820 } });
  await preparar(ctx);
  const p = await ctx.newPage();
  const errores = []; p.on('pageerror', e => errores.push(String(e))); p.on('console', m => m.type()==='error' && !m.text().includes('ERR_') && errores.push(m.text()));
  await p.goto(URL);
  await p.screenshot({ path: OUT + '01-vacio.png' });

  // Editor: validación
  await p.getByRole('button', { name: /^Añadir personaje/ }).click();
  await p.fill('#nuevo-enlace', 'https://soundcloud.com/x');
  comprobar('editor rechaza SoundCloud', (await p.locator('#nuevo-enlace-ayuda').innerText()).includes('Solo se admiten'));
  await p.fill('#nuevo-enlace', 'https://open.spotify.com/intl-es/track/4cOdK2wGLETKBW3PvgPWqT?si=1');
  comprobar('editor reconoce Spotify', (await p.locator('#nuevo-enlace-ayuda').innerText()).includes('canción de Spotify'));
  await p.getByRole('button', { name: 'Añadir enlace' }).click();
  await p.waitForSelector('.fila-pista');
  await p.getByRole('button', { name: 'Guardar', exact: true }).click();
  comprobar('editor exige nombre', await p.getByText('Escribe un nombre.').isVisible());
  await p.fill('#ed-nombre', 'Maela Brezo');
  await p.fill('#ed-descripcion', 'Tabernera');
  await p.screenshot({ path: OUT + '02-editor.png' });
  await p.getByRole('button', { name: 'Guardar', exact: true }).click();
  await p.waitForSelector('dialog[open]', { state: 'detached' });

  await anadir(p, 'Capitana Idris Mor', 'https://youtu.be/dQw4w9WgXcQ', 'personaje', 'Entra con la guardia');
  await anadir(p, 'Osric Velo', '', 'personaje');
  await anadir(p, 'Vídeo protegido', 'https://www.youtube.com/watch?v=bloqueado01', 'momento');
  await anadir(p, 'Canción sin sesión', 'https://open.spotify.com/track/previewPreviewPreview1', 'opening');

  // 1) Pulsar Spotify
  await p.getByRole('button', { name: 'Reproducir Maela Brezo' }).click();
  await p.waitForFunction(() => (window.__log||[]).some(l => l.startsWith('spotify:play')));
  await p.waitForTimeout(150);
  comprobar('Spotify: crea y reproduce', (await log(p)).join('|').includes('spotify:create spotify:track:4cOdK2wGLETKBW3PvgPWqT|spotify:play'));
  comprobar('Barra muestra «Sonando»', (await estado(p)).startsWith('Sonando'), await estado(p));
  comprobar('Tarjeta marcada como sonando', await p.locator('.tarjeta[data-sonando]').count() === 1);
  await p.screenshot({ path: OUT + '03-sonando-spotify.png' });

  // 2) Cambiar a YouTube
  await p.getByRole('button', { name: 'Reproducir Capitana Idris Mor' }).click();
  await p.waitForFunction(() => (window.__log||[]).some(l => l.startsWith('yt:play')));
  const l2 = (await log(p)).join('|');
  comprobar('YouTube: pausa Spotify y suena el vídeo', l2.includes('spotify:pause') && l2.includes('yt:create dQw4w9WgXcQ') && l2.includes('yt:play'));
  comprobar('Solo un personaje marcado', await p.locator('.tarjeta[data-actual]').count() === 1);
  await p.screenshot({ path: OUT + '04-sonando-youtube.png' });

  // 3) Pulsar el mismo = pausa; otra vez = reanuda
  await p.getByRole('button', { name: 'Pausar Capitana Idris Mor' }).click();
  await p.waitForTimeout(100);
  comprobar('Pulsar el que suena lo pausa', (await estado(p)).startsWith('En pausa'), await estado(p));
  await p.getByRole('button', { name: 'Reproducir Capitana Idris Mor' }).click();
  await p.waitForTimeout(100);
  comprobar('Pulsar de nuevo lo reanuda', (await estado(p)).startsWith('Sonando'));

  // 4) Repetir al terminar (YouTube)
  const antes = (await log(p)).length;
  await p.evaluate(() => window.__yt._terminar());
  await p.waitForTimeout(100);
  comprobar('Repetir: YouTube vuelve a empezar', (await log(p)).slice(antes).join('|').includes('yt:load dQw4w9WgXcQ'));

  // 5) Volver a Spotify reutiliza el reproductor (loadUri)
  await p.getByRole('button', { name: 'Reproducir Maela Brezo' }).click();
  await p.waitForTimeout(400);
  const l5 = (await log(p)).join('|');
  comprobar('Spotify reutiliza reproductor (loadUri + play)', l5.includes('yt:stop') && /spotify:loadUri spotify:track:4cOd[^|]*\|spotify:play/.test(l5));
  const a5 = (await log(p)).length;
  await p.evaluate(() => window.__spotify._terminar());
  await p.waitForTimeout(100);
  comprobar('Repetir: Spotify vuelve a empezar', (await log(p)).slice(a5).join('|').includes('spotify:play'));

  // 6) Botones de la barra
  await p.getByRole('button', { name: 'Pausar', exact: true }).click(); await p.waitForTimeout(100);
  comprobar('Botón Pausar', (await estado(p)).startsWith('En pausa'));
  await p.getByRole('button', { name: 'Reanudar', exact: true }).click(); await p.waitForTimeout(100);
  comprobar('Botón Reanudar', (await estado(p)).startsWith('Sonando'));
  await p.getByRole('button', { name: 'Detener' }).click(); await p.waitForTimeout(100);
  comprobar('Botón Detener', (await log(p)).at(-1) === 'spotify:pause' && await p.locator('.tarjeta[data-actual]').count() === 0);

  // 7) Sin canción → abre editor
  await p.getByRole('button', { name: 'Añadir sonido a Osric Velo' }).click();
  comprobar('Sin enlace: pulsar abre el editor', await p.getByRole('heading', { name: 'Editar Osric Velo' }).isVisible());
  await p.getByRole('button', { name: 'Cancelar' }).click();

  // 8) Vídeo que no se puede insertar
  await p.getByRole('button', { name: 'Reproducir Vídeo protegido' }).click();
  await p.waitForTimeout(300);
  comprobar('YouTube bloqueado: explica el motivo', (await p.locator('.reproductor-aviso').innerText()).includes('no permite reproducirlo fuera de YouTube'));
  await p.screenshot({ path: OUT + '05-error-youtube.png' });

  // 9) Spotify sin sesión (30 s)
  await p.getByRole('button', { name: 'Reproducir Canción sin sesión' }).click();
  await p.waitForTimeout(400);
  comprobar('Spotify sin sesión: avisa de los 30 s', (await p.locator('.reproductor-aviso').innerText()).includes('30 segundos'));

  // 10) Buscador + Intro
  await p.getByRole('button', { name: 'Detener' }).click();
  await p.keyboard.press('/');
  await p.keyboard.type('capi');
  await p.keyboard.press('Enter');
  await p.waitForTimeout(200);
  comprobar('Buscar + Intro hace sonar el primero', (await p.locator('.reproductor-titulo').innerText()) === 'Capitana Idris Mor');
  await p.keyboard.press('Escape');

  // 11) Persistencia tras recargar
  await p.reload();
  comprobar('Las canciones se conservan al recargar', await p.locator('.tarjeta').count() === 5);
  comprobar('Cada canción en su carpeta', await p.locator('.seccion-opening .tarjeta').count() === 1 && await p.locator('.seccion-personaje .tarjeta').count() === 3 && await p.locator('.seccion-momento .tarjeta').count() === 1);
  comprobar('Carpetas vacías invitan a añadir', await p.getByRole('button', { name: /^Añadir lugar/ }).isVisible());

  // 12) Copias: exportar y recuperar
  await p.getByRole('button', { name: 'Copias' }).click();
  const json = await p.evaluate(() => localStorage.getItem('banda-sonora:biblioteca'));
  const copia = JSON.stringify({ version: 3, canciones: [{ tipo: 'lugar', nombre: 'El Ancla Torcida', enlace: 'https://youtu.be/dQw4w9WgXcQ', nota: '' }] });
  await p.getByLabel('Pega aquí el texto de una copia').fill(copia);
  await p.getByRole('button', { name: 'Comprobar texto' }).click();
  comprobar('Copias: valida y pide confirmación', (await p.locator('.confirmar').innerText()).includes('1 elementos'));
  await p.getByRole('button', { name: 'Añadir', exact: true }).click();
  await p.waitForTimeout(200);
  await p.getByRole('button', { name: 'Cerrar' }).click();
  comprobar('Copias: añade a la carpeta correcta', await p.locator('.seccion-lugar .tarjeta').count() === 1);

  // 13) Eliminar
  await p.getByRole('button', { name: 'Editar Vídeo protegido' }).click();
  await p.getByRole('button', { name: 'Eliminar momento' }).click();
  await p.locator('.confirmar').getByRole('button', { name: 'Eliminar' }).click();
  await p.waitForTimeout(200);
  comprobar('Eliminar canción', await p.locator('.tarjeta').count() === 5);

  // 14) Móvil
  const m = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
  await preparar(m);
  const mp = await m.newPage();
  await mp.goto(URL);
  await mp.evaluate((d) => localStorage.setItem('banda-sonora:biblioteca', d), json);
  await mp.reload();
  await mp.getByRole('button', { name: 'Reproducir Capitana Idris Mor' }).click();
  await mp.waitForTimeout(300);
  await mp.screenshot({ path: OUT + '06-movil.png' });
  comprobar('Móvil sin desplazamiento horizontal', await mp.evaluate(() => document.documentElement.scrollWidth) <= 390);

  // 15) Si la API oficial no carga → reproductor básico
  const f = await b.newContext({ viewport: { width: 1280, height: 820 } });
  await preparar(f, { bloquear: true });
  const fp = await f.newPage();
  await fp.goto(URL);
  await fp.evaluate((d) => localStorage.setItem('banda-sonora:biblioteca', d), json);
  await fp.reload();
  await fp.getByRole('button', { name: 'Reproducir Maela Brezo' }).click();
  await fp.waitForSelector('.marco-respaldo', { timeout: 15000 });
  comprobar('Sin API: muestra reproductor básico y lo explica', (await fp.locator('.reproductor-aviso').innerText()).includes('Pulsa ▶'));
  await fp.screenshot({ path: OUT + '07-respaldo.png' });

  // 16) Oscuro
  const o = await b.newContext({ viewport: { width: 1280, height: 820 }, colorScheme: 'dark' });
  await preparar(o);
  const op = await o.newPage();
  await op.goto(URL);
  await op.evaluate((d) => localStorage.setItem('banda-sonora:biblioteca', d), json);
  await op.reload();
  await op.getByRole('button', { name: 'Reproducir Maela Brezo' }).click();
  await op.waitForTimeout(300);
  await op.screenshot({ path: OUT + '08-oscuro.png' });

  comprobar('Sin errores de JavaScript', errores.length === 0, errores.join(' / '));
  console.log(fallos ? `\n${fallos} FALLOS` : '\nTodas las comprobaciones correctas');
  await b.close();
})();
