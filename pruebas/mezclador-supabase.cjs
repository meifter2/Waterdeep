// Mezclador con Supabase simulado (preview 4174): enlaces privados caducados, cargas lentas canceladas y cerrar sesión.
// No usa el Supabase real. Requiere: npm run build:prueba && npm run preview:prueba.
const { chromium } = require('playwright');
const { wav, comprobador } = require('./ayuda.cjs');
const URL = 'http://localhost:4174/';
const SB = 'https://prueba.supabase.co';
const { comprobar, fin } = comprobador();

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const exp = Math.floor(Date.now() / 1000) + 3600;
const UID = '11111111-1111-1111-1111-111111111111';
const usuario = { id: UID, aud: 'authenticated', role: 'authenticated', email: 'dm@example.com', user_metadata: {}, app_metadata: { provider: 'email' } };
const jwt = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: UID, exp, role: 'authenticated', aud: 'authenticated' })}.firma`;
const sesion = { access_token: jwt, token_type: 'bearer', expires_in: 3600, expires_at: exp, refresh_token: 'refresco', user: usuario };

// ── Datos ya guardados en la «nube» ──
const tablas = { elementos: [], recursos: [], pistas: [], sesiones: [], sesion_elementos: [], elementos_comunes: [] };
const archivos = new Map();
let n = 0;
function crear(tipo, nombre, segundos, { existe = true } = {}) {
  const id = `x${++n}`;
  const ruta = `${UID}/${nombre.toLowerCase()}.wav`;
  tablas.elementos.push({ id: 'el-' + id, tipo, nombre, descripcion: '', retrato_ruta: null, orden: n });
  tablas.recursos.push({ id: 're-' + id, origen: 'archivo', titulo: nombre.toLowerCase(), descripcion: '', enlace: '', archivo_ruta: ruta, archivo_nombre: nombre + '.wav', archivo_tipo: 'audio/wav', archivo_bytes: 1, archivo_hash: null, duracion_ms: null });
  tablas.pistas.push({ id: 'pi-' + id, elemento_id: 'el-' + id, recurso_id: 're-' + id, etiqueta: '', inicio_ms: null, fin_ms: null, bucle: tipo !== 'efecto', orden: 0 });
  if (existe) archivos.set(ruta, wav(segundos));
}
crear('lugar', 'Taberna', 20);
crear('lugar', 'Mercado', 21);
crear('ambiente', 'Lluvia', 6);
crear('ambiente', 'Viento', 7);
crear('ambiente', 'Perdido', 8, { existe: false });
crear('efecto', 'Puerta', 1);

// ── Servidor simulado ──
const peticiones = [];
let firmas = 0;
const caducadas = new Set(); // tokens que el servidor rechaza (como un enlace firmado caducado)
let caducarSiguiente = 0; // cuántas de las próximas firmas nacen ya caducadas
let retrasoFirma = 0;

async function servidor(r) {
  const req = r.request();
  const u = new globalThis.URL(req.url());
  const metodo = req.method();
  peticiones.push(`${metodo} ${u.pathname}${u.search}`);
  const t = u.pathname.match(/^\/rest\/v1\/(\w+)/)?.[1];
  if (t && metodo === 'GET') return r.fulfill({ json: tablas[t] });
  let m;
  if ((m = u.pathname.match(/^\/storage\/v1\/object\/sign\/(\w+)$/)) && metodo === 'POST') {
    const { paths } = JSON.parse(req.postData());
    if (retrasoFirma) await new Promise((ok) => setTimeout(ok, retrasoFirma));
    return r.fulfill({
      json: paths.map((p) => {
        const token = `t${++firmas}`;
        if (caducarSiguiente > 0) {
          caducarSiguiente--;
          caducadas.add(token);
        }
        return { path: p, error: null, signedURL: `/object/sign/${m[1]}/${p}?token=${token}` };
      }),
    });
  }
  if ((m = u.pathname.match(/^\/storage\/v1\/object\/sign\/audio\/(.+)$/))) {
    const token = u.searchParams.get('token');
    if (caducadas.has(token)) return r.fulfill({ status: 400, json: { statusCode: '400', error: 'InvalidJWT', message: 'jwt expired' } });
    const a = archivos.get(decodeURIComponent(m[1]));
    return a ? r.fulfill({ status: 200, body: a, headers: { 'content-type': 'audio/wav', 'accept-ranges': 'none' } }) : r.fulfill({ status: 404, json: { message: 'Object not found' } });
  }
  if (u.pathname.startsWith('/auth/v1/')) return r.fulfill(u.pathname.includes('/user') ? { json: usuario } : { status: 204, body: '' });
  return r.fulfill({ status: 404, body: '' });
}

(async () => {
  const b = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const ctx = await b.newContext({ viewport: { width: 1280, height: 860 } });
  await ctx.route(SB + '/**', servidor);
  await ctx.route(/open\.spotify\.com|youtube\.com/, (r) => r.fulfill({ body: '' }));
  const p = await ctx.newPage();
  const errores = [];
  p.on('pageerror', (e) => errores.push(String(e)));
  await p.goto(URL);
  await p.evaluate((s) => { localStorage.setItem('sb-prueba-auth-token', s); localStorage.setItem('banda-sonora:mezcla', JSON.stringify({ transicion: 'instantaneo', entrada: 0, salida: 0 })); }, JSON.stringify(sesion)); // fundidos: al final
  await p.reload();
  await p.waitForSelector('.tarjeta');

  const estado = () =>
    p.evaluate(() => {
      const e = window.__mezclaEstado();
      const d = window.__mezclaDFY ? window.__mezclaDFY.diagnostico() : [];
      const a = window.__audioBandaSonora;
      return {
        amb: e.ambientes.map((c) => ({ nombre: c.nombre, estado: c.estado, aviso: c.aviso, ...(d.find((x) => x.id === c.id) || {}) })),
        ef: e.efectos.map((v) => ({ nombre: v.nombre, estado: v.estado })),
        voces: d,
        principal: a ? { pausado: a.paused, src: a.src } : null,
      };
    });
  const ambiente = (x) => p.getByRole('button', { name: new RegExp(`^(Activar|Detener) ambiente ${x}$`) });
  const firmasDe = () => peticiones.filter((x) => x.startsWith('POST /storage/v1/object/sign/audio')).length;
  const audibles = (s) => s.voces.filter((v) => !v.pausado).length + (s.principal && !s.principal.pausado ? 1 : 0);

  // ══ Enlace privado caducado: se pide uno nuevo y sigue sonando ══
  caducarSiguiente = 1;
  let antes = firmasDe();
  await ambiente('Lluvia').click();
  await p.waitForFunction(() => window.__mezclaEstado().ambientes.some((c) => c.estado === 'sonando'), null, { timeout: 8000 }).catch(() => {});
  let s = await estado();
  comprobar('Ambiente con enlace caducado: pide un enlace nuevo y suena', s.amb[0]?.estado === 'sonando' && !s.amb[0].pausado && firmasDe() - antes === 2 && !s.amb[0].src.includes(`token=t${antes + 1}`), JSON.stringify(s.amb));

  caducarSiguiente = 1;
  antes = firmasDe();
  await p.getByRole('button', { name: 'Lanzar efecto Puerta' }).click();
  await p.waitForFunction(() => window.__mezclaEstado().efectos.some((v) => v.estado === 'sonando'), null, { timeout: 8000 }).catch(() => {});
  comprobar('Efecto con enlace caducado: también se renueva y suena', (await estado()).ef[0]?.estado === 'sonando' && firmasDe() - antes === 2);

  // Archivo que ya no está en el almacén: tras un reintento, se queda en error y lo explica.
  await ambiente('Perdido').click();
  await p.waitForFunction(() => window.__mezclaEstado().ambientes.some((c) => c.estado === 'error'), null, { timeout: 8000 }).catch(() => {});
  s = await estado();
  const perdido = s.amb.find((c) => c.nombre === 'Perdido');
  comprobar('Archivo inexistente en Storage: el canal queda en error, sin bucles de reintentos', perdido?.estado === 'error' && !!perdido.aviso && perdido.pausado !== false, JSON.stringify(perdido));
  comprobar('…y los demás canales siguen sonando', s.amb.find((c) => c.nombre === 'Lluvia')?.pausado === false);
  await p.waitForTimeout(800);
  const firmasQuietas = firmasDe();
  await p.waitForTimeout(800);
  comprobar('…sin seguir pidiendo enlaces', firmasDe() === firmasQuietas);
  await ambiente('Perdido').click(); // con error, pulsar reintenta
  await p.waitForTimeout(800);
  await p.locator('.boton-mezcla').click();
  await p.getByRole('button', { name: 'Detener Perdido' }).click();
  await ambiente('Lluvia').click();
  await p.waitForTimeout(200);

  // ══ Cargas lentas: lo que se cancela no llega a sonar ══
  retrasoFirma = 900;
  await ambiente('Viento').click();
  await p.waitForTimeout(200);
  await ambiente('Viento').click(); // detener mientras aún se pide el enlace
  await p.waitForTimeout(1300);
  s = await estado();
  comprobar('Ambiente detenido mientras cargaba: no suena al llegar el enlace', s.amb.length === 0 && audibles(s) === 0, JSON.stringify(s.voces));

  // Taberna y Mercado sin enlaces guardados aún: las dos tienen que pedirlo (lento).
  await p.getByRole('button', { name: 'Reproducir Taberna', exact: true }).click();
  await p.waitForTimeout(150);
  await p.getByRole('button', { name: 'Reproducir Mercado', exact: true }).click();
  await p.waitForFunction(() => window.__audioBandaSonora && !window.__audioBandaSonora.paused, null, { timeout: 8000 });
  await p.waitForTimeout(1200);
  s = await estado();
  comprobar('Música: de dos cargas lentas seguidas solo suena la última', s.principal.src.includes('mercado') && !s.principal.pausado && (await p.locator('.reproductor-titulo').innerText()) === 'Mercado', s.principal.src);
  retrasoFirma = 0;

  // ══ Cerrar sesión con todo sonando y EN MITAD de fundidos (preajuste Suave) ══
  await p.evaluate(() => localStorage.setItem('banda-sonora:mezcla', JSON.stringify({ transicion: 'suave', entrada: 3, salida: 3 })));
  await p.reload();
  await p.waitForSelector('.tarjeta');
  await p.getByRole('button', { name: 'Reproducir Taberna', exact: true }).click();
  await p.waitForFunction(() => window.__audioBandaSonora && !window.__audioBandaSonora.paused, null, { timeout: 8000 });
  await ambiente('Lluvia').click();
  await ambiente('Viento').click();
  await p.waitForFunction(() => window.__mezclaEstado().ambientes.filter((c) => c.estado === 'sonando').length === 2, null, { timeout: 8000 });
  await ambiente('Viento').click(); // se apaga con fundido
  await p.getByRole('button', { name: 'Reproducir Mercado', exact: true }).click(); // crossfade
  await p.waitForFunction(() => window.__musicaDFY.diagnostico().filter((m) => !m.pausado && m.src).length === 2, null, { timeout: 8000 }).catch(() => {});
  await p.getByRole('button', { name: 'Lanzar efecto Puerta' }).click();
  await p.waitForTimeout(200);
  s = await estado();
  const enCruce = await p.evaluate(() => window.__musicaDFY.diagnostico().filter((m) => !m.pausado && m.src).length);
  comprobar('Antes de salir: dos músicas cruzándose, un ambiente, otro apagándose y un efecto', enCruce === 2 && s.voces.filter((v) => !v.pausado).length >= 3, `${enCruce} ${s.voces.length}`);
  await p.getByRole('button', { name: 'Salir' }).click();
  await p.waitForSelector('.entrada');
  await p.waitForTimeout(400);
  s = await estado();
  comprobar('Al cerrar sesión no queda nada sonando y se sueltan los archivos', audibles(s) === 0 && s.voces.length === 0 && s.amb.length === 0 && s.ef.length === 0, JSON.stringify(s));
  comprobar('…tampoco las dos músicas del cruce', await p.evaluate(() => window.__musicaDFY.diagnostico().every((m) => m.pausado && !m.src)));
  comprobar('…y se cierra la sesión de verdad', peticiones.some((x) => x.startsWith('POST /auth/v1/logout')));

  comprobar('Sin errores de JavaScript', errores.length === 0, errores.join(' / '));
  const f = fin();
  await b.close();
  process.exit(f ? 1 : 0);
})();
