// Carpetas temáticas de Main (bd/005): modo local (4173), móvil y Supabase simulado (4174).
// Crear/renombrar/reordenar/eliminar carpetas; mover tarjetas (arrastrar con ratón y dedo, selección, editor); «Sin carpeta»;
// abrir/cerrar; búsqueda global; orden manual; las sesiones (Sesión 1 y 2 ya existentes) no cambian y siguen sin carpetas;
// copias; recarga y nuevo inicio de sesión; sin bd/005; y que nada de esto corta la música. (RLS: pruebas/sql.test.mjs.)
const { chromium } = require('playwright');
const { wav, comprobador } = require('./ayuda.cjs');
const WEB = 'https://sonidos.dfy.test/';
const SB = 'https://prueba.supabase.co';
const CLAVE = 'banda-sonora:biblioteca';
const { comprobar, fin } = comprobador();

// Biblioteca de un máster que ya organizó Sesión 1 y Sesión 2 (con 004) y aún no tiene carpetas.
const recurso = (id, t) => ({ id, origen: 'url', titulo: t, descripcion: '', enlace: WEB + t.toLowerCase() + '.wav', archivo_ruta: null, archivo_nombre: '', archivo_tipo: '', archivo_bytes: null, archivo_hash: null, duracion_ms: null });
const tarjetas = [['personaje', 'Alfa'], ['personaje', 'Beta'], ['personaje', 'Gamma'], ['personaje', 'Delta'], ['lugar', 'Taberna'], ['momento', 'Combate'], ['ambiente', 'Lluvia']];
const previa = {
  version: 4,
  elementos: tarjetas.map(([tipo, nombre], i) => ({ id: `el-${i}`, tipo, nombre, descripcion: '', retrato_ruta: null, orden: 0 })),
  recursos: tarjetas.map(([, nombre], i) => recurso(`re-${i}`, nombre)),
  pistas: tarjetas.map((_, i) => ({ id: `pi-${i}`, elemento_id: `el-${i}`, recurso_id: `re-${i}`, etiqueta: '', inicio_ms: null, fin_ms: null, bucle: true, orden: 0 })),
  sesiones: [{ id: 'ses-1', nombre: 'Sesión 1', finalizada: true, orden: 1 }, { id: 'ses-2', nombre: 'Sesión 2', finalizada: false, orden: 2 }],
  sesion_elementos: [
    { id: 'se-1', sesion_id: 'ses-1', elemento_id: 'el-0' },
    { id: 'se-2', sesion_id: 'ses-1', elemento_id: 'el-4' },
    { id: 'se-3', sesion_id: 'ses-2', elemento_id: 'el-0' },
    { id: 'se-4', sesion_id: 'ses-2', elemento_id: 'el-1' },
  ],
  elementos_comunes: [{ id: 'co-1', elemento_id: 'el-6' }],
};
const relSesiones = (g) => JSON.stringify([...(g.sesion_elementos ?? [])].map((r) => `${r.sesion_id}:${r.elemento_id}`).sort()) + JSON.stringify((g.elementos_comunes ?? []).map((c) => c.elemento_id).sort())
const sesionesPrevias = relSesiones(previa);

async function preparar(b, opciones = {}) {
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 }, ...opciones });
  await ctx.route(WEB + '**', (r) => r.fulfill({ status: 200, body: wav(30), headers: { 'content-type': 'audio/wav', 'accept-ranges': 'none' } }));
  await ctx.route(/oembed/, (r) => r.fulfill({ json: {} }));
  const p = await ctx.newPage();
  const errores = [];
  p.on('pageerror', (e) => errores.push(String(e)));
  return { ctx, p, errores };
}

