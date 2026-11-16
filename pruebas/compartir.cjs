// Prueba de la PWA y de «Compartir» desde otra app (modo local, preview en 4173).
const { chromium, devices } = require('playwright');
const os = require('os');
const URL = 'http://localhost:4173/';
const OUT = process.env.CAPTURAS || os.tmpdir() + '/';
let fallos = 0;
const comprobar = (n, ok, extra = '') => { if (!ok) fallos++; console.log(ok ? 'OK ' : 'MAL', n, extra) };
const PISTA = 'https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT?si=abc';

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ ...devices['Pixel 7'] });
  await ctx.route(/open\.spotify\.com\/oembed/, (r) => r.fulfill({ json: { title: 'Snowbelle City - Arrangement' } }));
  await ctx.route(/open\.spotify\.com\/embed|youtube\.com\/iframe_api/, (r) => r.fulfill({ body: '' }));
  const p = await ctx.newPage();
  const errores = [];
  p.on('pageerror', (e) => errores.push(String(e)));

  // PWA: manifiesto y service worker
  const m = await (await p.request.get(URL + 'manifest.webmanifest')).json();
  comprobar('Manifiesto: standalone, iconos 192/512 y maskable', m.display === 'standalone' && m.icons.length === 3 && m.icons.some((i) => i.purpose === 'maskable'));
  comprobar('Manifiesto: share target por GET con url/text/title', m.share_target?.method === 'GET' && m.share_target.params.url === 'url' && m.share_target.params.text === 'text');
  await p.goto(URL);
  await p.waitForFunction(() => navigator.serviceWorker?.ready.then(() => true), null, { timeout: 10000 });
  comprobar('Service worker registrado', await p.evaluate(async () => !!(await navigator.serviceWorker.getRegistration())));

  // 1) Compartir solo el enlace (como Spotify): título por oEmbed
  await p.goto(URL + '?text=' + encodeURIComponent(PISTA));
  await p.waitForSelector('dialog[open]');
  comprobar('Abre el editor de canción compartida', await p.getByRole('heading', { name: 'Guardar canción compartida' }).isVisible());
  comprobar('Limpia la dirección', !p.url().includes('text='));
  comprobar('Enlace ya puesto', (await p.getByLabel('Enlace de la canción').inputValue()).startsWith('https://open.spotify.com/track/4cOd'));
  await p.waitForTimeout(400);
  comprobar('Nota con el título de la canción', (await p.getByLabel('Nota (opcional)').inputValue()) === 'Snowbelle City - Arrangement');
  await p.getByRole('radio', { name: 'Lugar', exact: true }).check();
  await p.getByLabel(/^Nombre/).fill('Ciudad nevada');
  await p.screenshot({ path: OUT + 'compartir-movil.png' });
  await p.getByRole('button', { name: 'Guardar', exact: true }).click();
  await p.waitForTimeout(300);
  comprobar('Se guarda en Lugares', await p.locator('.seccion-lugar .tarjeta').count() === 1);
  comprobar('Confirma lo guardado', (await p.locator('.aviso-flotante').innerText()).includes('guardada en Lugares'));

  // 2) Compartir con texto + enlace (como YouTube): recuerda la última carpeta
  await p.goto(URL + '?title=' + encodeURIComponent('Tema de la capitana') + '&text=' + encodeURIComponent('Mira esto https://youtu.be/dQw4w9WgXcQ'));
  await p.waitForSelector('dialog[open]');
  comprobar('Recuerda la última carpeta usada', await p.getByRole('radio', { name: 'Lugar', exact: true }).isChecked());
  comprobar('Extrae el enlace del texto', (await p.getByLabel('Enlace de la canción').inputValue()) === 'https://youtu.be/dQw4w9WgXcQ');
  comprobar('Usa el texto compartido como nota', (await p.getByLabel('Nota (opcional)').inputValue()).includes('Tema de la capitana'));
  await p.getByRole('button', { name: 'Cancelar' }).click();

  // 3) Compartir algo que no es música: se explica
  await p.goto(URL + '?text=' + encodeURIComponent('https://www.instagram.com/p/xyz'));
  await p.waitForSelector('dialog[open]');
  comprobar('Enlace no válido: lo explica', (await p.locator('#ed-enlace-ayuda').innerText()).includes('Solo se admiten'));

  comprobar('Sin errores de JavaScript', errores.length === 0, errores.join(' / '));
  console.log(fallos ? `\n${fallos} FALLOS` : '\nTodas las comprobaciones correctas');
  await b.close();
})();
