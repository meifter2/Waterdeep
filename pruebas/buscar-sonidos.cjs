// «Buscar sonidos» (Freesound) de punta a punta: interfaz (preview 4174, Supabase simulado) → función REAL
// api/sonidos.ts (cargada aquí) → Freesound simulado. Nada sale a internet. Requiere npm run build:prueba + preview:prueba.
// NO prueba la API real de Freesound: eso solo se puede verificar con una cuenta y clave auténticas.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { wav, crearElemento, comprobador, CAPTURAS } = require('./ayuda.cjs');
const URL_APP = 'http://localhost:4174/';
const SB = 'https://prueba.supabase.co';
const CDN = 'https://cdn.freesound.test/previews/';
const CLAVE = 'clave-freesound-de-prueba-9f8e7d';
const { comprobar, fin } = comprobador();

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const exp = Math.floor(Date.now() / 1000) + 3600;
const UID = '11111111-1111-1111-1111-111111111111';
const usuario = { id: UID, aud: 'authenticated', role: 'authenticated', email: 'dm@example.com', user_metadata: {}, app_metadata: { provider: 'email' } };
const JWT = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: UID, exp, role: 'authenticated', aud: 'authenticated' })}.firma`;
const sesion = { access_token: JWT, token_type: 'bearer', expires_in: 3600, expires_at: exp, refresh_token: 'refresco', user: usuario };

// ── Supabase simulado (tablas en memoria) ──
const tablas = { elementos: [], recursos: [], pistas: [], sesiones: [], sesion_elementos: [], elementos_comunes: [], carpetas: [], carpeta_elementos: [] };
const peticionesSb = [];
let n = 0;
async function supabase(r) {
  const req = r.request();
  const u = new URL(req.url());
  peticionesSb.push(`${req.method()} ${u.pathname}`);
  const t = u.pathname.match(/^\/rest\/v1\/(\w+)/)?.[1];
  const id = u.searchParams.get('id')?.replace('eq.', '');
  if (t && req.method() === 'GET') return r.fulfill({ json: tablas[t] });
  if (t && req.method() === 'POST') {
    const fila = { id: `${t}-${++n}`, ...JSON.parse(req.postData()) };
    tablas[t].push(fila);
    return r.fulfill({ status: 201, json: fila });
  }
  if (t && req.method() === 'PATCH') {
    tablas[t] = tablas[t].map((f) => (f.id === id ? { ...f, ...JSON.parse(req.postData()) } : f));
    return r.fulfill({ status: 204, body: '' });
  }
  if (t && req.method() === 'DELETE') {
    tablas[t] = tablas[t].filter((f) => f.id !== id);
    return r.fulfill({ status: 204, body: '' });
  }
  if (u.pathname.startsWith('/auth/v1/')) return r.fulfill(u.pathname.includes('/user') ? { json: usuario } : { status: 204, body: '' });
  return r.fulfill({ status: 404, body: '' });
}

// ── Freesound simulado (lo llama la función de servidor, desde Node) ──
const CC0 = 'http://creativecommons.org/publicdomain/zero/1.0/';
const BY = 'https://creativecommons.org/licenses/by/4.0/';
const NC = 'https://creativecommons.org/licenses/by-nc/4.0/';
const sonido = (id, nombre, licencia, duracion, preview = `${CDN}${id}_v1-hq.mp3`) => ({
  id, name: nombre, username: 'autora', license: licencia, duration: duracion,
  previews: { 'preview-hq-mp3': preview }, url: `https://freesound.org/people/autora/sounds/${id}/`, avg_rating: 4.5, num_ratings: 8,
});
const catalogo = {
  1: sonido(1, 'Rain on roof.wav', CC0, 300),
  2: sonido(2, 'heavy_rain_loop', BY, 420),
  3: sonido(3, 'Rain NC', NC, 200),
  4: sonido(4, 'Wooden door creak', CC0, 2),
};
const llamadasFs = [];
let modoFs = 'normal'; // 'normal' | 'limite'
const vivas = new Set(['1_v1', '2_v1', '3_v1', '4_v1', '5_v1']); // MP3 de escucha que responden
const fetchReal = globalThis.fetch;
globalThis.fetch = async (entrada, init) => {
  const url = String(entrada);
  const cab = Object.fromEntries(new Headers(init?.headers).entries());
  if (url === `${SB}/auth/v1/user`) return cab.authorization === `Bearer ${JWT}` ? new Response(JSON.stringify(usuario)) : new Response('{}', { status: 401 });
  if (url.startsWith('https://freesound.org/apiv2/')) {
    llamadasFs.push({ url, cab });
    if (modoFs === 'limite') return new Response('{"detail":"Request was throttled"}', { status: 429, headers: { 'retry-after': '30' } });
    const u = new URL(url);
    const unico = u.pathname.match(/\/sounds\/(\d+)\//)?.[1];
    if (unico) return catalogo[unico] ? new Response(JSON.stringify(catalogo[unico])) : new Response('{"detail":"Not found."}', { status: 404 });
    const q = (u.searchParams.get('query') || '').toLowerCase();
    const [, desde, hasta] = /duration:\[(\d+) TO (\d+|\*)\]/.exec(u.searchParams.get('filter')) || [];
    const res = Object.values(catalogo).filter((s) => s.name.toLowerCase().includes(q.split(' ')[0]) && s.duration >= Number(desde) && (hasta === '*' || s.duration <= Number(hasta)));
    return new Response(JSON.stringify({ count: res.length, next: null, results: res }));
  }
  return fetchReal(entrada, init);
};

(async () => {
  process.env.VITE_SUPABASE_URL = SB;
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_prueba';
  delete process.env.FREESOUND_API_KEY;
  const { atender } = await import('../api/sonidos.ts');

  const b = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const ctx = await b.newContext({ viewport: { width: 1280, height: 860 } });
  await ctx.route(SB + '/**', supabase);
  await ctx.route(/open\.spotify\.com|youtube\.com/, (r) => r.fulfill({ body: '' }));
  const respuestasApi = [];
  // /api/sonidos → la función de servidor de verdad.
  await ctx.route('**/api/sonidos**', async (r) => {
    const req = r.request();
    const res = await atender(new Request(req.url(), { method: req.method(), headers: req.headers() }));
    const cuerpo = Buffer.from(await res.arrayBuffer());
    respuestasApi.push({ estado: res.status, cuerpo: cuerpo.toString(), cabeceras: JSON.stringify([...res.headers.entries()]) });
    return r.fulfill({ status: res.status, headers: Object.fromEntries(res.headers.entries()), body: cuerpo });
  });
  // CDN de Freesound simulado: los MP3 de escucha (si «caducan», 404).
  await ctx.route(CDN + '**', (r) => {
    const nombre = r.request().url().slice(CDN.length).replace(/-hq\.mp3.*/, '');
    return vivas.has(nombre)
      ? r.fulfill({ status: 200, body: wav(nombre.startsWith('4') ? 1 : 6), headers: { 'content-type': 'audio/wav', 'accept-ranges': 'none', 'cache-control': 'no-store' } })
      : r.fulfill({ status: 404, body: 'Not found' });
  });

  const p = await ctx.newPage();
  const errores = [];
  p.on('pageerror', (e) => errores.push(String(e)));
  await p.goto(URL_APP);
  await p.evaluate((s) => localStorage.setItem('sb-prueba-auth-token', s), JSON.stringify(sesion));
  await p.reload();
  await p.waitForSelector('.cabecera');

  const btn = (x) => p.getByRole('button', { name: x, exact: true });
  const dlg = () => p.locator('dialog.buscar-sonidos');
  const alerta = () => dlg().locator('[role=alert]').first().innerText();
  const buscar = async (texto) => {
    await p.fill('#buscar-texto', texto);
    await dlg().getByRole('button', { name: 'Buscar', exact: true }).click();
    await p.waitForFunction(() => !/Buscando/.test(document.querySelector('.buscar-estado')?.textContent || ''), null, { timeout: 8000 });
  };
  const titulos = () => dlg().locator('.sonido-libre-titulo').allInnerTexts();
  const mezcla = () => p.evaluate(() => ({ ...window.__mezclaEstado(), voces: window.__mezclaDFY ? window.__mezclaDFY.diagnostico() : [] }));

  // ══ Sin clave: se explica y el resto de DFY sigue funcionando ══
  await btn('Buscar sonidos').click();
  await dlg().waitFor();
  await buscar('rain');
  comprobar('Sin FREESOUND_API_KEY: explica qué falta', (await alerta()).includes('FREESOUND_API_KEY') && (await dlg().locator('.sonido-libre').count()) === 0, await alerta());
  await btn('Cerrar').click();
  await btn('Sonidos').click();
  comprobar('…y el resto de DFY sigue funcionando', await p.locator('#sonidos-titulo').isVisible());
  await btn('Cerrar').click();
  process.env.FREESOUND_API_KEY = CLAVE;

  // ══ Búsqueda: español → sugerencias en inglés; filtros; licencias ══
  await btn('Buscar sonidos').click();
  await dlg().waitFor();
  comprobar('Ideas rápidas para ambientes', (await dlg().locator('.buscar-ideas .pista-chip').allInnerTexts()).includes('taberna'));
  await p.fill('#buscar-texto', 'lluvia');
  const ideas = await dlg().locator('.buscar-ideas .pista-chip').allInnerTexts();
  comprobar('Escribir «lluvia» sugiere buscar en inglés', ideas.includes('rain'), ideas.join(','));
  llamadasFs.length = 0;
  await dlg().locator('.buscar-ideas .pista-chip', { hasText: /^rain$/ }).click();
  await p.waitForFunction(() => document.querySelectorAll('.sonido-libre').length > 0, null, { timeout: 8000 });
  let t = await titulos();
  const ultimaFs = () => new URL(llamadasFs.at(-1).url);
  comprobar('Busca en Freesound con el término en inglés', ultimaFs().searchParams.get('query') === 'rain');
  comprobar('Ambientes: solo sonidos de más de 1 minuto', ultimaFs().searchParams.get('filter') === 'duration:[60 TO *]');
  comprobar('Por defecto, sin CC BY-NC', t.length === 2 && !t.includes('Rain NC'), t.join(' | '));
  comprobar('Cada resultado muestra autor y licencia', (await dlg().locator('.sonido-libre-credito').first().innerText()).includes('de autora') && (await dlg().locator('.licencia').allInnerTexts()).join() === 'CC0,CC BY 4.0');
  await p.selectOption('#buscar-duracion', '5-20');
  await p.waitForTimeout(400);
  comprobar('Filtro de duración (5–20 min) llega a Freesound', ultimaFs().searchParams.get('filter') === 'duration:[300 TO 1200]');
  await p.selectOption('#buscar-duracion', 'cualquiera');
  await dlg().getByLabel('Incluir sonidos CC BY-NC (solo uso no comercial)').check();
  await p.waitForFunction(() => document.querySelectorAll('.sonido-libre').length === 3, null, { timeout: 8000 });
  comprobar('Incluir NC: aparece y queda claramente marcado', (await dlg().locator('.licencia[data-licencia="by-nc"]').innerText()) === 'CC BY-NC 4.0' && (await dlg().locator('.sonido-libre', { hasText: 'Rain NC' }).innerText()).includes('Solo uso no comercial'));
  comprobar('La clave viaja en la cabecera Authorization (Token), nunca en la URL', llamadasFs.every((l) => l.cab.authorization === `Token ${CLAVE}` && !l.url.includes(CLAVE)));

  // ══ Escuchar la muestra ══
  await dlg().getByRole('button', { name: 'Escuchar heavy_rain_loop' }).click();
  await p.waitForFunction(() => window.__previaDFY && !window.__previaDFY.paused, null, { timeout: 8000 });
  comprobar('Escuchar: suena la muestra de Freesound', (await p.evaluate(() => window.__previaDFY.src)) === `${CDN}2_v1-hq.mp3`);
  await dlg().getByRole('button', { name: 'Parar heavy_rain_loop' }).click();
  comprobar('…y se puede parar', await p.evaluate(() => window.__previaDFY.paused));

  // ══ Añadir y reproducir en la mezcla ══
  const subidasAntes = peticionesSb.filter((x) => x.includes('/storage/')).length;
  await dlg().getByRole('button', { name: 'Añadir y reproducir heavy_rain_loop' }).click();
  await p.waitForFunction(() => window.__mezclaEstado().ambientes.some((c) => c.estado === 'sonando'), null, { timeout: 8000 });
  const rec = tablas.recursos.at(-1);
  comprobar('Añadir: recurso «url» con el MP3 de escucha y el id de Freesound', rec.origen === 'url' && rec.enlace === `${CDN}2_v1-hq.mp3#freesound=2` && rec.archivo_ruta === null && rec.duracion_ms === 420000, JSON.stringify(rec));
  comprobar('…con el crédito recuperable (id, título, autor, licencia y página)', rec.descripcion === 'Freesound #2 · «heavy_rain_loop» · autora · CC BY 4.0 · https://freesound.org/people/autora/sounds/2/', rec.descripcion);
  comprobar('…sin descargar ni subir nada a Supabase Storage', peticionesSb.filter((x) => x.includes('/storage/')).length === subidasAntes);
  let m = await mezcla();
  comprobar('…y suena en la mezcla (canal de ambiente, en bucle)', m.ambientes.length === 1 && m.voces[0].src === `${CDN}2_v1-hq.mp3` && !m.voces[0].pausado && m.voces[0].bucle);
  comprobar('…en la carpeta Ambientes con un nombre limpio', tablas.elementos.at(-1).tipo === 'ambiente' && tablas.elementos.at(-1).nombre === 'heavy rain loop');
  comprobar('El resultado ya indica que está en la biblioteca (sin duplicar)', await dlg().getByRole('button', { name: 'Reproducir heavy_rain_loop (ya en tu biblioteca)' }).isVisible());
  await dlg().getByRole('button', { name: 'Añadir Rain NC' }).click();
  await p.waitForTimeout(500);
  await p.screenshot({ path: CAPTURAS + 'buscar-sonidos.png' });

  // ══ Botón X, cabecera fija, Esc y foco ══
  const caja = async (loc) => loc.boundingBox();
  const x = () => dlg().getByRole('button', { name: 'Cerrar Buscar sonidos' });
  let d = await caja(dlg());
  let bx = await caja(x());
  comprobar('X visible arriba a la derecha de la ventana', bx && d.x + d.width - (bx.x + bx.width) < 40 && bx.y - d.y < 30 && bx.width >= 44, JSON.stringify({ d, bx }));
  await dlg().getByRole('button', { name: 'Escuchar Rain on roof.wav' }).click();
  await p.waitForFunction(() => window.__previaDFY && !window.__previaDFY.paused, null, { timeout: 8000 });
  await p.setViewportSize({ width: 1280, height: 520 });
  await dlg().evaluate((el) => { el.scrollTop = el.scrollHeight; });
  await p.waitForTimeout(150);
  d = await caja(dlg());
  const cab = await caja(dlg().locator('.buscar-cabecera'));
  comprobar('Al desplazar los resultados, la cabecera con la X sigue fija arriba', (await dlg().evaluate((el) => el.scrollTop)) > 0 && Math.abs(cab.y - d.y) < 2 && (await x().isVisible()), JSON.stringify({ d, cab }));
  await p.keyboard.press('Escape');
  await p.waitForTimeout(300);
  m = await mezcla();
  comprobar('Esc cierra la ventana', (await dlg().count()) === 0);
  comprobar('…para la muestra de Freesound pero no los ambientes de DFY', (await p.evaluate(() => window.__previaDFY.paused)) && m.ambientes.some((c) => c.estado === 'sonando') && m.voces.some((v) => v.capa === 'ambiente' && !v.pausado));
  comprobar('…y el foco vuelve al botón «Buscar sonidos»', (await p.evaluate(() => document.activeElement?.textContent?.trim())) === 'Buscar sonidos');
  await btn('Buscar sonidos').click();
  await dlg().waitFor();
  comprobar('Al abrir, el cursor va al buscador', (await p.evaluate(() => document.activeElement?.id)) === 'buscar-texto');
  await x().click();
  await p.waitForTimeout(300);
  comprobar('La X cierra la ventana', (await dlg().count()) === 0);
  await p.setViewportSize({ width: 390, height: 700 });
  await btn('Buscar sonidos').click();
  await dlg().waitFor();
  bx = await caja(x());
  comprobar('Móvil: la X se ve entera y es cómoda (≥ 44 px)', bx.x + bx.width <= 390 && bx.y >= 0 && bx.width >= 44 && bx.height >= 44, JSON.stringify(bx));
  await x().click();
  await p.setViewportSize({ width: 1280, height: 860 });
  await btn('Buscar sonidos').click();
  await dlg().waitFor();

  // Efectos
  await dlg().getByRole('button', { name: 'Efectos', exact: true }).click();
  await buscar('door');
  comprobar('Efectos: duración corta (hasta 1 min)', ultimaFs().searchParams.get('filter') === 'duration:[0 TO 60]' && (await titulos()).join() === 'Wooden door creak');
  await dlg().getByRole('button', { name: 'Añadir Wooden door creak' }).click();
  await p.waitForTimeout(500);
  await btn('Cerrar').click();
  await p.getByRole('button', { name: 'Lanzar efecto Wooden door creak' }).click();
  await p.waitForFunction(() => window.__mezclaEstado().efectos.length > 0, null, { timeout: 5000 });
  m = await mezcla();
  comprobar('El efecto de Freesound suena una vez, a la vez que el ambiente', m.efectos.length === 1 && m.ambientes.length === 1);

  // ══ Créditos visibles en la biblioteca y en el editor ══
  await btn('Sonidos').click();
  const creditos = await p.locator('.biblioteca-credito').allInnerTexts();
  comprobar('Biblioteca de sonidos: crédito con autor, licencia y enlace', creditos.some((c) => c.includes('«heavy_rain_loop» de autora') && c.includes('CC BY 4.0') && c.includes('Ver en Freesound')), creditos.join(' / '));
  comprobar('Biblioteca: el sonido NC está claramente marcado', creditos.some((c) => c.includes('CC BY-NC 4.0') && c.includes('Solo uso no comercial')));
  await btn('Cerrar').click();
  await p.getByRole('button', { name: 'Editar heavy rain loop' }).click();
  await p.waitForSelector('dialog[open] .fila-pista');
  comprobar('Editor: la pista muestra autor y licencia', (await p.locator('dialog[open] .fila-pista .fila-detalle').innerText()).includes('Freesound: autora · CC BY 4.0'));
  await btn('Cancelar').click();

  // ══ Enlace de escucha caducado: se vuelve a pedir por su id ══
  await p.getByRole('button', { name: 'Detener ambiente heavy rain loop' }).click();
  vivas.delete('2_v1');
  catalogo[2] = sonido(2, 'heavy_rain_loop', BY, 420, `${CDN}2_v2-hq.mp3`);
  vivas.add('2_v2');
  await p.reload();
  await p.waitForSelector('.tarjeta');
  await p.getByRole('button', { name: 'Activar ambiente heavy rain loop' }).click();
  await p.waitForFunction(() => window.__mezclaEstado().ambientes.some((c) => c.estado === 'sonando'), null, { timeout: 10000 }).catch(() => {});
  m = await mezcla();
  comprobar('Mezcla: MP3 caducado → pide el vigente a la API y suena', m.ambientes[0]?.estado === 'sonando' && m.voces[0]?.src === `${CDN}2_v2-hq.mp3` && llamadasFs.some((l) => l.url.includes('/sounds/2/')), JSON.stringify(m.voces));
  comprobar('…y guarda el enlace nuevo (sin perder el id ni el crédito)', tablas.recursos.find((r) => r.enlace.endsWith('#freesound=2'))?.enlace === `${CDN}2_v2-hq.mp3#freesound=2` && tablas.recursos.find((r) => r.enlace.endsWith('#freesound=2')).descripcion.startsWith('Freesound #2'));
  await p.getByRole('button', { name: 'Detener ambiente heavy rain loop' }).click();

  // Canal principal (carpeta normal) con un sonido de Freesound pegado a mano
  await crearElemento(p, { tipo: 'lugar', nombre: 'Lluvia en la ciudad', sonidos: [{ enlace: `${CDN}5_v1-hq.mp3#freesound=5` }] });
  vivas.delete('5_v1');
  catalogo[5] = sonido(5, 'city rain', CC0, 120, `${CDN}5_v2-hq.mp3`);
  vivas.add('5_v2');
  await p.reload();
  await p.waitForSelector('.tarjeta');
  await p.getByRole('button', { name: 'Reproducir Lluvia en la ciudad', exact: true }).click();
  await p.waitForFunction(() => window.__audioBandaSonora && !window.__audioBandaSonora.paused, null, { timeout: 10000 }).catch(() => {});
  comprobar('Canal principal: MP3 caducado → se recupera por la API y suena', (await p.evaluate(() => window.__audioBandaSonora.src)) === `${CDN}5_v2-hq.mp3` && (await p.locator('.reproductor-estado').innerText()).startsWith('Sonando'));
  await btn('Detener').click();
  vivas.delete('5_v2');
  delete catalogo[5];
  await p.reload();
  await p.waitForSelector('.tarjeta');
  await p.getByRole('button', { name: 'Reproducir Lluvia en la ciudad', exact: true }).click();
  await p.waitForTimeout(1500);
  comprobar('Sonido borrado de Freesound: error claro, sin reintentos sin fin', (await p.locator('.reproductor-estado').innerText()).startsWith('No se puede reproducir'));

  // ══ Límite de la API ══
  modoFs = 'limite';
  await btn('Buscar sonidos').click();
  await buscar('rain');
  comprobar('Límite de Freesound (429): mensaje claro con la espera', (await alerta()).includes('demasiadas búsquedas') && (await alerta()).includes('30 s'));
  modoFs = 'normal';
  await btn('Cerrar').click();

  // ══ Seguridad ══
  comprobar('Ninguna respuesta de /api/sonidos contiene la clave', respuestasApi.length > 5 && respuestasApi.every((x) => !x.cuerpo.includes(CLAVE) && !x.cabeceras.includes(CLAVE)));
  const archivos = ['dist-prueba', 'dist'].flatMap((d) => (fs.existsSync(path.join(__dirname, '..', d)) ? fs.readdirSync(path.join(__dirname, '..', d, 'assets')).map((f) => path.join(__dirname, '..', d, 'assets', f)) : []));
  comprobar('El código del navegador no contiene la clave ni su variable', archivos.length > 0 && archivos.every((f) => { const c = fs.readFileSync(f, 'utf8'); return !c.includes(CLAVE) && !c.includes('FREESOUND_API_KEY') }));
  const sinSesion = await atender(new Request('http://localhost:4174/api/sonidos?q=rain'));
  comprobar('Sin sesión la función no responde resultados (401)', sinSesion.status === 401);
  const ajena = await atender(new Request('http://localhost:4174/api/sonidos?q=rain', { headers: { authorization: `Bearer ${JWT}`, origin: 'https://otra-web.example' } }));
  comprobar('Desde otra web: rechazada (403)', ajena.status === 403);
  // Al salir, la búsqueda deja de tener sesión
  await p.getByRole('button', { name: 'Salir' }).click();
  await p.waitForSelector('.entrada');

  // ══ Modo local (sin cuentas): se explica ══
  const local = await ctx.newPage();
  await local.goto('http://localhost:4173/');
  await local.waitForSelector('.cabecera');
  await local.getByRole('button', { name: 'Buscar sonidos', exact: true }).click();
  await local.fill('#buscar-texto', 'rain');
  await local.locator('dialog.buscar-sonidos').getByRole('button', { name: 'Buscar', exact: true }).click();
  await local.waitForSelector('dialog.buscar-sonidos [role=alert]', { timeout: 5000 }).catch(() => {});
  comprobar('Modo local: explica que necesita la cuenta', (await local.locator('dialog.buscar-sonidos [role=alert]').innerText()).includes('modo local'));

  comprobar('Sin errores de JavaScript', errores.length === 0, errores.join(' / '));
  const f = fin();
  await b.close();
  process.exit(f ? 1 : 0);
})();