const ayudas = (p) => {
  const boton = (n, exact = true) => p.getByRole('button', { name: n, exact });
  const chip = (n) => p.locator('.sesion-chip', { hasText: n });
  const guardado = () => p.evaluate((k) => JSON.parse(localStorage.getItem(k)), CLAVE);
  const grupo = (n) => p.locator(`.seccion-personaje .carpeta[data-soltar-nombre="${n}"]`);
  const enGrupo = (n) => grupo(n).locator('.tarjeta .tarjeta-nombre').allInnerTexts();
  const audio = () => p.evaluate(() => { const a = window.__audioBandaSonora; return a ? { src: a.src, pausado: a.paused, t: a.currentTime } : null; });
  const sigueSonando = async (antes) => { const a = await audio(); return !!a && !a.pausado && a.src === antes.src && a.t >= antes.t; };
  const nuevaCarpeta = async (seccion, nombre) => {
    await p.locator(`.seccion-${seccion}`).getByRole('button', { name: 'Nueva carpeta' }).click();
    await p.locator(`.seccion-${seccion} .carpeta-form input`).fill(nombre);
    await p.locator(`.seccion-${seccion} .carpeta-form`).getByRole('button', { name: 'Crear carpeta' }).click();
    await p.waitForTimeout(150);
  };
  const menu = async (carpeta, accion) => {
    await p.locator(`summary[aria-label="Opciones de la carpeta ${carpeta}"]`).click();
    await grupo(carpeta).locator('.carpeta-menu-lista').getByRole('button', { name: accion }).click();
  };
  // Arrastrar con el ratón desde el asa hasta otra carpeta (su cabecera).
  const arrastrar = async (tarjeta, carpeta) => {
    const asa = p.getByRole('button', { name: `Mover ${tarjeta}`, exact: true });
    await asa.scrollIntoViewIfNeeded();
    const a = await asa.boundingBox();
    // Como haría una persona: el destino a la vista (no debajo de la barra del reproductor) y la tarjeta también.
    await grupo(carpeta).locator('.carpeta-cabecera').evaluate((el) => el.scrollIntoView({ block: 'center' }));
    await asa.scrollIntoViewIfNeeded();
    const a2 = await asa.boundingBox();
    const d = await grupo(carpeta).locator('.carpeta-cabecera').boundingBox();
    const ax = a2.x + a2.width / 2, ay = a2.y + a2.height / 2, dx = d.x + 60, dy = d.y + d.height / 2;
    await p.mouse.move(ax, ay);
    await p.mouse.down();
    for (let i = 1; i <= 10; i++) await p.mouse.move(ax + ((dx - ax) * i) / 10, ay + ((dy - ay) * i) / 10);
    const resaltada = await grupo(carpeta).getAttribute('data-encima');
    await p.mouse.up();
    await p.waitForTimeout(300);
    return { resaltada, a };
  };
  return { boton, chip, guardado, grupo, enGrupo, audio, sigueSonando, nuevaCarpeta, menu, arrastrar };
};

const carpetaDeEn = (g, nombre) => {
  const el = g.elementos.find((e) => e.nombre === nombre);
  const r = (g.carpeta_elementos ?? []).find((x) => x.elemento_id === el.id);
  return r ? g.carpetas.find((c) => c.id === r.carpeta_id)?.nombre : null;
};

