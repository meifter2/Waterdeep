// Reordenar tarjetas (arrastrar y soltar, dedo y teclado). Supabase simulado (4174) + modo local (4173).
const { chromium } = require('playwright');
const { wav, crearElemento, comprobador } = require('./ayuda.cjs');
const URL_APP = 'http://localhost:4174/';
const SB = 'https://prueba.supabase.co';
const WEB = 'https://sonidos.dfy.test/';
const { comprobar, fin } = comprobador();

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const exp = Math.floor(Date.now() / 1000) + 3600;
const UID = '11111111-1111-1111-1111-111111111111';
const usuario = { id: UID, aud: 'authenticated', role: 'authenticated', email: 'dm@example.com', user_metadata: {}, app_metadata: { provider: 'email' } };
const JWT = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: UID, exp, role: 'authenticated', aud: 'authenticated' })}.firma`;
const sesion = JSON.stringify({ access_token: JWT, token_type: 'bearer', expires_in: 3600, expires_at: exp, refresh_token: 'r', user: usuario });

// ── Supabase simulado con datos ya guardados ──
const tablas = { elementos: [], recursos: [], pistas: [], sesiones: [], sesion_elementos: [], elementos_comunes: [], carpetas: [], carpeta_elementos: [] };
let n = 0;
const crear = (tipo, nombre) => {
  const id = `x${++n}`;
  tablas.elementos.push({ id: 'el-' + id, tipo, nombre, descripcion: '', retrato_ruta: null, orden: 0 });
  tablas.recursos.push({ id: 're-' + id, origen: 'url', titulo: nombre, descripcion: '', enlace: WEB + nombre.toLowerCase() + '.wav', archivo_ruta: null, archivo_nombre: '', archivo_tipo: '', archivo_bytes: null, archivo_hash: null, duracion_ms: null });
  tablas.pistas.push({ id: 'pi-' + id, elemento_id: 'el-' + id, recurso_id: 're-' + id, etiqueta: '', inicio_ms: null, fin_ms: null, bucle: true, orden: 0 });
};
['Gamma', 'Alfa', 'Delta', 'Beta'].forEach((x) => crear('lugar', x));
['Lluvia', 'Viento'].forEach((x) => crear('ambiente', x));
const parches = [];
let fallarParche = false;
async function supabase(r) {
  const req = r.request();
  const u = new URL(req.url());
  const t = u.pathname.match(/^\/rest\/v1\/(\w+)/)?.[1];
  const id = u.searchParams.get('id')?.replace('eq.', '');
  if (t && req.method() === 'GET') return r.fulfill({ json: tablas[t] });
  if (t && req.method() === 'POST') {
    const fila = { id: `${t}-${++n}`, ...JSON.parse(req.postData()) };
    tablas[t].push(fila);
    return r.fulfill({ status: 201, json: fila });
  }
  if (t && req.method() === 'PATCH') {
    if (fallarParche && t === 'elementos') return r.fulfill({ status: 500, json: { message: 'fallo simulado' } });
    const cambio = JSON.parse(req.postData());
    parches.push({ t, id, ...cambio });
    tablas[t] = tablas[t].map((f) => (f.id === id ? { ...f, ...cambio } : f));
    return r.fulfill({ status: 204, body: '' });
  }
  if (u.pathname.startsWith('/auth/v1/')) return r.fulfill(u.pathname.includes('/user') ? { json: usuario } : { status: 204, body: '' });
  return r.fulfill({ status: 404, body: '' });
}

(async () => {
  const b = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.route(SB + '/**', supabase);
  await ctx.route(/oembed/, (r) => r.fulfill({ json: {} }));
  await ctx.route(WEB + '**', (r) => r.fulfill({ status: 200, body: wav(30), headers: { 'content-type': 'audio/wav', 'accept-ranges': 'none' } }));
  const p = await ctx.newPage();
  const errores = [];
  p.on('pageerror', (e) => errores.push(String(e)));
  await p.goto(URL_APP);
  await p.evaluate((s) => { localStorage.setItem('sb-prueba-auth-token', s); localStorage.setItem('banda-sonora:mezcla', JSON.stringify({ transicion: 'instantaneo', entrada: 0, salida: 0 })); }, sesion);
  await p.reload();
  await p.waitForSelector('.tarjeta');

  const nombres = (tipo) => p.locator(`.seccion-${tipo} .tarjeta .tarjeta-nombre`).allInnerTexts();
  const asa = (x) => p.getByRole('button', { name: `Mover ${x}`, exact: true });
  const tarjeta = (x) => p.locator(`.tarjeta:has(.tarjeta-tocar[aria-label$="${x}"])`).first();
  const centro = async (loc) => { const c = await loc.boundingBox(); return { x: c.x + c.width / 2, y: c.y + c.height / 2, c }; };
  const audio = () => p.evaluate(() => { const a = window.__audioBandaSonora; return a ? { src: a.src, t: a.currentTime, pausado: a.paused } : null; });
  const arrastrar = async (origen, destino, { antes = true, durante } = {}) => {
    // Como haría una persona: la sección a la vista, lejos de los bordes (cerca del borde la página se desplaza sola).
    await tarjeta(destino).evaluate((el) => el.closest('.seccion').scrollIntoView({ block: 'center' }));
    await p.waitForTimeout(100);
    const a = await centro(asa(origen));
    const d = await centro(tarjeta(destino));
    await p.mouse.move(a.x, a.y);
    await p.mouse.down();
    const x = antes ? d.c.x + 12 : d.c.x + d.c.width - 12;
    for (let i = 1; i <= 8; i++) {
      await p.mouse.move(a.x + ((x - a.x) * i) / 8, a.y + ((d.y - a.y) * i) / 8);
      if (process.env.TRAZA) console.log('  paso', i, Math.round(a.x + ((x - a.x) * i) / 8), Math.round(a.y + ((d.y - a.y) * i) / 8), (await nombres('lugar')).join(), JSON.stringify(await tarjeta(destino).boundingBox()));
    }
    if (durante) await durante();
    await p.mouse.up();
    await p.waitForTimeout(300);
  };

  // ══ Orden inicial: sin ordenar a mano, alfabético (como siempre) ══
  comprobar('Sin orden manual: alfabético, como hasta ahora', (await nombres('lugar')).join() === 'Alfa,Beta,Delta,Gamma');
  comprobar('Cada tarjeta tiene su asa para mover, aparte de reproducir y Editar', (await asa('Alfa').isVisible()) && (await p.getByRole('button', { name: 'Editar Alfa' }).isVisible()));

  // Sonando música y un ambiente mientras se ordena
  await p.getByRole('button', { name: 'Reproducir Beta', exact: true }).click();
  await p.waitForFunction(() => window.__audioBandaSonora && !window.__audioBandaSonora.paused, null, { timeout: 8000 });
  await p.getByRole('button', { name: 'Activar ambiente Lluvia' }).click();
  await p.waitForFunction(() => window.__mezclaEstado().ambientes.some((c) => c.estado === 'sonando'), null, { timeout: 8000 });
  await p.waitForTimeout(400);
  const antes = await audio();

  // ══ Arrastrar con el ratón ══
  let visto = {};
  await arrastrar('Gamma', 'Alfa', {
    durante: async () => {
      visto = {
        fantasma: await p.locator('.arrastre-fantasma').innerText().catch(() => ''),
        hueco: await p.locator('.tarjeta[data-moviendo] .tarjeta-nombre').innerText().catch(() => ''),
        orden: await nombres('lugar'),
      };
    },
  });
  comprobar('Durante el arrastre se ve qué tarjeta se mueve (copia flotante) y dónde quedará (hueco)', visto.fantasma === 'Gamma' && visto.hueco === 'Gamma' && visto.orden[0] === 'Gamma', JSON.stringify(visto));
  comprobar('Al soltar, la tarjeta queda en su nuevo sitio', (await nombres('lugar')).join() === 'Gamma,Alfa,Beta,Delta', (await nombres('lugar')).join());
  comprobar('Se guarda en la cuenta (campo orden de los elementos)', ['Gamma', 'Alfa', 'Beta', 'Delta'].every((x, i) => tablas.elementos.find((e) => e.nombre === x).orden === i + 1));
  const despues = await audio();
  const m = await p.evaluate(() => window.__mezclaEstado());
  comprobar('Ordenar no interrumpe ni reinicia la música ni los ambientes', !despues.pausado && despues.src === antes.src && despues.t > antes.t && m.ambientes.some((c) => c.estado === 'sonando'));

  // ══ Persistencia: recargar, salir y volver a entrar ══
  await p.reload();
  await p.waitForSelector('.tarjeta');
  comprobar('Al recargar se recupera exactamente el orden', (await nombres('lugar')).join() === 'Gamma,Alfa,Beta,Delta');
  await p.getByRole('button', { name: 'Salir' }).click();
  await p.waitForSelector('.entrada');
  await p.evaluate((s) => localStorage.setItem('sb-prueba-auth-token', s), sesion);
  await p.reload();
  await p.waitForSelector('.tarjeta');
  comprobar('Al cerrar sesión y volver a entrar, el mismo orden', (await nombres('lugar')).join() === 'Gamma,Alfa,Beta,Delta');
  comprobar('Las otras carpetas no cambian', (await nombres('ambiente')).join() === 'Lluvia,Viento');

  // ══ Teclado ══
  await asa('Delta').focus();
  await p.keyboard.press('Space');
  comprobar('Teclado: espacio coge la tarjeta (y se anuncia)', (await asa('Delta').getAttribute('aria-pressed')) === 'true' && (await p.locator('.seccion-lugar [aria-live]').innerText()).includes('Delta cogido'));
  await p.keyboard.press('ArrowLeft');
  await p.keyboard.press('ArrowLeft');
  await p.waitForTimeout(100);
  comprobar('…las flechas lo mueven (y el foco sigue en el asa)', (await nombres('lugar')).join() === 'Gamma,Delta,Alfa,Beta' && (await p.evaluate(() => document.activeElement?.getAttribute('aria-label'))) === 'Mover Delta');
  await p.keyboard.press('Space');
  await p.waitForTimeout(300);
  comprobar('…y espacio lo suelta y lo guarda', (await nombres('lugar')).join() === 'Gamma,Delta,Alfa,Beta' && tablas.elementos.find((e) => e.nombre === 'Delta').orden === 2 && (await p.locator('.seccion-lugar [aria-live]').innerText()).includes('posición 2 de 4'));
  const parchesAntes = parches.length;
  await asa('Alfa').focus();
  await p.keyboard.press('Space');
  await p.keyboard.press('ArrowRight');
  await p.keyboard.press('Escape');
  await p.waitForTimeout(200);
  comprobar('Teclado: Esc cancela y deja el orden como estaba (sin guardar nada)', (await nombres('lugar')).join() === 'Gamma,Delta,Alfa,Beta' && parches.length === parchesAntes);

  // ══ No cambia de carpeta ══
  const a = await centro(asa('Alfa'));
  const amb = await centro(tarjeta('Viento'));
  await p.mouse.move(a.x, a.y);
  await p.mouse.down();
  for (let i = 1; i <= 10; i++) await p.mouse.move(a.x + ((amb.x - a.x) * i) / 10, a.y + ((amb.y - a.y) * i) / 10);
  await p.mouse.up();
  await p.waitForTimeout(300);
  comprobar('Soltar sobre otra carpeta no cambia la categoría', tablas.elementos.find((e) => e.nombre === 'Alfa').tipo === 'lugar' && (await nombres('ambiente')).join() === 'Lluvia,Viento' && (await nombres('lugar')).includes('Alfa'));

  // ══ Error al guardar ══
  const ordenPrevio = (await nombres('lugar')).join();
  fallarParche = true;
  await arrastrar('Beta', 'Gamma');
  fallarParche = false;
  await p.waitForSelector('.aviso[role=alert]', { timeout: 5000 }).catch(() => {});
  comprobar('Si falla el guardado, vuelve el orden anterior y se avisa', (await nombres('lugar')).join() === ordenPrevio && (await p.locator('.aviso[role=alert]').innerText()).includes('No se ha podido guardar el nuevo orden'), (await nombres('lugar')).join());
  await p.getByRole('button', { name: 'Cerrar aviso' }).first().click();

  // ══ Reproducir y Editar siguen igual; el asa no reproduce ══
  const srcAntes = (await audio()).src;
  await asa('Delta').click();
  await p.waitForTimeout(300);
  comprobar('Pulsar el asa sin arrastrar no reproduce nada', (await audio()).src === srcAntes);
  await p.getByRole('button', { name: 'Reproducir Alfa', exact: true }).click();
  await p.waitForFunction((u) => window.__audioBandaSonora.src === u && !window.__audioBandaSonora.paused, WEB + 'alfa.wav', { timeout: 8000 });
  comprobar('Pulsar la tarjeta sigue reproduciendo su sonido', true);
  await p.getByRole('button', { name: 'Editar Gamma' }).click();
  await p.waitForSelector('dialog[open] #ed-nombre');
  comprobar('Editar sigue funcionando', (await p.inputValue('#ed-nombre')) === 'Gamma');
  await p.getByRole('button', { name: 'Cancelar', exact: true }).click();

  // ══ Elementos nuevos ══
  await crearElemento(p, { tipo: 'lugar', nombre: 'Épsilon', sonidos: [{ enlace: WEB + 'epsilon.wav' }] });
  comprobar('Nuevo en una carpeta ordenada a mano: va al final, sin alterar el resto', (await nombres('lugar')).join() === ordenPrevio + ',Épsilon', (await nombres('lugar')).join());
  await crearElemento(p, { tipo: 'ambiente', nombre: 'Bosque', sonidos: [{ enlace: WEB + 'bosque.wav' }] });
  comprobar('Nuevo en una carpeta sin ordenar: sigue el orden alfabético', (await nombres('ambiente')).join() === 'Bosque,Lluvia,Viento');

  // ══ Tarjetas del medio en ambos sentidos (la lista se reordena bajo el puntero: nada debe quedarse enganchado) ══
  const libre = async () => (await p.locator('.arrastre-fantasma').count()) === 0 && (await p.locator('.tarjeta[data-moviendo]').count()) === 0;
  let lista = await nombres('lugar');
  const medio = lista[2];
  await arrastrar(medio, lista[0]);
  let ahora = await nombres('lugar');
  comprobar('Una tarjeta del medio, al principio', ahora[0] === medio && ahora.length === lista.length, ahora.join());
  comprobar('…y al soltar no queda nada cogido ni flotando', await libre());
  lista = ahora;
  const segunda = lista[1];
  await arrastrar(segunda, lista.at(-1), { antes: false });
  ahora = await nombres('lugar');
  comprobar('Otra, hasta el final', ahora.at(-1) === segunda && (await libre()), ahora.join());
  comprobar('…y el orden guardado coincide con el de la pantalla', ahora.every((x, i) => tablas.elementos.find((e) => e.nombre === x).orden === i + 1));

  // ══ Buscando no se reordena ══
  await p.fill('#buscar', 'a');
  comprobar('Con la búsqueda activa no hay asas (el orden filtrado no es el real)', (await p.locator('.tarjeta-asa').count()) === 0);
  await p.fill('#buscar', '');

  // ══ Móvil y dedo ══
  const movil = await b.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 1 });
  await movil.route(SB + '/**', supabase);
  await movil.route(WEB + '**', (r) => r.fulfill({ status: 200, body: wav(30), headers: { 'content-type': 'audio/wav' } }));
  const mp = await movil.newPage();
  await mp.goto(URL_APP);
  await mp.evaluate((s) => localStorage.setItem('sb-prueba-auth-token', s), sesion);
  await mp.reload();
  await mp.waitForSelector('.tarjeta');
  const tacto = await mp.evaluate(() => ({ asa: getComputedStyle(document.querySelector('.tarjeta-asa')).touchAction, tarjeta: getComputedStyle(document.querySelector('.tarjeta-tocar')).touchAction, alto: document.querySelector('.tarjeta-asa').getBoundingClientRect().height }));
  comprobar('Móvil: solo el asa bloquea el desplazamiento; el resto de la tarjeta desplaza la página', tacto.asa === 'none' && tacto.tarjeta !== 'none', JSON.stringify(tacto));
  comprobar('Móvil: asa cómoda para el dedo (≥ 44 px)', tacto.alto >= 44, String(tacto.alto));
  const lugares = await mp.locator('.seccion-lugar .tarjeta .tarjeta-nombre').allInnerTexts();
  // Arrastre con el dedo (eventos de puntero táctiles): la primera tarjeta, al final.
  await mp.evaluate(async ({ origen, destino }) => {
    const asaEl = document.querySelector(`[aria-label="Mover ${origen}"]`);
    const a = asaEl.getBoundingClientRect();
    const d = document.querySelector(`.tarjeta:has([aria-label="Reproducir ${destino}"])`).getBoundingClientRect();
    const ev = (tipo, x, y) => asaEl.dispatchEvent(new PointerEvent(tipo, { bubbles: true, cancelable: true, pointerId: 7, pointerType: 'touch', isPrimary: true, button: 0, clientX: x, clientY: y }));
    const ax = a.left + a.width / 2, ay = a.top + a.height / 2;
    ev('pointerdown', ax, ay);
    for (let i = 1; i <= 10; i++) { ev('pointermove', ax, ay + ((d.top + d.height * 0.8 - ay) * i) / 10); await new Promise((r) => setTimeout(r, 16)); }
    ev('pointerup', ax, d.top + d.height * 0.8);
  }, { origen: lugares[0], destino: lugares.at(-1) });
  await mp.waitForTimeout(400);
  const lugaresDespues = await mp.locator('.seccion-lugar .tarjeta .tarjeta-nombre').allInnerTexts();
  comprobar('Móvil: arrastrar con el dedo desde el asa reordena y guarda', lugaresDespues.at(-1) === lugares[0] && lugaresDespues.length === lugares.length && tablas.elementos.find((e) => e.nombre === lugares[0]).orden === lugares.length, lugaresDespues.join());
  comprobar('Móvil: arrastrar no ha puesto nada a sonar', await mp.evaluate(() => !window.__audioBandaSonora || window.__audioBandaSonora.paused));
  await movil.close();

  // ══ Modo local ══
  const local = await b.newContext({ viewport: { width: 1280, height: 900 } });
  const lp = await local.newPage();
  await lp.goto('http://localhost:4173/');
  await lp.evaluate(() => { localStorage.clear(); indexedDB.deleteDatabase('banda-sonora'); });
  await lp.reload();
  for (const [x, s] of [['Uno', 3], ['Dos', 4], ['Tres', 5]]) await crearElemento(lp, { tipo: 'momento', nombre: x, sonidos: [{ archivo: { name: x + '.wav', mimeType: 'audio/wav', buffer: wav(s) } }] });
  const momentos = () => lp.locator('.seccion-momento .tarjeta .tarjeta-nombre').allInnerTexts();
  await lp.getByRole('button', { name: 'Mover Uno', exact: true }).focus();
  await lp.keyboard.press('Space');
  await lp.keyboard.press('ArrowRight');
  await lp.keyboard.press('ArrowRight');
  await lp.keyboard.press('Space');
  await lp.waitForTimeout(300);
  const ordenLocal = (await momentos()).join();
  await lp.reload();
  await lp.waitForSelector('.tarjeta');
  comprobar('Modo local: el orden se guarda en el navegador y se recupera al recargar', ordenLocal === 'Dos,Tres,Uno' && (await momentos()).join() === 'Dos,Tres,Uno', `${ordenLocal} → ${(await momentos()).join()}`);
  await local.close();

  comprobar('Sin errores de JavaScript', errores.length === 0, errores.join(' / '));
  const f = fin();
  await b.close();
  process.exit(f ? 1 : 0);
})();
