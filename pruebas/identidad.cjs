// Identidad DFY: título, manifest, iconos, textos y que el cambio de nombre no pierde datos.
// Requiere preview en 4173 (modo local) y preview:prueba en 4174 (Supabase simulado).
const { chromium } = require('playwright');
const { comprobador } = require('./ayuda.cjs');
const { comprobar, fin } = comprobador();

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1280, height: 860 } });
  await ctx.route(/supabase\.co|spotify|youtube/, (r) => r.fulfill({ status: 204, body: '' }));
  const p = await ctx.newPage();
  const errores = [];
  p.on('pageerror', (e) => errores.push(String(e)));

  // Manifest e iconos
  const m = await (await p.request.get('http://localhost:4173/manifest.webmanifest')).json();
  comprobar('Manifest: nombre DFY y nombre corto DFY', m.short_name === 'DFY' && m.name.startsWith('DFY'));
  comprobar('Manifest: descripción con el eslogan', m.description.startsWith('El sonido de tus aventuras'));
  comprobar('Manifest: mantiene compartir (share target) y la ruta de inicio', m.share_target?.method === 'GET' && m.start_url === '/' && m.id === '/');
  let iconosOk = true;
  for (const i of m.icons) iconosOk = iconosOk && (await p.request.get('http://localhost:4173' + i.src)).ok();
  comprobar('Todos los iconos del manifest existen (incluido maskable)', iconosOk && m.icons.some((i) => i.purpose === 'maskable'));

  // Datos guardados con el nombre anterior (claves banda-sonora:*): siguen ahí
  // Como un usuario de antes: datos y caché antigua ANTES de que llegue el service worker nuevo.
  // (Se prepara desde una URL del mismo sitio que no registra el service worker.)
  await p.goto('http://localhost:4173/manifest.webmanifest');
  await p.evaluate(async () => {
    localStorage.clear();
    localStorage.setItem('banda-sonora:canciones', JSON.stringify([{ tipo: 'lugar', nombre: 'El Ancla Torcida', enlace: 'https://youtu.be/dQw4w9WgXcQ', nota: '' }]));
    await caches.open('banda-sonora-v1').then((c) => c.put('/viejo', new Response('x')));
  });
  await p.goto('http://localhost:4173/');
  await p.waitForSelector('.cabecera');
  comprobar('Título del navegador', (await p.title()) === 'DFY · El sonido de tus aventuras');
  comprobar('Favicon nuevo', (await p.locator('link[rel=icon][type="image/svg+xml"]').getAttribute('href')) === '/iconos/dfy.svg');
  comprobar('Cabecera con logo y nombre DFY', (await p.locator('h1.marca').innerText()).trim() === 'DFY' && (await p.locator('h1.marca img').count()) === 1);
  comprobar('Los datos guardados con el nombre anterior siguen apareciendo', (await p.locator('.tarjeta', { hasText: 'El Ancla Torcida' }).count()) === 1);
  // El service worker se activa al poco de cargar: se espera (hasta 6 s) a que limpie la caché antigua.
  await p.waitForFunction(async () => !(await caches.keys()).includes('banda-sonora-v1'), null, { timeout: 6000, polling: 200 }).catch(() => {});
  const cachesNombres = await p.evaluate(() => caches.keys());
  comprobar('El service worker nuevo retira su caché antigua (solo archivos de la app)', !cachesNombres.includes('banda-sonora-v1'), cachesNombres.join(','));
  comprobar('…sin tocar los datos del navegador', (await p.evaluate(() => localStorage.getItem('banda-sonora:biblioteca'))).includes('El Ancla Torcida'));

  // Pantalla de entrada (con Supabase)
  await p.goto('http://localhost:4174/');
  await p.evaluate(() => localStorage.clear());
  await p.reload();
  await p.waitForSelector('.entrada');
  comprobar('Entrada: DFY y eslogan', (await p.locator('.entrada h1').innerText()).trim() === 'DFY' && (await p.locator('.entrada-lema').innerText()) === 'El sonido de tus aventuras');
  comprobar('Entrada: se mantienen Google y email', (await p.getByRole('button', { name: 'Entrar con Google' }).isVisible()) && (await p.locator('#en-email').isVisible()));
  await p.screenshot({ path: (process.env.CAPTURAS || require('os').tmpdir() + '/') + 'dfy-entrada.png' });

  comprobar('Sin errores de JavaScript', errores.length === 0, errores.join(' / '));
  const f = fin();
  await b.close();
  process.exit(f ? 1 : 0);
})();