(async () => {
  const b = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });

  // ═════════════ Modo local ═════════════
  {
    const { p, errores } = await preparar(b);
    const h = ayudas(p);
    const { boton, chip, guardado, grupo, enGrupo, nuevaCarpeta, menu, arrastrar } = h;
    await p.goto('http://localhost:4173/');
    await p.evaluate(([k, v]) => { localStorage.setItem(k, v); localStorage.setItem('banda-sonora:mezcla', JSON.stringify({ transicion: 'instantaneo', entrada: 0, salida: 0 })); }, [CLAVE, JSON.stringify(previa)]);
    await p.reload();
    await p.waitForSelector('.tarjeta');

    comprobar('El botón «Main» sustituye a «Toda la biblioteca» y está elegido', (await chip('Main').getAttribute('aria-pressed')) === 'true' && (await p.getByText('Toda la biblioteca').count()) === 0);
    comprobar('Sin carpetas creadas: todo visible como siempre, sin grupos', (await p.locator('.biblioteca .tarjeta').count()) === 7 && (await p.locator('.carpeta').count()) === 0);
    comprobar('Sesión 1 y Sesión 2 siguen ahí', (await chip('Sesión 1').count()) === 1 && (await chip('Sesión 2').count()) === 1);

    // Música sonando durante toda la organización
    await boton('Reproducir Beta').click();
    await p.waitForFunction(() => window.__audioBandaSonora && !window.__audioBandaSonora.paused && window.__audioBandaSonora.currentTime > 0.2, null, { timeout: 10000 });
    let antes = await h.audio();

    // ── Crear carpetas ──
    await nuevaCarpeta('personaje', 'Xanathar');
    await nuevaCarpeta('personaje', 'Protagonistas');
    comprobar('Crear carpetas en Personajes', (await p.locator('.seccion-personaje .carpeta-nombre').allInnerTexts()).join() === 'Xanathar,Protagonistas,Sin carpeta');
    comprobar('Las tarjetas existentes empiezan en «Sin carpeta»', (await enGrupo('Sin carpeta')).length === 4);
    comprobar('Otras categorías sin carpetas no cambian', (await p.locator('.seccion-lugar .carpeta').count()) === 0 && (await p.locator('.seccion-lugar .tarjeta').count()) === 1);
    await nuevaCarpeta('personaje', ' xanathar ');
    comprobar('Nombre repetido en la misma categoría: aviso y no se crea', (await p.locator('.aviso[role="alert"]').innerText()).includes('Ya hay una carpeta') && (await guardado()).carpetas.length === 2);
    await boton('Cerrar aviso').click();
    await nuevaCarpeta('momento', 'Drama');
    comprobar('«Drama» es subcarpeta de Momentos, no una categoría nueva', (await p.locator('.seccion-momento .carpeta-nombre').allInnerTexts()).includes('Drama') && (await p.locator('.seccion').count()) === 7);

    // ── Arrastrar con el ratón a otra carpeta ──
    const { resaltada } = await arrastrar('Alfa', 'Xanathar');
    comprobar('Al arrastrar, la carpeta de destino se resalta', resaltada === 'true');
    comprobar('Arrastrar una tarjeta a una carpeta (vacía)', (await enGrupo('Xanathar')).join() === 'Alfa' && carpetaDeEn(await guardado(), 'Alfa') === 'Xanathar');
    await arrastrar('Gamma', 'Xanathar');
    comprobar('Al moverla queda al final de la carpeta', (await enGrupo('Xanathar')).join() === 'Alfa,Gamma');
    comprobar('Mover de carpeta no toca las sesiones', relSesiones(await guardado()) === sesionesPrevias);
    comprobar('La música sigue sonando al crear carpetas y mover tarjetas', await h.sigueSonando(antes));

    // ── Selección múltiple: «Mover a carpeta» ──
    await boton('Seleccionar tarjetas').click();
    await p.getByRole('button', { name: /^Seleccionar Beta\b/ }).click();
    await p.getByRole('button', { name: /^Seleccionar Taberna\b/ }).click();
    await p.selectOption('#seleccion-carpeta', { label: 'Protagonistas' });
    await boton('Mover a carpeta').click();
    await p.waitForTimeout(300);
    const aviso = await p.locator('.aviso-ok').innerText();
    comprobar('Selección: mueve las de la categoría y avisa de las demás', (await enGrupo('Protagonistas')).join() === 'Beta' && aviso.includes('1 tarjeta de otra categoría'), aviso);
    comprobar('… y no toca la de otra categoría', carpetaDeEn(await guardado(), 'Taberna') == null);
    await boton('Hecho').click();
    comprobar('Seleccionar no reprodujo nada nuevo', await h.sigueSonando(antes));

    // ── Reordenar dentro de una carpeta (teclado) ──
    await boton('Mover Gamma').focus();
    await p.keyboard.press('Space');
    await p.keyboard.press('ArrowLeft');
    await p.keyboard.press('Space');
    await p.waitForTimeout(300);
    comprobar('Teclado: reordenar dentro de una carpeta', (await enGrupo('Xanathar')).join() === 'Gamma,Alfa');
    await p.reload();
    await p.waitForSelector('.carpeta');
    comprobar('El orden manual dentro de la carpeta se conserva', (await enGrupo('Xanathar')).join() === 'Gamma,Alfa');

    // ── Abrir / cerrar y buscador global ──
    await grupo('Xanathar').locator('.carpeta-alternar').click();
    comprobar('Cerrar una carpeta oculta sus tarjetas', (await grupo('Xanathar').locator('.tarjeta').count()) === 0 && (await grupo('Xanathar').locator('.carpeta-alternar').getAttribute('aria-expanded')) === 'false');
    await p.fill('#buscar', 'gamm');
    comprobar('El buscador encuentra tarjetas en carpetas cerradas', (await enGrupo('Xanathar')).join() === 'Gamma' && (await p.locator('.biblioteca .tarjeta').count()) === 1);
    await p.fill('#buscar', '');
    await p.reload();
    await p.waitForSelector('.carpeta');
    comprobar('La carpeta sigue cerrada tras recargar', (await grupo('Xanathar').locator('.tarjeta').count()) === 0);
    await grupo('Xanathar').locator('.carpeta-alternar').click();
    // Al recargar no suena nada (como siempre): se vuelve a poner música para seguir comprobando que nada la corta.
    await boton('Reproducir Beta').click();
    await p.waitForFunction(() => window.__audioBandaSonora && !window.__audioBandaSonora.paused && window.__audioBandaSonora.currentTime > 0.2, null, { timeout: 10000 });
    antes = await h.audio();

    // ── Arrastrar a una carpeta cerrada y a «Sin carpeta» ──
    await grupo('Protagonistas').locator('.carpeta-alternar').click();
    await arrastrar('Delta', 'Protagonistas');
    comprobar('Arrastrar a una carpeta cerrada', carpetaDeEn(await guardado(), 'Delta') === 'Protagonistas');
    await grupo('Protagonistas').locator('.carpeta-alternar').click();
    await arrastrar('Delta', 'Sin carpeta');
    comprobar('Arrastrar a «Sin carpeta» la saca de su carpeta', carpetaDeEn(await guardado(), 'Delta') == null && (await enGrupo('Sin carpeta')).includes('Delta'));

    // ── Renombrar y reordenar carpetas ──
    await menu('Xanathar', 'Renombrar');
    await grupo('Xanathar').locator('.carpeta-form input').fill('Banda de Xanathar');
    await grupo('Xanathar').locator('.carpeta-form').getByRole('button', { name: 'Guardar' }).click();
    await p.waitForTimeout(150);
    comprobar('Renombrar carpeta', (await guardado()).carpetas.some((c) => c.nombre === 'Banda de Xanathar') && (await enGrupo('Banda de Xanathar')).length === 2);
    await menu('Banda de Xanathar', 'Bajar');
    await p.waitForTimeout(150);
    comprobar('Reordenar carpetas', (await p.locator('.seccion-personaje .carpeta-nombre').allInnerTexts()).join() === 'Protagonistas,Banda de Xanathar,Sin carpeta');

    // ── Añadir una tarjeta nueva dentro de una carpeta ──
    await menu('Protagonistas', 'Añadir personaje aquí');
    await p.waitForSelector('dialog[open] #ed-nombre');
    comprobar('Editor: la carpeta viene elegida', (await p.locator('#ed-carpeta option:checked').innerText()) === 'Protagonistas');
    await p.fill('#ed-nombre', 'Laeral');
    await boton('Guardar').click();
    await p.waitForSelector('dialog[open]', { state: 'detached' });
    await p.waitForTimeout(200);
    comprobar('Una tarjeta nueva se crea dentro de la carpeta', (await enGrupo('Protagonistas')).includes('Laeral') && carpetaDeEn(await guardado(), 'Laeral') === 'Protagonistas');

    // ── Editor: cambiar de carpeta y de categoría ──
    await boton('Editar Beta').click();
    await p.selectOption('#ed-carpeta', { label: 'Banda de Xanathar' });
    await boton('Guardar').click();
    await p.waitForSelector('dialog[open]', { state: 'detached' });
    await p.waitForTimeout(200);
    comprobar('Editor: mover a otra carpeta', carpetaDeEn(await guardado(), 'Beta') === 'Banda de Xanathar');
    await boton('Editar Laeral').click();
    await p.locator('.chip-carpeta', { hasText: 'Momento' }).click();
    comprobar('Editor: al cambiar de categoría se ofrecen las carpetas de la nueva', (await p.locator('#ed-carpeta option').allInnerTexts()).join() === 'Sin carpeta,Drama');
    await boton('Guardar').click();
    await p.waitForSelector('dialog[open]', { state: 'detached' });
    await p.waitForTimeout(200);
    const gL = await guardado();
    comprobar('Cambiar de categoría la saca de su carpeta anterior', carpetaDeEn(gL, 'Laeral') == null && gL.elementos.find((e) => e.nombre === 'Laeral').tipo === 'momento' && (await p.locator('.seccion-momento .tarjeta-nombre', { hasText: 'Laeral' }).count()) === 1);

    // ── Main → sesiones: una tarjeta en carpeta, en varias sesiones ──
    await boton('Seleccionar tarjetas').click();
    await p.getByRole('button', { name: /^Seleccionar Gamma\b/ }).click();
    await p.selectOption('#seleccion-destino', { label: 'Sesión 2' });
    await boton('Añadir a la sesión').click();
    await p.waitForTimeout(150);
    await p.selectOption('#seleccion-destino', { label: 'Sesión 1 (finalizada)' });
    await boton('Añadir a la sesión').click();
    await p.waitForTimeout(150);
    await boton('Hecho').click();
    const gS = await guardado();
    const gamma = gS.elementos.find((e) => e.nombre === 'Gamma').id;
    comprobar('Una tarjeta de una carpeta, en varias sesiones (sin duplicar)', gS.sesion_elementos.filter((r) => r.elemento_id === gamma).length === 2 && gS.elementos.length === 8 && carpetaDeEn(gS, 'Gamma') === 'Banda de Xanathar');
    comprobar('Las asignaciones previas de Sesión 1 y 2 siguen intactas', previa.sesion_elementos.every((r) => gS.sesion_elementos.some((x) => x.id === r.id && x.sesion_id === r.sesion_id && x.elemento_id === r.elemento_id)) && gS.elementos_comunes.some((c) => c.elemento_id === 'el-6'));

    // ── Las sesiones siguen siendo mesas de sonido sin carpetas ──
    await chip('Sesión 2').click();
    const personajesS2 = await p.locator('.seccion-personaje .tarjeta .tarjeta-nombre').allInnerTexts();
    comprobar('Sesión: sin carpetas temáticas, tarjetas directas', (await p.locator('.carpeta').count()) === 0 && personajesS2.sort().join() === 'Alfa,Beta,Gamma');
    comprobar('Sesión: categorías de siempre y comunes', (await p.locator('.seccion').count()) === 7 && (await p.locator('.seccion-ambiente .tarjeta-comun').count()) === 1);
    comprobar('Cambiar a una sesión no corta la música', await h.sigueSonando(antes));
    await boton('Reproducir Alfa').click();
    await p.waitForFunction(() => window.__audioBandaSonora && /alfa\.wav/.test(window.__audioBandaSonora.src) && !window.__audioBandaSonora.paused, null, { timeout: 10000 });
    comprobar('Sesión: pulsar una tarjeta (que está en una carpeta de Main) la reproduce', true);
    const antes2 = await h.audio();
    await chip('Main').click();

    // ── Eliminar una carpeta ──
    await menu('Banda de Xanathar', 'Eliminar carpeta');
    const pregunta = await grupo('Banda de Xanathar').locator('.confirmar p').innerText();
    comprobar('Confirmación clara al eliminar una carpeta', pregunta.includes('3 tarjetas pasarán a «Sin carpeta»') && pregunta.includes('No se borra ninguna tarjeta'), pregunta);
    await grupo('Banda de Xanathar').locator('.confirmar').getByRole('button', { name: 'Eliminar carpeta' }).click();
    await p.waitForTimeout(200);
    const gE = await guardado();
    comprobar('Eliminar carpeta: sus tarjetas pasan a «Sin carpeta» sin borrarse', gE.carpetas.length === 2 && gE.elementos.length === 8 && gE.pistas.length === 7 && ['Alfa', 'Gamma', 'Beta'].every((n) => carpetaDeEn(gE, n) == null) && (await enGrupo('Sin carpeta')).length === 4);
    comprobar('Eliminar carpeta: sesiones intactas', gE.sesion_elementos.length === gS.sesion_elementos.length);
    comprobar('La música sigue tras eliminar una carpeta y volver a Main', await h.sigueSonando(antes2));
    await boton('Detener').click();

    // ── Copias ──
    await arrastrar('Delta', 'Protagonistas')
    const copia = JSON.parse(await p.evaluate((k) => localStorage.getItem(k), CLAVE));
    comprobar('La copia incluye carpetas y sus relaciones', copia.carpetas.length === 2 && copia.carpeta_elementos.length === 1);
    const { p: q, errores: e2 } = await preparar(b);
    const hq = ayudas(q);
    await q.goto('http://localhost:4173/');
    await q.waitForSelector('.sesion-chip');
    await hq.boton('Copias').click();
    await q.getByLabel('Pega aquí el texto de una copia').fill(JSON.stringify({ version: 4, elementos: previa.elementos, recursos: previa.recursos, pistas: previa.pistas }));
    await hq.boton('Comprobar texto').click();
    await hq.boton('Añadir').click();
    await q.waitForTimeout(400);
    comprobar('Importar una copia anterior (sin carpetas ni sesiones)', (await hq.guardado()).elementos.length === 7 && (await hq.guardado()).carpetas.length === 0);
    await q.getByLabel('Pega aquí el texto de una copia').fill(JSON.stringify(copia));
    await hq.boton('Comprobar texto').click();
    comprobar('Al comprobar, avisa de las carpetas', (await q.locator('.confirmar p').innerText()).includes('2 carpetas'));
    await hq.boton('Añadir').click();
    await q.waitForTimeout(800);
    await hq.boton('Cerrar').click();
    const gi = await hq.guardado();
    const relI = gi.carpeta_elementos[0] ?? {}
    comprobar('Importar con carpetas: las recrea con sus tarjetas', gi.carpetas.length === 2 && gi.carpeta_elementos.length === 1 && gi.elementos.find((e) => e.id === relI.elemento_id)?.nombre === 'Delta' && gi.carpetas.find((c) => c.id === relI.carpeta_id)?.nombre === 'Protagonistas' && gi.sesiones.length === 2);
    comprobar('Sin errores de JavaScript (local)', errores.length + e2.length === 0, [...errores, ...e2].join(' / '));
  }

  // ═════════════ Móvil con el dedo ═════════════
  {
    const { p, errores } = await preparar(b, { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 1 });
    const h = ayudas(p);
    await p.goto('http://localhost:4173/');
    const conCarpeta = { ...previa, carpetas: [{ id: 'ca-1', tipo: 'personaje', nombre: 'Xanathar', orden: 1 }], carpeta_elementos: [] };
    await p.evaluate(([k, v]) => localStorage.setItem(k, v), [CLAVE, JSON.stringify(conCarpeta)]);
    await p.reload();
    await p.waitForSelector('.carpeta');
    const tacto = await p.evaluate(() => ({ menu: document.querySelector('.carpeta-menu > summary').getBoundingClientRect().height, sobra: document.documentElement.scrollWidth - window.innerWidth }));
    comprobar('Móvil: menú de carpeta cómodo para el dedo y sin desbordar la pantalla', tacto.menu >= 44 && tacto.sobra <= 0, JSON.stringify(tacto));
    await p.evaluate(async () => {
      const asaEl = document.querySelector('[aria-label="Mover Beta"]');
      asaEl.scrollIntoView({ block: 'center' });
      await new Promise((r) => setTimeout(r, 50));
      const a = asaEl.getBoundingClientRect();
      const d = [...document.querySelectorAll('.carpeta')].find((c) => c.querySelector('.carpeta-nombre').textContent === 'Xanathar').querySelector('.carpeta-cabecera').getBoundingClientRect();
      const ev = (tipo, x, y) => asaEl.dispatchEvent(new PointerEvent(tipo, { bubbles: true, cancelable: true, pointerId: 9, pointerType: 'touch', isPrimary: true, button: 0, clientX: x, clientY: y }));
      const ax = a.left + a.width / 2, ay = a.top + a.height / 2, dx = d.left + 60, dy = d.top + d.height / 2;
      ev('pointerdown', ax, ay);
      for (let i = 1; i <= 10; i++) { ev('pointermove', ax + ((dx - ax) * i) / 10, ay + ((dy - ay) * i) / 10); await new Promise((r) => setTimeout(r, 16)); }
      ev('pointerup', dx, dy);
    });
    await p.waitForTimeout(400);
    comprobar('Móvil: arrastrar con el dedo a una carpeta', carpetaDeEn(await h.guardado(), 'Beta') === 'Xanathar' && (await h.enGrupo('Xanathar')).join() === 'Beta');
    comprobar('Sin errores de JavaScript (móvil)', errores.length === 0, errores.join(' / '));
  }

  // ═════════════ Supabase simulado ═════════════
  {
    const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
    const exp = Math.floor(Date.now() / 1000) + 3600;
    const UID = '11111111-1111-1111-1111-111111111111';
    const usuario = { id: UID, aud: 'authenticated', role: 'authenticated', email: 'dm@example.com', user_metadata: {}, app_metadata: { provider: 'email' } };
    const JWT = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: UID, exp, role: 'authenticated', aud: 'authenticated' })}.firma`;
    const token = JSON.stringify({ access_token: JWT, token_type: 'bearer', expires_in: 3600, expires_at: exp, refresh_token: 'r', user: usuario });
    const copiaDe = (l) => l.map((x) => ({ ...x }));
    const tablas = { elementos: copiaDe(previa.elementos), recursos: copiaDe(previa.recursos), pistas: copiaDe(previa.pistas), sesiones: copiaDe(previa.sesiones), sesion_elementos: copiaDe(previa.sesion_elementos), elementos_comunes: copiaDe(previa.elementos_comunes), carpetas: [], carpeta_elementos: [] };
    let sin005 = true;
    let n = 0;
    const cuerpos = [];
    const escrituras = [];
    const servidor = async (r) => {
      const req = r.request();
      const u = new URL(req.url());
      const t = u.pathname.match(/^\/rest\/v1\/(\w+)/)?.[1];
      const id = u.searchParams.get('id')?.replace('eq.', '');
      if (u.pathname.startsWith('/auth/v1/')) return r.fulfill(u.pathname.includes('/user') ? { json: usuario } : { status: 204, body: '' });
      if (!t) return r.fulfill({ status: 404, body: '' });
      if (sin005 && ['carpetas', 'carpeta_elementos'].includes(t))
        return r.fulfill({ status: 404, json: { code: 'PGRST205', message: `Could not find the table 'public.${t}' in the schema cache` } });
      if (req.method() !== 'GET') escrituras.push(`${req.method()} ${t}`);
      if (req.method() === 'GET') return r.fulfill({ json: tablas[t] });
      if (req.method() === 'POST') {
        const cuerpo = JSON.parse(req.postData());
        cuerpos.push(cuerpo);
        const fila = { id: `${t}-${++n}`, ...cuerpo };
        tablas[t].push(fila);
        return r.fulfill({ status: 201, json: fila });
      }
      if (req.method() === 'PATCH') {
        const cambio = JSON.parse(req.postData());
        cuerpos.push(cambio);
        tablas[t] = tablas[t].map((f) => (f.id === id ? { ...f, ...cambio } : f));
        return r.fulfill({ status: 204, body: '' });
      }
      if (req.method() === 'DELETE') {
        tablas[t] = tablas[t].filter((f) => f.id !== id);
        if (t === 'carpetas') tablas.carpeta_elementos = tablas.carpeta_elementos.filter((x) => x.carpeta_id !== id);
        return r.fulfill({ status: 204, body: '' });
      }
      return r.fulfill({ status: 404, body: '' });
    };
    const { ctx, p, errores } = await preparar(b);
    await ctx.route(SB + '/**', servidor);
    const h = ayudas(p);
    await p.goto('http://localhost:4174/');
    await p.evaluate((s) => localStorage.setItem('sb-prueba-auth-token', s), token);
    await p.reload();
    await p.waitForSelector('.tarjeta');

    // ── Sin bd/005 ──
    comprobar('Sin bd/005: biblioteca y sesiones cargan igual', (await p.locator('.biblioteca .tarjeta').count()) === 7 && (await h.chip('Sesión 1').count()) === 1);
    await h.nuevaCarpeta('personaje', 'Xanathar');
    comprobar('Sin bd/005: crear carpeta avisa de ejecutar la 005', (await p.locator('.aviso[role="alert"]').innerText()).includes('bd/005-carpetas-biblioteca.sql') && tablas.carpetas.length === 0);

    // ── Con bd/005 ──
    sin005 = false;
    await p.reload();
    await p.waitForSelector('.tarjeta');
    await h.nuevaCarpeta('personaje', 'Xanathar');
    await h.nuevaCarpeta('personaje', 'Zhentarim');
    await h.arrastrar('Alfa', 'Xanathar');
    comprobar('Supabase: crear carpeta y mover por arrastre', tablas.carpeta_elementos.length === 1 && tablas.carpeta_elementos[0].carpeta_id === tablas.carpetas.find((c) => c.nombre === 'Xanathar').id);
    escrituras.length = 0;
    await h.arrastrar('Alfa', 'Zhentarim');
    comprobar('Supabase: mover entre carpetas actualiza la relación (sin duplicar)', tablas.carpeta_elementos.length === 1 && escrituras.includes('PATCH carpeta_elementos') && !escrituras.includes('POST carpeta_elementos'));
    comprobar('Supabase: mover de carpeta no escribe nada en las sesiones', !escrituras.some((x) => /sesion|comunes/.test(x)) && relSesiones(tablas) === sesionesPrevias);
    comprobar('Supabase: el navegador nunca envía user_id', cuerpos.every((c) => !('user_id' in c)));

    // ── Nuevo inicio de sesión ──
    await p.evaluate(() => { for (const k of Object.keys(localStorage)) if (k.startsWith('sb-')) localStorage.removeItem(k); });
    await p.reload();
    await p.evaluate((s) => localStorage.setItem('sb-prueba-auth-token', s), token);
    await p.reload();
    await p.waitForSelector('.carpeta');
    comprobar('Supabase: tras volver a entrar, carpetas y tarjetas siguen', (await h.enGrupo('Zhentarim')).join() === 'Alfa' && (await p.locator('.seccion-personaje .carpeta-nombre').allInnerTexts()).join() === 'Xanathar,Zhentarim,Sin carpeta');
    await h.chip('Sesión 1').click();
    comprobar('Supabase: Sesión 1 sigue igual y sin carpetas', (await p.locator('.carpeta').count()) === 0 && (await p.locator('.biblioteca .tarjeta .tarjeta-nombre').allInnerTexts()).sort().join() === 'Alfa,Lluvia,Taberna');
    await h.chip('Main').click();

    // ── Fallo al mover: vuelve a su sitio y avisa ──
    await ctx.route(SB + '/rest/v1/carpeta_elementos**', (r) => (r.request().method() === 'PATCH' ? r.fulfill({ status: 500, json: { message: 'fallo simulado' } }) : r.fallback()));
    await h.arrastrar('Alfa', 'Xanathar');
    comprobar('Supabase: si falla mover, la tarjeta vuelve a su carpeta y se avisa', (await h.enGrupo('Zhentarim')).join() === 'Alfa' && (await p.locator('.aviso[role="alert"]').count()) > 0);
    comprobar('Sin errores de JavaScript (Supabase)', errores.length === 0, errores.join(' / '));
  }

  const f = fin();
  await b.close();
  process.exit(f ? 1 : 0);
})();
