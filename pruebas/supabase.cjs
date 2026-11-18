// Modo Supabase con un servidor simulado (PostgREST + Storage en memoria). No usa el Supabase real.
// Requiere: npm run build:prueba && npm run preview:prueba (puerto 4174).
const { chromium } = require('playwright');
const path = require('path');
const { wav, crearElemento, comprobador, CAPTURAS } = require('./ayuda.cjs');
const URL = 'http://localhost:4174/';
const SB = 'https://prueba.supabase.co';
const RETRATO = path.join(__dirname, '../public/iconos/dfy-192.png');
const { comprobar, fin } = comprobador();

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const exp = Math.floor(Date.now() / 1000) + 3600;
const UID = '11111111-1111-1111-1111-111111111111';
const usuario = { id: UID, aud: 'authenticated', role: 'authenticated', email: 'dm@example.com', user_metadata: { full_name: 'Máster de prueba' }, app_metadata: { provider: 'google' } };
const jwt = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: UID, exp, role: 'authenticated', aud: 'authenticated' })}.firma`;
const sesion = { access_token: jwt, token_type: 'bearer', expires_in: 3600, expires_at: exp, refresh_token: 'refresco', user: usuario };

// ── Servidor simulado ──
const tablas = { elementos: [], recursos: [], pistas: [] };
const archivos = new Map(); // "bucket/ruta" → { cuerpo, tipo }
const peticiones = [];
let fallar = null; // p. ej. { metodo: 'POST', ruta: '/rest/v1/pistas', modo: 'red' | 500 }
let sinTablas = false;
let n = 0;

/** supabase-js sube los Blob como multipart/form-data (como espera Supabase): se extrae el archivo. */
function extraerArchivo(cuerpo, tipo) {
  const limite = /boundary=(.+)$/.exec(tipo || '')?.[1];
  if (!limite) return { cuerpo, tipo };
  const sep = Buffer.from('--' + limite);
  let i = cuerpo.indexOf(sep);
  while (i !== -1) {
    const siguiente = cuerpo.indexOf(sep, i + sep.length);
    if (siguiente === -1) break;
    const parte = cuerpo.subarray(i + sep.length + 2, siguiente - 2);
    const corte = parte.indexOf('\r\n\r\n');
    const cabecera = parte.subarray(0, corte).toString();
    if (/filename=/.test(cabecera) || /content-type/i.test(cabecera))
      return { cuerpo: parte.subarray(corte + 4), tipo: /content-type:\s*(\S+)/i.exec(cabecera)?.[1] ?? 'application/octet-stream' };
    i = siguiente;
  }
  return { cuerpo, tipo };
}

async function servidor(r) {
  const req = r.request();
  const u = new globalThis.URL(req.url());
  const ruta = u.pathname.replace(/^\/(rest|storage)\/v1/, (m) => m);
  const metodo = req.method();
  const linea = `${metodo} ${u.pathname}${u.search}`;
  peticiones.push(linea);
  if (fallar && metodo === fallar.metodo && u.pathname.startsWith(fallar.ruta)) {
    if (fallar.modo === 'red') return r.abort('failed');
    return r.fulfill({ status: fallar.modo, json: { message: 'fallo simulado' } });
  }
  const t = u.pathname.match(/^\/rest\/v1\/(\w+)/)?.[1];
  if (t) {
    if (sinTablas) return r.fulfill({ status: 404, json: { code: 'PGRST205', message: `Could not find the table 'public.${t}' in the schema cache` } });
    const id = u.searchParams.get('id')?.replace('eq.', '');
    if (metodo === 'GET') return r.fulfill({ json: tablas[t] });
    if (metodo === 'POST') {
      const cuerpo = JSON.parse(req.postData());
      peticiones.push(`BODY ${t} ${req.postData()}`);
      const fila = { id: `${t}-${++n}`, ...cuerpo };
      tablas[t].push(fila);
      return r.fulfill({ status: 201, json: fila });
    }
    if (metodo === 'PATCH') {
      peticiones.push(`BODY ${t} ${req.postData()}`);
      tablas[t] = tablas[t].map((f) => (f.id === id ? { ...f, ...JSON.parse(req.postData()) } : f));
      return r.fulfill({ status: 204, body: '' });
    }
    if (metodo === 'DELETE') {
      tablas[t] = tablas[t].filter((f) => f.id !== id);
      if (t === 'elementos') tablas.pistas = tablas.pistas.filter((p) => p.elemento_id !== id);
      if (t === 'recursos') tablas.pistas = tablas.pistas.filter((p) => p.recurso_id !== id);
      return r.fulfill({ status: 204, body: '' });
    }
  }
  // Storage
  let m;
  if ((m = u.pathname.match(/^\/storage\/v1\/object\/sign\/(\w+)$/)) && metodo === 'POST') {
    const { paths } = JSON.parse(req.postData());
    return r.fulfill({ json: paths.map((p) => ({ path: p, error: null, signedURL: `/object/sign/${m[1]}/${p}?token=t` })) });
  }
  if ((m = u.pathname.match(/^\/storage\/v1\/object\/sign\/(\w+)\/(.+)$/))) {
    const a = archivos.get(`${m[1]}/${m[2]}`);
    return a ? r.fulfill({ status: 200, body: a.cuerpo, headers: { 'content-type': a.tipo, 'accept-ranges': 'none' } }) : r.fulfill({ status: 404, body: '' });
  }
  if ((m = u.pathname.match(/^\/storage\/v1\/object\/(\w+)\/(.+)$/)) && metodo === 'POST') {
    archivos.set(`${m[1]}/${m[2]}`, extraerArchivo(req.postDataBuffer(), req.headers()['content-type']));
    return r.fulfill({ json: { Key: `${m[1]}/${m[2]}`, Id: 'x' } });
  }
  if ((m = u.pathname.match(/^\/storage\/v1\/object\/(\w+)$/)) && metodo === 'DELETE') {
    const { prefixes } = JSON.parse(req.postData());
    peticiones.push(`BORRAR ${m[1]} ${prefixes.join(',')}`);
    prefixes.forEach((p) => archivos.delete(`${m[1]}/${p}`));
    return r.fulfill({ json: prefixes.map((p) => ({ name: p })) });
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
  const cuerpos = (t) => peticiones.filter((x) => x.startsWith(`BODY ${t} `)).map((x) => JSON.parse(x.slice(6 + t.length)));

  // 1) Sin sesión
  await p.goto(URL);
  await p.waitForSelector('.entrada');
  comprobar('Sin sesión pide entrar con Google', await p.getByRole('button', { name: 'Entrar con Google' }).isVisible());

  // 2) Con sesión pero sin ejecutar el SQL nuevo
  sinTablas = true;
  await p.evaluate((s) => {
    localStorage.setItem('sb-prueba-auth-token', s);
    localStorage.setItem('banda-sonora:canciones', JSON.stringify([{ tipo: 'personaje', nombre: 'Maela', enlace: 'https://youtu.be/dQw4w9WgXcQ', nota: 'Tema de Maela' }]));
  }, JSON.stringify(sesion));
  await p.reload();
  await p.waitForSelector('.aviso[role=alert]');
  comprobar('Sin el SQL nuevo: explica qué ejecutar', (await p.locator('.aviso[role=alert]').innerText()).includes('ejecuta bd/002-biblioteca.sql'));
  sinTablas = false;
  await p.reload();
  await p.waitForSelector('.cabecera');

  // 3) Subir datos antiguos del navegador
  await p.getByRole('button', { name: 'Subir a mi cuenta' }).click();
  await p.waitForTimeout(500);
  comprobar('Sube los datos antiguos (elemento + sonido + pista)', tablas.elementos.length === 1 && tablas.recursos.length === 1 && tablas.pistas.length === 1 && tablas.recursos[0].titulo === 'Tema de Maela');
  comprobar('Nunca envía user_id (lo pone la base de datos)', !peticiones.some((x) => x.startsWith('BODY') && x.includes('user_id')));

  // 4) Crear con retrato y archivo propio
  await crearElemento(p, {
    tipo: 'ambiente', nombre: 'Lluvia', retrato: RETRATO,
    sonidos: [{ archivo: { name: 'lluvia.wav', mimeType: 'audio/wav', buffer: wav(3) }, inicio: '0:01' }],
  });
  const subidas = [...archivos.keys()];
  comprobar('Sube el audio a su carpeta privada (audio/<usuario>/…)', subidas.some((k) => k.startsWith(`audio/${UID}/`) && k.endsWith('.wav')));
  comprobar('Sube el retrato reducido (retratos/<usuario>/….webp)', subidas.some((k) => k.startsWith(`retratos/${UID}/`) && k.endsWith('.webp')));
  const rec = cuerpos('recursos').at(-1);
  comprobar('Guarda ruta, tipo, tamaño y huella del archivo', rec.origen === 'archivo' && rec.archivo_ruta.startsWith(`${UID}/`) && rec.archivo_tipo === 'audio/wav' && /^[0-9a-f]{64}$/.test(rec.archivo_hash));
  comprobar('Pista con inicio 1 s y bucle (ambiente)', cuerpos('pistas').at(-1).inicio_ms === 1000 && cuerpos('pistas').at(-1).bucle === true);
  await p.screenshot({ path: CAPTURAS + 'supabase.png' });

  // 5) Reproducir el archivo privado con URL firmada (fase 2: un ambiente con archivo suena en la mezcla)
  await p.getByRole('button', { name: 'Activar ambiente Lluvia' }).click();
  await p.waitForFunction(() => window.__mezclaDFY && window.__mezclaDFY.diagnostico().some((v) => v.capa === 'ambiente' && !v.pausado), null, { timeout: 8000 });
  comprobar('Reproduce el archivo con una URL firmada temporal', peticiones.some((x) => x.startsWith('POST /storage/v1/object/sign/audio')) && (await p.evaluate(() => window.__mezclaDFY.diagnostico()[0].src)).includes('/object/sign/audio/'));
  await p.getByRole('button', { name: 'Detener ambiente Lluvia' }).click();

  // 6) Fallo de red a mitad de un guardado: avisa, no se pierde lo guardado y el reintento no duplica
  fallar = { metodo: 'POST', ruta: '/rest/v1/pistas', modo: 'red' };
  await p.getByRole('button', { name: /^Añadir lugar/ }).click();
  await p.fill('#ed-nombre', 'Puerto');
  await p.fill('#nuevo-enlace', 'https://youtu.be/dQw4w9WgXcQ');
  await p.getByRole('button', { name: 'Añadir enlace' }).click();
  await p.waitForSelector('.fila-pista');
  await p.getByRole('button', { name: 'Guardar', exact: true }).click();
  await p.waitForSelector('dialog[open] .aviso[role=alert]');
  comprobar('Fallo de red: la ventana sigue abierta y lo explica', (await p.locator('dialog[open] .aviso').innerText()).includes('Revisa la conexión'));
  fallar = null;
  await p.getByRole('button', { name: 'Guardar', exact: true }).click();
  await p.waitForSelector('dialog[open]', { state: 'detached' });
  comprobar('Reintento: no duplica el elemento y guarda la pista', tablas.elementos.filter((e) => e.nombre === 'Puerto').length === 1 && tablas.pistas.some((x) => x.elemento_id === tablas.elementos.find((e) => e.nombre === 'Puerto').id));
  comprobar('Reutiliza el sonido de YouTube ya existente', tablas.recursos.filter((x) => x.origen === 'youtube').length === 1);

  // 7) Si falla el registro del sonido tras subir el archivo, se borra el archivo subido
  fallar = { metodo: 'POST', ruta: '/rest/v1/recursos', modo: 500 };
  await p.getByRole('button', { name: 'Editar Puerto' }).click();
  await p.getByRole('button', { name: 'Archivo propio' }).click();
  await p.setInputFiles('input[aria-label="Archivos de audio"]', { name: 'gaviotas.wav', mimeType: 'audio/wav', buffer: wav(2) });
  await p.getByRole('button', { name: 'Guardar', exact: true }).click();
  await p.waitForSelector('dialog[open] .aviso[role=alert]');
  comprobar('Sin huérfanos: borra el archivo si no se pudo registrar', peticiones.some((x) => x.startsWith(`BORRAR audio ${UID}/`)) && ![...archivos.keys()].some((k) => k.includes('gaviotas')) && [...archivos.keys()].filter((k) => k.startsWith('audio/')).length === 1);
  fallar = null;
  await p.getByRole('button', { name: 'Cancelar' }).click();

  // 8) Error al borrar: se deshace y avisa
  fallar = { metodo: 'DELETE', ruta: '/rest/v1/elementos', modo: 500 };
  await p.getByRole('button', { name: 'Editar Puerto' }).click();
  await p.getByRole('button', { name: 'Eliminar lugar' }).click();
  await p.locator('.confirmar').getByRole('button', { name: 'Eliminar' }).click();
  await p.waitForSelector('main .aviso[role=alert]');
  comprobar('Borrar sin conexión: la tarjeta vuelve y avisa', (await p.locator('.tarjeta', { hasText: 'Puerto' }).count()) === 1);
  fallar = null;
  await p.getByRole('button', { name: 'Cerrar aviso' }).click();

  // 9) Eliminar elemento: borra su retrato, conserva sus sonidos
  await p.getByRole('button', { name: 'Editar Lluvia' }).click();
  await p.getByRole('button', { name: 'Eliminar ambiente' }).click();
  await p.locator('.confirmar').getByRole('button', { name: 'Eliminar' }).click();
  await p.waitForTimeout(400);
  comprobar('Eliminar elemento: borra su retrato y conserva el sonido', peticiones.some((x) => x.startsWith(`BORRAR retratos ${UID}/`)) && tablas.recursos.some((x) => x.origen === 'archivo'));

  // 10) Borrar el sonido desde la biblioteca: borra la fila y el archivo
  await p.getByRole('button', { name: 'Sonidos' }).click();
  await p.locator('.biblioteca-lista li', { hasText: 'Archivo' }).getByRole('button', { name: 'Borrar' }).click();
  await p.getByRole('button', { name: 'Borrar definitivamente' }).click();
  await p.waitForTimeout(400);
  comprobar('Borrar sonido: fila y archivo', !tablas.recursos.some((x) => x.origen === 'archivo') && ![...archivos.keys()].some((k) => k.startsWith('audio/')));
  await p.getByRole('button', { name: 'Cerrar' }).click();

  // 11) Salir
  await p.getByRole('button', { name: 'Salir' }).click();
  await p.waitForSelector('.entrada');
  comprobar('Salir cierra la sesión', peticiones.some((x) => x.startsWith('POST /auth/v1/logout')));

  comprobar('Sin errores de JavaScript', errores.length === 0, errores.join(' / '));
  const f = fin();
  await b.close();
  process.exit(f ? 1 : 0);
})();
