// Ambientes por enlace (fase 2): audio en internet (MP3/OGG…) en la mezcla y YouTube largo en su reproductor visible.
// Modo local (preview 4173). Los audios «de internet» los sirve la propia prueba (no sale a la red).
const { chromium } = require('playwright');
const { SPOTIFY, YOUTUBE } = require('./falsos.cjs');
const { wav, crearElemento, comprobador, CAPTURAS } = require('./ayuda.cjs');
const URL = 'http://localhost:4173/';
const WEB = 'https://sonidos.dfy.test/';
const { comprobar, fin } = comprobador();
const cerca = (a, b) => Math.abs(a - b) < 0.011;

// ── «Internet» simulado ──
const audios = { 'lluvia-larga.wav': wav(6), 'taberna.wav': wav(20), 'puerta.wav': wav(1), 'gota.wav': wav(1), 'mar.wav': wav(7), 'cambia.wav': wav(5) };
const bloqueados = new Set(); // el servidor deja de permitirlo (403)
const pedidos = [];
async function internet(r) {
  const nombre = decodeURIComponent(new globalThis.URL(r.request().url()).pathname.slice(1));
  pedidos.push(nombre);
  if (bloqueados.has(nombre)) return r.fulfill({ status: 403, body: 'Prohibido' });
  if (nombre === 'texto.wav') return r.fulfill({ status: 200, contentType: 'text/html', body: '<html>no soy audio</html>' });
  const a = audios[nombre];
  return a ? r.fulfill({ status: 200, body: a, headers: { 'content-type': 'audio/wav', 'accept-ranges': 'none', 'cache-control': 'no-store' } }) : r.fulfill({ status: 404, body: 'No existe' });
}

