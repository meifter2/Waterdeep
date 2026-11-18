// Fase 2B: fundidos de ambientes, crossfade entre músicas propias, preajustes y casos límite (modo local, 4173).
// El cierre de sesión durante un cruce se prueba en mezclador-supabase.cjs (necesita cuentas).
const { chromium } = require('playwright');
const { wav, crearElemento, comprobador, CAPTURAS } = require('./ayuda.cjs');
const URL = 'http://localhost:4173/';
const WEB = 'https://sonidos.dfy.test/';
const { comprobar, fin } = comprobador();
const cerca = (a, b, m = 0.03) => Math.abs(a - b) <= m;
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

const enlaces = { 'mercado.wav': wav(21), 'puerto.wav': wav(22), 'rota.wav': wav(5) };
const rotos = new Set();

(async () => {
  const b = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.route(/oembed/, (r) => r.fulfill({ json: {} }));
  await ctx.route(WEB + '**', (r) => {
    const n = r.request().url().slice(WEB.length);
    return rotos.has(n) || !enlaces[n]
      ? r.fulfill({ status: 404, body: 'no' })
      : r.fulfill({ status: 200, body: enlaces[n], headers: { 'content-type': 'audio/wav', 'accept-ranges': 'none', 'cache-control': 'no-store' } });
  });
  const p = await ctx.newPage();
  const errores = [];
  p.on('pageerror', (e) => errores.push(String(e)));
  await p.goto(URL);
  await p.evaluate(() => { localStorage.clear(); indexedDB.deleteDatabase('banda-sonora'); });
  await p.reload();

  const archivo = (n, s) => ({ archivo: { name: n + '.wav', mimeType: 'audio/wav', buffer: wav(s) } });
  await crearElemento(p, { tipo: 'lugar', nombre: 'Taberna', sonidos: [archivo('taberna', 20)] });
  await crearElemento(p, { tipo: 'lugar', nombre: 'Mercado', sonidos: [{ enlace: WEB + 'mercado.wav' }] }); // enlace directo
  await crearElemento(p, { tipo: 'lugar', nombre: 'Puerto', sonidos: [{ enlace: WEB + 'puerto.wav' }] });
  await crearElemento(p, { tipo: 'lugar', nombre: 'Rota', sonidos: [{ enlace: WEB + 'rota.wav' }] });
  await crearElemento(p, { tipo: 'ambiente', nombre: 'Lluvia', sonidos: [archivo('lluvia', 6)] });
  await crearElemento(p, { tipo: 'ambiente', nombre: 'Viento', sonidos: [archivo('viento', 7)] });
  await crearElemento(p, { tipo: 'ambiente', nombre: 'Gota', sonidos: [archivo('gota', 1)] });
  await crearElemento(p, { tipo: 'efecto', nombre: 'Puerta', sonidos: [archivo('puerta', 1)] });
  rotos.add('rota.wav'); // a partir de ahora, ese enlace deja de funcionar

  const btn = (x) => p.getByRole('button', { name: x, exact: true });
  // El panel de mezcla no es modal y puede tapar tarjetas: se cierra para pulsarlas y se abre para usar sus controles.
  const cerrarPanel = async () => { if ((await p.locator('#mezclador').count()) > 0) await btn('Cerrar la mezcla').click(); };
  const tarjeta = (loc) => ({ click: async () => { await cerrarPanel(); await loc().click(); }, getAttribute: (a) => loc().getAttribute(a) });
  const ambiente = (n) => tarjeta(() => p.getByRole('button', { name: new RegExp(`^(Activar|Detener) ambiente ${n}$`) }));
  const musica = (n) => tarjeta(() => p.getByRole('button', { name: `Reproducir ${n}`, exact: true }));
  const enPanel = (x) => ({ click: async () => { await abrirPanel(); await btn(x).click(); }, getAttribute: async (a) => { await abrirPanel(); return btn(x).getAttribute(a); } });
  const voces = () => p.evaluate(() => (window.__mezclaDFY ? window.__mezclaDFY.diagnostico() : []));
  const mus = () => p.evaluate(() => window.__musicaDFY.diagnostico());
  const suenaMusica = async () => (await mus()).filter((m) => !m.pausado && m.src);
  const amb = async (n) => {
    const e = await p.evaluate(() => window.__mezclaEstado());
    const c = e.ambientes.find((x) => x.nombre === n);
    const v = c ? (await voces()).find((x) => x.id === c.id) : undefined;
    return v && { ...v, objetivo: c.volumen / 100 }; // objetivo: volumen del canal (el maestro está al 100 %)
  };
  const panelAbierto = async () => (await p.locator('#mezclador').count()) > 0;
  const abrirPanel = async () => { if (!(await panelAbierto())) await p.locator('.boton-mezcla').click(); };
  const segundos = async (entrada, salida) => {
    await abrirPanel();
    if (!(await p.locator('.transiciones-ajuste').evaluate((d) => d.open))) await p.locator('.transiciones-ajuste summary').click();
    await p.getByLabel('Entrada (aparece)').fill(String(entrada));
    await p.getByLabel('Salida (se apaga)').fill(String(salida));
  };

  // ══ Preajustes y preferencias ══
  await abrirPanel();
  comprobar('Por defecto: «Suave» (entrada y salida de 3 s)', (await enPanel('Suave').getAttribute('aria-pressed')) === 'true' && (await p.locator('.transiciones-ajuste summary').innerText()).includes('entrada 3 s, salida 3 s'));
  await enPanel('Cinematográfico').click();
  await p.reload();
  await p.waitForSelector('.tarjeta');
  await abrirPanel();
  comprobar('El preajuste se guarda al recargar (Cinematográfico: 6 s y 8 s)', (await enPanel('Cinematográfico').getAttribute('aria-pressed')) === 'true' && (await p.locator('.transiciones-ajuste summary').innerText()).includes('entrada 6 s, salida 8 s'));
  await segundos(1.5, 1.5);
  comprobar('Ajustar segundos a mano lo convierte en «Personalizado»', (await p.locator('.transiciones-ajuste summary').innerText()).startsWith('Personalizado: entrada 1,5 s, salida 1,5 s') && (await p.locator('.transiciones-opciones [aria-pressed="true"]').count()) === 0);
  await p.reload();
  await p.waitForSelector('.tarjeta');
  await abrirPanel();
  comprobar('…y también se recuerda al recargar', (await p.locator('.transiciones-ajuste summary').innerText()).startsWith('Personalizado: entrada 1,5 s, salida 1,5 s'));
  const pref = await p.evaluate(() => JSON.parse(localStorage.getItem('banda-sonora:mezcla')));
  comprobar('Se guarda en la clave de la mezcla del navegador', pref.entrada === 1.5 && pref.salida === 1.5 && pref.transicion === 'personalizado');

  // ══ Fundidos de ambientes ══
  await ambiente('Lluvia').click();
  await p.waitForFunction(() => window.__mezclaEstado().ambientes.some((c) => c.estado === 'sonando'), null, { timeout: 5000 });
  await esperar(250);
  let v = await amb('Lluvia');
  comprobar('Ambiente: entra con fundido (empieza bajo)', v && !v.pausado && v.volumen > 0 && v.volumen < 0.6 * 0.75, v && v.volumen.toFixed(3));
  await esperar(1600);
  v = await amb('Lluvia');
  comprobar('…y llega a su volumen (60 %)', cerca(v.volumen, 0.6), v.volumen.toFixed(3));

  // Volumen durante el fundido
  await ambiente('Viento').click();
  await p.waitForFunction(() => window.__mezclaEstado().ambientes.some((c) => c.nombre === 'Viento'), null, { timeout: 5000 });
  await abrirPanel();
  await p.getByLabel('Volumen de Viento').fill('30');
  await esperar(1900);
  v = await amb('Viento');
  comprobar('Cambiar el volumen durante el fundido: acaba en el volumen nuevo (30 %)', cerca(v.volumen, 0.3), v.volumen.toFixed(3));

  // Silenciar y reactivar durante un fundido
  await ambiente('Viento').click(); // se apaga con fundido
  await esperar(200);
  await ambiente('Viento').click(); // …y se recupera
  await enPanel('Silenciar la mezcla').click();
  let vs = await voces();
  comprobar('Silenciar la mezcla durante un fundido: todo en silencio (también lo que se apaga)', vs.every((x) => x.silenciado));
  await enPanel('Activar el sonido de la mezcla').click();
  await esperar(1800);
  v = await amb('Viento');
  comprobar('…y al reactivar, cada canal vuelve a su volumen', !v.silenciado && cerca(v.volumen, 0.3), v.volumen.toFixed(3));

  // Salida con fundido
  await ambiente('Lluvia').click();
  await esperar(300);
  vs = await voces();
  const saliendo = vs.filter((x) => x.capa === 'saliendo');
  comprobar('Ambiente: al detenerlo, la tarjeta se desmarca al momento y el sonido baja con fundido', (await ambiente('Lluvia').getAttribute('aria-pressed')) === 'false' && saliendo.length === 1 && !saliendo[0].pausado && saliendo[0].volumen < 0.6 && saliendo[0].volumen > 0, JSON.stringify(saliendo));
  await esperar(1600);
  comprobar('…y al terminar se suelta (no queda audio)', (await voces()).filter((x) => x.capa === 'saliendo').length === 0);

  // Pulsar varias veces durante un fundido
  await ambiente('Lluvia').click();
  await esperar(1700);
  await ambiente('Lluvia').click(); // empieza a apagarse
  await esperar(400);
  await ambiente('Lluvia').click(); // se recupera el mismo audio
  await esperar(100);
  vs = await voces();
  const deLluvia = vs.filter((x) => x.src && x.src === vs.find((y) => y.capa === 'ambiente' && y.id && y.bucle !== undefined && y.src.includes('blob:'))?.src);
  comprobar('Pulsaciones durante el fundido: se recupera el mismo audio, sin duplicarlo', vs.filter((x) => x.capa === 'saliendo').length === 0 && vs.filter((x) => x.capa === 'ambiente').length === 2 && deLluvia.length <= 1);
  await esperar(1700);
  v = await amb('Lluvia');
  comprobar('…y vuelve a su volumen', cerca(v.volumen, v.objetivo), `${v.volumen.toFixed(3)} / ${v.objetivo}`);

  // Bucle con fundidos
  await ambiente('Viento').click();
  await ambiente('Gota').click(); // 1 s de audio en bucle
  await esperar(3000);
  v = await amb('Gota');
  comprobar('Ambiente corto en bucle: sigue sonando tras varias vueltas', v && !v.pausado && cerca(v.volumen, v.objetivo), v && `${v.t.toFixed(2)} ${v.volumen.toFixed(2)}`);
  await ambiente('Gota').click();
  await esperar(1700);

  // ══ Crossfade entre músicas propias ══
  await musica('Taberna').click();
  await esperar(1900);
  let m = await suenaMusica();
  comprobar('Música: entra con fundido y queda a su volumen', m.length === 1 && cerca(m[0].volumen, 0.7), JSON.stringify(m));
  await musica('Mercado').click(); // enlace directo de audio
  await esperar(650);
  m = await mus();
  const sale = m.find((x) => x.rol === 'saliente');
  const manda = m.find((x) => x.rol === 'actual');
  comprobar('Crossfade: durante el cambio suenan las dos, la anterior bajando y la nueva subiendo', sale && manda && !sale.pausado && !manda.pausado && sale.volumen < 0.7 && manda.volumen > 0 && manda.src === WEB + 'mercado.wav', JSON.stringify(m));
  comprobar('…y el ambiente sigue sonando durante el cambio', !(await amb('Lluvia')).pausado);
  await esperar(1500);
  m = await mus();
  comprobar('…al terminar, la anterior se suelta y solo queda la nueva', m.filter((x) => !x.pausado && x.src).length === 1 && m.find((x) => x.rol === 'actual').src === WEB + 'mercado.wav' && m.filter((x) => x.src).length === 1, JSON.stringify(m));
  comprobar('La barra dice que suena la nueva', (await p.locator('.reproductor-titulo').innerText()) === 'Mercado' && (await p.locator('.reproductor-estado').innerText()).startsWith('Sonando'));

  // Cambios muy rápidos entre tres canciones
  await musica('Taberna').click();
  await esperar(120);
  await musica('Puerto').click();
  await esperar(120);
  await musica('Mercado').click();
  await esperar(80);
  await musica('Puerto').click();
  let maxSonando = 0;
  for (let i = 0; i < 12; i++) {
    maxSonando = Math.max(maxSonando, (await suenaMusica()).length);
    await esperar(200);
  }
  m = await suenaMusica();
  comprobar('Cambios muy rápidos: nunca más de dos músicas a la vez', maxSonando <= 2, String(maxSonando));
  comprobar('…y al final solo suena la última (sin sonidos fantasma)', m.length === 1 && m[0].src === WEB + 'puerto.wav' && (await p.locator('.reproductor-titulo').innerText()) === 'Puerto', JSON.stringify(m));
  await esperar(1500);
  comprobar('…ni después', (await suenaMusica()).length === 1);

  // Detener todo durante un cruce: instantáneo
  await musica('Taberna').click();
  await esperar(500);
  await enPanel('Detener todo').click();
  await esperar(100);
  m = await suenaMusica();
  vs = await voces();
  comprobar('Detener todo en mitad de un cruce: silencio inmediato (música, ambientes y lo que se apagaba)', m.length === 0 && vs.filter((x) => !x.pausado).length === 0 && vs.length === 0, JSON.stringify({ m, vs }));

  // La nueva canción falla al cargar: la anterior sigue
  await musica('Taberna').click();
  await esperar(1800);
  await musica('Rota').click();
  await p.waitForFunction(() => /No se puede|No se ha podido/.test(document.querySelector('.reproductor-estado')?.textContent || ''), null, { timeout: 6000 }).catch(() => {});
  await esperar(300);
  m = await suenaMusica();
  comprobar('Si la nueva no carga, la anterior sigue sonando (sin cortes innecesarios)', m.length === 1 && m[0].src.startsWith('blob:') && cerca(m[0].volumen, 0.7) && (await p.locator('.reproductor-estado').innerText()).startsWith('No se puede'), JSON.stringify(m));
  await btn('Detener').click();
  await esperar(100);
  comprobar('…y ■ la detiene', (await suenaMusica()).length === 0);

  // Borrar la pista nueva en mitad del cruce
  await segundos(1.5, 8);
  await musica('Taberna').click();
  await esperar(1800);
  await musica('Puerto').click();
  await esperar(600);
  await p.keyboard.press('Escape');
  await btn('Sonidos').click();
  await p.locator('.biblioteca-lista li', { hasText: 'puerto' }).getByRole('button', { name: 'Borrar' }).click();
  await p.getByRole('button', { name: 'Borrar definitivamente' }).click();
  await esperar(300);
  comprobar('Borrar la canción que entra en mitad del cruce: nada queda sonando ni a medias', (await suenaMusica()).length === 0, JSON.stringify(await mus()));
  await btn('Cerrar').click();
  await segundos(1.5, 1.5);

  // Efectos: siempre al instante
  await enPanel('Cinematográfico').click();
  await p.getByRole('button', { name: 'Lanzar efecto Puerta' }).click();
  await p.waitForFunction(() => window.__mezclaEstado().efectos.some((x) => x.estado === 'sonando'), null, { timeout: 5000 });
  const ef = (await voces()).find((x) => x.capa === 'efecto' && x.id);
  comprobar('Efectos: suenan al instante a su volumen, sin fundido (aunque esté en Cinematográfico)', ef && cerca(ef.volumen, 0.8) && ef.nivel === 1, JSON.stringify(ef));

  // Instantáneo: sin transición
  await enPanel('Instantáneo').click();
  await musica('Taberna').click();
  await p.waitForFunction(() => window.__audioBandaSonora && !window.__audioBandaSonora.paused, null, { timeout: 5000 });
  await esperar(150);
  m = await suenaMusica();
  comprobar('Instantáneo: la música empieza a su volumen', m.length === 1 && cerca(m[0].volumen, 0.7));
  await musica('Mercado').click();
  await p.waitForFunction((u) => window.__audioBandaSonora.src === u && !window.__audioBandaSonora.paused, WEB + 'mercado.wav', { timeout: 5000 });
  await esperar(150);
  m = await suenaMusica();
  comprobar('Instantáneo: el cambio de música es directo (una sola suena)', m.length === 1 && m[0].src === WEB + 'mercado.wav' && cerca(m[0].volumen, 0.7), JSON.stringify(m));
  await ambiente('Viento').click();
  await p.waitForFunction(() => window.__mezclaEstado().ambientes.some((c) => c.nombre === 'Viento' && c.estado === 'sonando'), null, { timeout: 5000 });
  comprobar('Instantáneo: el ambiente entra a su volumen', cerca((await amb('Viento')).volumen, 0.3));
  await enPanel('Detener todo').click();

  // ══ Móvil ══
  await enPanel('Suave').click();
  await p.setViewportSize({ width: 390, height: 844 });
  await esperar(300);
  await p.screenshot({ path: CAPTURAS + 'fundidos-movil.png' });
  const med = await p.evaluate(() => ({
    ancho: document.documentElement.scrollWidth,
    botones: [...document.querySelectorAll('.transiciones-opciones button')].map((x) => Math.round(x.getBoundingClientRect().height)),
    fila: document.querySelector('.transiciones-opciones').getBoundingClientRect().right,
  }));
  comprobar('Móvil: los preajustes caben y se pulsan con el dedo (≥ 44 px)', med.ancho <= 390 && med.fila <= 390 && med.botones.every((h) => h >= 44), JSON.stringify(med));

  comprobar('Sin errores de JavaScript', errores.length === 0, errores.join(' / '));
  const f = fin();
  await b.close();
  process.exit(f ? 1 : 0);
})();
