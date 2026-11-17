// Biblioteca v4 en modo local (preview en 4173): crear, editar, asociar, reutilizar, eliminar y reproducir.
const { chromium } = require('playwright');
const path = require('path');
const { SPOTIFY, YOUTUBE } = require('./falsos.cjs');
const { wav, crearElemento, anadirSonidos, comprobador, CAPTURAS } = require('./ayuda.cjs');
const URL = 'http://localhost:4173/';
const SPOT = 'https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT';
const RETRATO = path.join(__dirname, '../public/iconos/dfy-192.png');
const { comprobar, fin } = comprobador();

(async () => {
  const b = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const ctx = await b.newContext({ viewport: { width: 1280, height: 860 } });
  await ctx.route('https://open.spotify.com/embed/iframe-api/v1', (r) => r.fulfill({ contentType: 'text/javascript', body: SPOTIFY }));
  await ctx.route('https://www.youtube.com/iframe_api', (r) => r.fulfill({ contentType: 'text/javascript', body: YOUTUBE }));
  await ctx.route(/open\.spotify\.com\/oembed/, (r) => r.fulfill({ json: { title: 'Snowbelle City' } }));
  await ctx.route(/youtube\.com\/oembed/, (r) => r.fulfill({ json: { title: 'Lluvia en el puerto' } }));
  const p = await ctx.newPage();
  const errores = [];
  p.on('pageerror', (e) => errores.push(String(e)));
  await p.goto(URL);
  await p.evaluate(() => { localStorage.clear(); indexedDB.deleteDatabase('banda-sonora'); });
  await p.reload();
  const log = () => p.evaluate(() => window.__log || []);
  const audio = () => p.evaluate(() => { const a = window.__audioBandaSonora; return a ? { t: a.currentTime, pausado: a.paused, src: a.src } : null });
  const estado = () => p.locator('.reproductor-estado').innerText();

  comprobar('Siete carpetas, con Ambientes y Efectos', (await p.locator('.seccion').count()) === 7 && (await p.getByRole('heading', { name: 'Ambientes' }).isVisible()) && (await p.getByRole('heading', { name: 'Efectos' }).isVisible()));

  // ── Crear: personaje con retrato, un enlace y un archivo con tramo ──
  await crearElemento(p, {
    tipo: 'personaje', nombre: 'Capitana Idris', descripcion: 'Vigías del Puente', retrato: RETRATO,
    sonidos: [
      { enlace: SPOT, etiqueta: 'Tema principal' },
      { archivo: { name: 'tension.wav', mimeType: 'audio/wav', buffer: wav(4) }, etiqueta: 'Tensión', inicio: '0:01', fin: '0:02', bucle: true },
    ],
  });
  const idris = p.locator('.tarjeta', { hasText: 'Capitana Idris' });
  comprobar('Tarjeta con retrato a la izquierda', (await idris.locator('.tarjeta-retrato img').count()) === 1);
  comprobar('Un botón por pista', (await idris.locator('.pista-chip').allInnerTexts()).join('|') === 'Tema principal|Tensión');
  comprobar('Título del enlace sugerido por oEmbed', (await p.evaluate(() => localStorage.getItem('banda-sonora:biblioteca'))).includes('Snowbelle City'));
  await p.screenshot({ path: CAPTURAS + 'biblioteca.png' });

  // ── Reproducir archivo propio con tramo en bucle ──
  await p.getByRole('button', { name: 'Reproducir Tensión de Capitana Idris' }).click();
  await p.waitForFunction(() => window.__audioBandaSonora && !window.__audioBandaSonora.paused, null, { timeout: 8000 });
  const a1 = await audio();
  comprobar('Archivo: empieza en el inicio del tramo (1 s)', a1.t >= 0.95 && a1.t < 1.4, a1.t.toFixed(2));
  await p.waitForTimeout(2600);
  const a2 = await audio();
  comprobar('Archivo: repite el tramo sin salirse (1–2 s)', !a2.pausado && a2.t >= 0.95 && a2.t <= 2.06, a2.t.toFixed(2));
  comprobar('La barra muestra pista, origen y tramo', (await estado()).includes('Tensión, archivo propio, 0:01–0:02'), await estado());
  // Sin bucle: se para en el fin
  await p.getByRole('button', { name: 'Repetir', exact: true }).click();
  await p.waitForTimeout(1500);
  const a3 = await audio();
  comprobar('Archivo sin bucle: se para al llegar al fin y vuelve al inicio', a3.pausado && Math.abs(a3.t - 1) < 0.06 && (await estado()).startsWith('En pausa'), `${a3.t.toFixed(2)} ${await estado()}`);

  // ── Reproducir enlace (Spotify integrado) ──
  await p.getByRole('button', { name: 'Reproducir Tema principal de Capitana Idris' }).click();
  await p.waitForFunction(() => (window.__log || []).some((l) => l.startsWith('spotify:play')));
  comprobar('Spotify: suena y el archivo se para', (await audio()).pausado && (await log()).some((l) => l.startsWith('spotify:create spotify:track:4cOd')));
  await p.getByRole('button', { name: 'Pausar', exact: true }).click();
  await p.waitForTimeout(200);
  comprobar('Pausar desde la barra', (await estado()).startsWith('En pausa'));
  await p.getByRole('button', { name: 'Detener' }).click();

  // ── YouTube con tramo oficial ──
  await crearElemento(p, { tipo: 'momento', nombre: 'Persecución', sonidos: [{ enlace: 'https://youtu.be/dQw4w9WgXcQ', inicio: '1:00', fin: '1:30.5' }] });
  await p.getByRole('button', { name: 'Reproducir Persecución' }).click();
  await p.waitForFunction(() => (window.__log || []).some((l) => l.startsWith('yt:play')));
  comprobar('YouTube: inicio y fin oficiales (start/end)', (await log()).some((l) => l === 'yt:create dQw4w9WgXcQ start=60 end=91'), (await log()).filter((l) => l.startsWith('yt:')).join(' / '));
  const antes = (await log()).length;
  await p.evaluate(() => window.__yt._terminar());
  await p.waitForTimeout(150);
  comprobar('YouTube: al acabar el tramo lo repite', (await log()).slice(antes).some((l) => l === 'yt:load dQw4w9WgXcQ start=60 end=90.5'));

  // ── Ambientes en bucle y efectos una vez (por defecto) ──
  await p.getByRole('button', { name: /^Añadir ambiente/ }).click();
  await anadirSonidos(p, [{ enlace: 'https://youtu.be/aaaaaaaaaaa' }]);
  comprobar('Ambiente: bucle activado por defecto', await p.locator('.fila-pista').getByLabel('En bucle').isChecked());
  await p.getByRole('button', { name: 'Cancelar' }).click();
  await p.getByRole('button', { name: /^Añadir efecto/ }).click();
  await anadirSonidos(p, [{ enlace: 'https://youtu.be/bbbbbbbbbbb' }]);
  comprobar('Efecto: suena una vez por defecto', !(await p.locator('.fila-pista').getByLabel('En bucle').isChecked()));
  await p.getByRole('button', { name: 'Cancelar' }).click();

  // ── Validaciones ──
  await p.getByRole('button', { name: /^Añadir lugar/ }).click();
  await p.fill('#ed-nombre', 'Taberna');
  await anadirSonidos(p, [{ biblioteca: 'tension', inicio: '0:03', fin: '0:02' }]);
  comprobar('Tramo con fin antes del inicio: avisa', (await p.locator('.fila-pista .error').innerText()).includes('posterior al inicio'));
  await p.getByRole('button', { name: 'Guardar', exact: true }).click();
  comprobar('…y no deja guardar', await p.locator('dialog[open]').isVisible());
  await p.locator('.fila-pista [id$="-inicio"]').fill('');
  await p.locator('.fila-pista [id$="-fin"]').fill('');
  await p.getByRole('button', { name: 'Archivo propio' }).click();
  await p.setInputFiles('input[aria-label="Archivos de audio"]', { name: 'notas.txt', mimeType: 'text/plain', buffer: Buffer.from('hola') });
  comprobar('Archivo que no es audio: rechazado con explicación', (await p.locator('.anadir-pista [role=status]').innerText()).includes('no es un formato de audio'));
  const enorme = path.join(require('os').tmpdir(), 'enorme-prueba.mp3');
  require('fs').writeFileSync(enorme, Buffer.alloc(51 * 1024 * 1024));
  await p.setInputFiles('input[aria-label="Archivos de audio"]', enorme);
  comprobar('Archivo de más de 50 MB: rechazado', (await p.locator('.anadir-pista [role=status]').innerText()).includes('El máximo son 50 MB'));
  await p.getByRole('button', { name: 'Guardar', exact: true }).click();
  await p.waitForSelector('dialog[open]', { state: 'detached' });

  // ── Reutilizar sin duplicar ──
  const recursos = () => p.evaluate(() => JSON.parse(localStorage.getItem('banda-sonora:biblioteca')).recursos.length);
  comprobar('Reutilizar desde la biblioteca no duplica el sonido', (await recursos()) === 3, String(await recursos()));
  await p.getByRole('button', { name: 'Editar Taberna' }).click();
  await anadirSonidos(p, [{ archivo: { name: 'copia.wav', mimeType: 'audio/wav', buffer: wav(4) } }]);
  await p.getByRole('button', { name: 'Guardar', exact: true }).click();
  await p.waitForSelector('dialog[open]', { state: 'detached' });
  comprobar('Subir el mismo archivo otra vez lo reutiliza (misma huella)', (await recursos()) === 3);
  await p.getByRole('button', { name: 'Sonidos' }).click();
  const fila = p.locator('.biblioteca-lista li', { hasText: 'tension' });
  comprobar('La biblioteca dice dónde se usa', (await fila.locator('.biblioteca-usos').innerText()).includes('Capitana Idris, Taberna'));
  await p.getByRole('button', { name: 'Cerrar' }).click();

  // ── Eliminar un elemento no borra sus sonidos ──
  await p.getByRole('button', { name: 'Editar Capitana Idris' }).click();
  await p.getByRole('button', { name: 'Eliminar personaje' }).click();
  await p.locator('.confirmar').getByRole('button', { name: 'Eliminar' }).click();
  await p.waitForTimeout(200);
  comprobar('Eliminar un elemento conserva sus sonidos', (await recursos()) === 3 && (await p.locator('.tarjeta', { hasText: 'Capitana Idris' }).count()) === 0);
  await p.getByRole('button', { name: 'Reproducir Taberna' }).click();
  await p.waitForFunction(() => window.__audioBandaSonora && !window.__audioBandaSonora.paused, null, { timeout: 8000 });
  comprobar('El archivo compartido sigue sonando desde otro elemento', true);
  await p.getByRole('button', { name: 'Detener' }).click();

  // ── Quitar una asociación y borrar el sonido de la biblioteca ──
  await p.getByRole('button', { name: 'Editar Taberna' }).click();
  await p.getByRole('button', { name: 'Quitar la pista 1 de este elemento' }).click();
  // Las dos pistas de Taberna usan el mismo sonido (se reutilizó): se quitan ambas.
  await p.getByRole('button', { name: 'Quitar la pista 1 de este elemento' }).click();
  await p.getByRole('button', { name: 'Guardar', exact: true }).click();
  await p.waitForSelector('dialog[open]', { state: 'detached' });
  await p.getByRole('button', { name: 'Sonidos' }).click();
  comprobar('Quitar la pista deja el sonido «Sin usar»', (await p.locator('.biblioteca-lista li', { hasText: 'tension' }).locator('.biblioteca-usos').innerText()) === 'Sin usar');
  const archivosAntes = await p.evaluate(() => new Promise((r) => { const q = indexedDB.open('banda-sonora'); q.onsuccess = () => { const c = q.result.transaction('archivos').objectStore('archivos').count(); c.onsuccess = () => r(c.result) } }));
  await p.locator('.biblioteca-lista li', { hasText: 'tension' }).getByRole('button', { name: 'Borrar' }).click();
  await p.getByRole('button', { name: 'Borrar definitivamente' }).click();
  await p.waitForTimeout(300);
  const archivosDespues = await p.evaluate(() => new Promise((r) => { const q = indexedDB.open('banda-sonora'); q.onsuccess = () => { const c = q.result.transaction('archivos').objectStore('archivos').count(); c.onsuccess = () => r(c.result) } }));
  comprobar('Borrar el sonido borra también su archivo', (await recursos()) === 2 && archivosDespues === archivosAntes - 1, `${archivosAntes}→${archivosDespues}`);
  await p.getByRole('button', { name: 'Cerrar' }).click();

  // ── Editar: cambiar etiqueta y orden ──
  await crearElemento(p, { tipo: 'personaje', nombre: 'Osric', sonidos: [{ enlace: SPOT, etiqueta: 'Calma' }, { enlace: 'https://youtu.be/dQw4w9WgXcQ', etiqueta: 'Huida' }] });
  await p.getByRole('button', { name: 'Editar Osric' }).click();
  await p.getByRole('button', { name: 'Bajar la pista 1' }).click();
  await p.locator('.fila-pista').nth(0).locator('[id$="-etiqueta"]').fill('Huida veloz');
  await p.getByRole('button', { name: 'Guardar', exact: true }).click();
  await p.waitForSelector('dialog[open]', { state: 'detached' });
  comprobar('Editar etiquetas y orden', (await p.locator('.tarjeta', { hasText: 'Osric' }).locator('.pista-chip').allInnerTexts()).join('|') === 'Huida veloz|Calma');
  comprobar('Pulsar el nombre suena la primera pista', await (async () => { await p.getByRole('button', { name: 'Reproducir Osric' }).click(); await p.waitForTimeout(300); return (await estado()).includes('Huida veloz') })());
  await p.getByRole('button', { name: 'Detener' }).click();

  // ── Persistencia ──
  await p.reload();
  comprobar('Todo se conserva al recargar', (await p.locator('.tarjeta').count()) === 3);

  // ── Copias v4: exportar y volver a añadir sin duplicar sonidos ──
  const copia = await p.evaluate(() => localStorage.getItem('banda-sonora:biblioteca'));
  await p.getByRole('button', { name: 'Copias' }).click();
  await p.getByLabel('Pega aquí el texto de una copia').fill(copia);
  await p.getByRole('button', { name: 'Comprobar texto' }).click();
  await p.getByRole('button', { name: 'Añadir', exact: true }).click();
  await p.waitForTimeout(500);
  comprobar('Copias: añade los elementos y reutiliza los sonidos', (await p.locator('.tarjeta').count()) === 6 && (await recursos()) === 2);
  await p.getByRole('button', { name: 'Cerrar' }).click();

  comprobar('Sin errores de JavaScript', errores.length === 0, errores.join(' / '));
  const f = fin();
  await b.close();
  process.exit(f ? 1 : 0);
})();