(async () => {
  const b = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const ctx = await b.newContext({ viewport: { width: 1280, height: 860 } });
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: URL });
  await ctx.route('https://open.spotify.com/embed/iframe-api/v1', (r) => r.fulfill({ contentType: 'text/javascript', body: SPOTIFY }));
  await ctx.route('https://www.youtube.com/iframe_api', (r) => r.fulfill({ contentType: 'text/javascript', body: YOUTUBE }));
  await ctx.route(/oembed/, (r) => r.fulfill({ json: {} }));
  await ctx.route(WEB + '**', internet);
  const p = await ctx.newPage();
  const errores = [];
  p.on('pageerror', (e) => errores.push(String(e)));
  await p.goto(URL);
  await p.evaluate(() => { localStorage.clear(); indexedDB.deleteDatabase('banda-sonora'); localStorage.setItem('banda-sonora:mezcla', JSON.stringify({ transicion: 'instantaneo', entrada: 0, salida: 0 })); }); // fundidos: ver fundidos.cjs
  await p.reload();

  const estado = () =>
    p.evaluate(() => {
      const e = window.__mezclaEstado();
      const d = window.__mezclaDFY ? window.__mezclaDFY.diagnostico() : [];
      const a = window.__audioBandaSonora;
      return {
        amb: e.ambientes.map((c) => ({ nombre: c.nombre, estado: c.estado, aviso: c.aviso, ...(d.find((x) => x.id === c.id) || {}) })),
        ef: e.efectos.map((v) => ({ nombre: v.nombre, estado: v.estado })),
        voces: d,
        aviso: e.aviso,
        principal: a ? { pausado: a.paused, src: a.src, volumen: a.volume } : null,
      };
    });
  const biblioteca = () => p.evaluate(() => JSON.parse(localStorage.getItem('banda-sonora:biblioteca') || '{"recursos":[]}'));
  const ambiente = (n) => p.getByRole('button', { name: new RegExp(`^(Activar|Detener) ambiente ${n}$`) });
  const btn = (n) => p.getByRole('button', { name: n, exact: true });
  const esperarAmb = (n) =>
    p.waitForFunction((x) => window.__mezclaEstado().ambientes.some((c) => c.nombre === x && c.estado === 'sonando'), n, { timeout: 8000 });
  const avisoBarra = async () => ((await p.locator('.reproductor-aviso[data-mezcla]').count()) ? p.locator('.reproductor-aviso[data-mezcla]').innerText() : '');

  // ══ Enlaces válidos: copiar enlace → añadir → reproducir ══
  await crearElemento(p, { tipo: 'ambiente', nombre: 'Lluvia web', sonidos: [{ enlace: WEB + 'lluvia-larga.wav' }] });
  let bib = await biblioteca();
  const rLluvia = bib.recursos.find((r) => r.enlace === WEB + 'lluvia-larga.wav');
  comprobar('Enlace de audio: se guarda como sonido «url», sin archivo subido', rLluvia?.origen === 'url' && rLluvia.archivo_ruta === null && rLluvia.titulo === 'lluvia-larga', JSON.stringify(rLluvia));
  comprobar('…con la duración leída del propio enlace (sin descargarlo para guardarlo)', Math.abs((rLluvia?.duracion_ms ?? 0) - 6000) < 100, String(rLluvia?.duracion_ms));
  comprobar('…y sin ocupar espacio en el navegador ni en Supabase', (await p.evaluate(() => new Promise((ok) => { const r = indexedDB.open('banda-sonora', 1); r.onsuccess = () => { try { const t = r.result.transaction('archivos').objectStore('archivos').count(); t.onsuccess = () => ok(t.result) } catch { ok(0) } }; r.onerror = () => ok(0) }))) === 0);
  await crearElemento(p, { tipo: 'lugar', nombre: 'Taberna web', sonidos: [{ enlace: WEB + 'taberna.wav' }] });
  await crearElemento(p, { tipo: 'efecto', nombre: 'Puerta web', sonidos: [{ enlace: WEB + 'puerta.wav' }] });
  await crearElemento(p, { tipo: 'ambiente', nombre: 'Gota', sonidos: [{ enlace: WEB + 'gota.wav' }] });
  await crearElemento(p, { tipo: 'ambiente', nombre: 'Cambia', sonidos: [{ enlace: WEB + 'cambia.wav' }] });
  await crearElemento(p, { tipo: 'ambiente', nombre: 'Bosque', sonidos: [{ enlace: 'https://youtu.be/dQw4w9WgXcQ' }] });

  // ══ Compatibilidad con la mezcla: música + ambiente + efecto, todo por enlace ══
  await p.getByRole('button', { name: 'Reproducir Taberna web', exact: true }).click();
  await p.waitForFunction(() => window.__audioBandaSonora && !window.__audioBandaSonora.paused, null, { timeout: 8000 });
  await ambiente('Lluvia web').click();
  await esperarAmb('Lluvia web');
  await p.getByRole('button', { name: 'Lanzar efecto Puerta web' }).click();
  await p.waitForFunction(() => window.__mezclaEstado().efectos.some((v) => v.estado === 'sonando'), null, { timeout: 8000 });
  let s = await estado();
  comprobar('Mezcla: música, ambiente y efecto por enlace suenan a la vez', !s.principal.pausado && s.principal.src === WEB + 'taberna.wav' && s.amb[0].src === WEB + 'lluvia-larga.wav' && !s.amb[0].pausado && s.ef.length === 1);
  comprobar('El ambiente por enlace va en bucle por defecto', s.amb[0].bucle === true);
  comprobar('La barra lo describe como enlace de audio', (await p.locator('.reproductor-estado').innerText()).includes('enlace de audio'));

  // Volumen y bucle
  await p.locator('.boton-mezcla').click();
  await p.getByLabel('Volumen de Lluvia web').fill('35');
  await p.waitForTimeout(100);
  s = await estado();
  comprobar('Volumen propio del ambiente por enlace (no toca la música)', cerca(s.amb[0].volumen, 0.35) && cerca(s.principal.volumen, 0.7), `${s.amb[0].volumen} ${s.principal.volumen}`);
  await btn('Silenciar Lluvia web').click();
  await p.waitForTimeout(100);
  comprobar('Silencio del canal por enlace', (await estado()).amb[0].silenciado === true);
  await btn('Activar el sonido de Lluvia web').click();
  await ambiente('Gota').click(); // 1 s de audio: si no hiciera bucle, a los 2,5 s ya habría terminado
  await esperarAmb('Gota');
  await p.waitForTimeout(2500);
  s = await estado();
  const gota = s.amb.find((c) => c.nombre === 'Gota');
  comprobar('Bucle: un audio corto por enlace sigue sonando al terminar', gota?.estado === 'sonando' && gota.pausado === false && gota.t < 1.05, JSON.stringify(gota));
  await btn('Repetir Gota').click();
  await p.waitForFunction(() => !window.__mezclaEstado().ambientes.some((c) => c.nombre === 'Gota'), null, { timeout: 4000 }).catch(() => {});
  comprobar('Sin bucle, al terminar deja libre su canal', !(await estado()).amb.some((c) => c.nombre === 'Gota'));

  // ══ Errores de reproducción: el servidor deja de permitirlo ══
  bloqueados.add('cambia.wav');
  await ambiente('Cambia').click();
  await p.waitForFunction(() => window.__mezclaEstado().ambientes.some((c) => c.nombre === 'Cambia' && c.estado === 'error'), null, { timeout: 8000 }).catch(() => {});
  s = await estado();
  const cambia = s.amb.find((c) => c.nombre === 'Cambia');
  comprobar('Enlace que ya no funciona: el canal queda en error y lo explica', cambia?.estado === 'error' && /su web no permite|ya no existe/.test(cambia.aviso), JSON.stringify(cambia));
  comprobar('…sin dejar audio oculto y sin parar lo demás', cambia.pausado !== false && s.amb.find((c) => c.nombre === 'Lluvia web')?.pausado === false && !s.principal.pausado);
  await btn('Detener Cambia').click();
  bloqueados.delete('cambia.wav');

  // ══ YouTube largo como ambiente: reproductor oficial visible, sin superponer capas ══
  await p.getByRole('button', { name: 'Reproducir Bosque', exact: true }).click();
  await p.waitForFunction(() => (window.__log || []).some((l) => l.startsWith('yt:play')), null, { timeout: 8000 });
  await p.waitForTimeout(300);
  s = await estado();
  comprobar('YouTube en Ambientes suena en el reproductor principal', (await p.locator('.reproductor-titulo').innerText()) === 'Bosque' && (await p.locator('.reproductor-estado').innerText()).startsWith('Sonando'));
  comprobar('…y aparta las capas locales (no se mezclan con YouTube)', s.amb.length === 0 && s.voces.filter((v) => !v.pausado).length === 0 && !!s.principal?.pausado && (await avisoBarra()).includes('YouTube no se mezcla'));
  comprobar('…en bucle por defecto (carpeta Ambientes)', (await btn('Repetir').getAttribute('aria-pressed')) === 'true');
  const caja = await p.locator('.marco-youtube').boundingBox();
  comprobar('El reproductor de YouTube está visible y mide al menos 200 × 200', !!caja && caja.width >= 200 && caja.height >= 200 && (await p.locator('.marco-youtube').isVisible()), JSON.stringify(caja));
  let n = await p.evaluate(() => window.__log.length);
  await p.evaluate(() => window.__yt._terminar());
  await p.waitForTimeout(300);
  comprobar('Al terminar el vídeo, vuelve a empezar (bucle con la API oficial)', (await p.evaluate(() => window.__log)).slice(n).some((l) => l.startsWith('yt:load dQw4w9WgXcQ')));
  n = await p.evaluate(() => window.__log.length);
  await p.locator('#volumen').fill('40');
  await p.waitForTimeout(150);
  comprobar('Volumen de YouTube con su API oficial (setVolume)', (await p.evaluate(() => window.__log)).slice(n).includes('yt:volumen 40'));
  n = await p.evaluate(() => window.__log.length);
  await ambiente('Lluvia web').click();
  await p.getByRole('button', { name: 'Lanzar efecto Puerta web' }).click();
  await p.waitForTimeout(400);
  s = await estado();
  const log = (await p.evaluate(() => window.__log)).slice(n);
  comprobar('Con YouTube sonando, ambientes y efectos no se superponen ni lo cortan', s.amb.length === 0 && s.ef.length === 0 && !log.includes('yt:stop') && !log.includes('yt:pause') && (await avisoBarra()).includes('archivo propio'), log.join(' / '));
  if (!(await p.locator('#mezclador').count())) await p.locator('.boton-mezcla').click();
  const panel = await p.locator('#mezclador').boundingBox();
  const yt = await p.locator('.marco-youtube').boundingBox();
  const solapa = panel && yt && !(panel.x + panel.width <= yt.x || yt.x + yt.width <= panel.x || panel.y + panel.height <= yt.y || yt.y + yt.height <= panel.y);
  comprobar('El panel de mezcla no tapa el reproductor de YouTube', !solapa, JSON.stringify({ panel, yt }));
  await p.screenshot({ path: CAPTURAS + 'enlaces-youtube.png' });
  await btn('Detener todo').click();
  await p.keyboard.press('Escape');

  // ══ Enlaces inválidos y errores al añadir ══
  await p.getByRole('button', { name: /^Añadir lugar/ }).first().click();
  await p.waitForSelector('dialog[open] #ed-nombre');
  await p.fill('#ed-nombre', 'Pruebas');
  await btn('Enlace').click();
  const ayuda = () => p.locator('#nuevo-enlace-ayuda').innerText();
  await p.fill('#nuevo-enlace', 'http://sonidos.dfy.test/lluvia-larga.wav');
  comprobar('Inválido: audio sin https', (await ayuda()).includes('https://') && (await btn('Añadir enlace').isDisabled()));
  await p.fill('#nuevo-enlace', 'https://sonidos.dfy.test/notas.txt');
  comprobar('Inválido: no es un audio ni un servicio conocido', (await ayuda()).startsWith('Solo se admiten') && (await btn('Añadir enlace').isDisabled()));
  await p.fill('#nuevo-enlace', WEB + 'lluvia-larga.wav');
  comprobar('Válido: se reconoce el formato', (await ayuda()).includes('audio WAV en internet'));
  const filas = () => p.locator('.fila-pista').count();
  await p.fill('#nuevo-enlace', WEB + 'no-existe.wav');
  await btn('Añadir enlace').click();
  await p.waitForFunction(() => /No se puede usar|No se ha podido abrir/.test(document.querySelector('.anadir-pista [role=status]')?.textContent || ''), null, { timeout: 8000 }).catch(() => {});
  comprobar('Enlace que no existe (404): se explica y no se añade', (await filas()) === 0 && /No se puede usar|No se ha podido abrir/.test(await p.locator('.anadir-pista [role=status]').innerText()));
  await p.fill('#nuevo-enlace', WEB + 'texto.wav');
  await btn('Añadir enlace').click();
  await p.waitForTimeout(1500);
  comprobar('Enlace que no es audio (una página web): no se añade', (await filas()) === 0 && /No se puede usar|No se ha podido abrir/.test(await p.locator('.anadir-pista [role=status]').innerText()));
  bloqueados.add('mar.wav');
  await p.fill('#nuevo-enlace', WEB + 'mar.wav');
  await btn('Añadir enlace').click();
  await p.waitForTimeout(1500);
  comprobar('Servidor que no lo permite (403): no se añade', (await filas()) === 0);
  bloqueados.delete('mar.wav');
  await btn('Cancelar').click();
  await p.waitForSelector('dialog[open]', { state: 'detached' }).catch(() => {});

  // ══ Flujo rápido: «Pegar enlace» → Guardar y reproducir ══
  await p.evaluate((u) => navigator.clipboard.writeText(u), WEB + 'mar.wav');
  await btn('Pegar enlace').click();
  await p.waitForSelector('dialog[open] #co-enlace');
  comprobar('Pegar enlace: abre la ventana con el enlace del portapapeles', (await p.locator('#compartido-titulo').innerText()) === 'Añadir sonido desde un enlace' && (await p.locator('#co-enlace').inputValue()) === WEB + 'mar.wav');
  comprobar('…y propone el nombre del archivo como título', (await p.locator('#co-titulo').inputValue()) === 'mar');
  await p.locator('label.chip-carpeta', { hasText: 'Ambiente' }).click();
  await p.fill('#co-nombre', 'Mar');
  await btn('Guardar y reproducir').click();
  await p.waitForSelector('dialog[open]', { state: 'detached', timeout: 10000 });
  await esperarAmb('Mar');
  comprobar('Guardar y reproducir: el ambiente queda guardado y sonando en la mezcla', (await estado()).amb.some((c) => c.nombre === 'Mar' && c.src === WEB + 'mar.wav'));
  await ambiente('Mar').click(); // pulsar otra vez lo detiene
  await p.evaluate(() => navigator.clipboard.writeText('esto no es un enlace'));
  await btn('Pegar enlace').click();
  await p.waitForSelector('dialog[open] #co-enlace');
  comprobar('Pegar algo que no es un enlace: ventana vacía con el cursor en el enlace', (await p.locator('#co-enlace').inputValue()) === '' && (await p.evaluate(() => document.activeElement?.id)) === 'co-enlace');
  await p.fill('#co-enlace', WEB + 'no-existe.wav');
  await p.fill('#co-nombre', 'Nada');
  await btn('Guardar').click();
  await p.waitForSelector('dialog[open] .aviso[role=alert]', { timeout: 8000 }).catch(() => {});
  comprobar('…y si el enlace no funciona, avisa y no guarda nada', (await p.locator('dialog[open] .aviso[role=alert]').count()) === 1 && !(await biblioteca()).elementos.some((e) => e.nombre === 'Nada'));
  await btn('Cancelar').click();

  // ══ Copias y recarga ══
  const recursosAntes = (await biblioteca()).recursos.length;
  const copia = await p.evaluate(() => localStorage.getItem('banda-sonora:biblioteca'));
  await btn('Copias').click();
  await p.getByLabel('Pega aquí el texto de una copia').fill(copia);
  await btn('Comprobar texto').click();
  await btn('Añadir').click();
  await p.waitForTimeout(600);
  comprobar('Copias: los enlaces de audio se exportan e importan sin duplicarse', (await biblioteca()).recursos.length === recursosAntes && (await biblioteca()).recursos.some((r) => r.origen === 'url'));
  await btn('Cerrar').click();
  await p.reload();
  await p.waitForSelector('.tarjeta');
  await p.waitForTimeout(500);
  s = await estado();
  comprobar('Al recargar no suena nada solo', s.voces.length === 0 && (!s.principal || s.principal.pausado));

  comprobar('Sin errores de JavaScript', errores.length === 0, errores.join(' / '));
  const f = fin();
  await b.close();
  process.exit(f ? 1 : 0);
})();
