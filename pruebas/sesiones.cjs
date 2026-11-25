// Organización por sesiones (bd/004): modo local (4173) y Supabase simulado (4174).
// Crea, renombra, finaliza y borra sesiones; una tarjeta en varias sin duplicarse; comunes; quitar sin borrar;
// selección en bloque; creación dentro de una sesión; orden; copias; recarga y nuevo inicio de sesión; sin bd/004;
// y que cambiar de sesión no corta lo que suena. (El aislamiento RLS entre usuarios está en pruebas/sql.test.mjs.)
const { chromium } = require('playwright');
const { wav, comprobador } = require('./ayuda.cjs');
const WEB = 'https://sonidos.dfy.test/';
const SB = 'https://prueba.supabase.co';
const CLAVE = 'banda-sonora:biblioteca';
const { comprobar, fin } = comprobador();

// Biblioteca «antigua» (v4 sin sesiones): 4 lugares y 1 ambiente con enlaces de audio.
const nombres = ['Alfa', 'Beta', 'Gamma', 'Delta'];
const recurso = (id, t) => ({ id, origen: 'url', titulo: t, descripcion: '', enlace: WEB + t.toLowerCase() + '.wav', archivo_ruta: null, archivo_nombre: '', archivo_tipo: '', archivo_bytes: null, archivo_hash: null, duracion_ms: null });
const antigua = {
  version: 4,
  elementos: [...nombres.map((x, i) => ({ id: `el-${i}`, tipo: 'lugar', nombre: x, descripcion: '', retrato_ruta: null, orden: 0 })), { id: 'el-amb', tipo: 'ambiente', nombre: 'Lluvia', descripcion: '', retrato_ruta: null, orden: 0 }],
  recursos: [...nombres.map((x, i) => recurso(`re-${i}`, x)), recurso('re-amb', 'Lluvia')],
  pistas: [...nombres.map((_, i) => ({ id: `pi-${i}`, elemento_id: `el-${i}`, recurso_id: `re-${i}`, etiqueta: '', inicio_ms: null, fin_ms: null, bucle: true, orden: 0 })), { id: 'pi-amb', elemento_id: 'el-amb', recurso_id: 're-amb', etiqueta: '', inicio_ms: null, fin_ms: null, bucle: true, orden: 0 }],
};

async function preparar(b, url) {
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.route(WEB + '**', (r) => r.fulfill({ status: 200, body: wav(30), headers: { 'content-type': 'audio/wav', 'accept-ranges': 'none' } }));
  await ctx.route(/oembed/, (r) => r.fulfill({ json: {} }));
  const p = await ctx.newPage();
  const errores = [];
  p.on('pageerror', (e) => errores.push(String(e)));
  return { ctx, p, errores, url };
}

const ayudas = (p) => {
  const boton = (n, exact = true) => p.getByRole('button', { name: n, exact });
  const chip = (n) => p.locator('.sesion-chip', { hasText: n });
  const visibles = () => p.locator('.biblioteca .tarjeta .tarjeta-nombre').allInnerTexts();
  const guardado = () => p.evaluate((k) => JSON.parse(localStorage.getItem(k)), CLAVE);
  const seleccionar = async (...ns) => {
    for (const n of ns) await p.getByRole('button', { name: new RegExp(`^Seleccionar ${n}\\b`) }).click();
  };
  const audio = () => p.evaluate(() => { const a = window.__audioBandaSonora; return a ? { src: a.src, pausado: a.paused, t: a.currentTime } : null; });
  const nuevaSesion = async (nombre) => {
    await boton('+ Nueva sesión').click();
    await p.waitForSelector('dialog[open] #sesion-nombre');
    const propuesto = await p.inputValue('#sesion-nombre');
    if (nombre) await p.fill('#sesion-nombre', nombre);
    await boton('Crear sesión').click();
    await p.waitForSelector('dialog[open]', { state: 'detached' });
    return propuesto;
  };
  return { boton, chip, visibles, guardado, seleccionar, audio, nuevaSesion };
};

const orden = (l) => [...l].sort().join(',');

(async () => {
  const b = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });

  // ═════════════ Modo local ═════════════
  {
    const { p, errores } = await preparar(b);
    const { boton, chip, visibles, guardado, seleccionar, audio, nuevaSesion } = ayudas(p);
    await p.goto('http://localhost:4173/');
    await p.evaluate(([k, v]) => { localStorage.setItem(k, v); localStorage.setItem('banda-sonora:mezcla', JSON.stringify({ transicion: 'instantaneo', entrada: 0, salida: 0 })); }, [CLAVE, JSON.stringify(antigua)]);
    await p.reload();
    await p.waitForSelector('.tarjeta');

    // ── Biblioteca antigua sin sesiones ──
    comprobar('Biblioteca antigua: todo sigue en «Main»', orden(await visibles()) === orden([...nombres, 'Lluvia']));
    comprobar('«Main» elegida y sin sesiones creadas', (await chip('Main').getAttribute('aria-pressed')) === 'true' && (await p.locator('.sesion-chip').count()) === 2);
    comprobar('No se asigna nada automáticamente', !((await guardado()).sesion_elementos ?? []).length && !((await guardado()).elementos_comunes ?? []).length);

    // ── Reproducir y cambiar de sesión no corta el sonido ──
    await boton('Reproducir Beta').click();
    await p.waitForFunction(() => window.__audioBandaSonora && !window.__audioBandaSonora.paused && window.__audioBandaSonora.currentTime > 0.2, null, { timeout: 10000 });
    const antes = await audio();

    // ── Crear sesión (nombre propuesto) ──
    const propuesto = await nuevaSesion();
    comprobar('Nueva sesión propone «Sesión 1»', propuesto === 'Sesión 1', propuesto);
    comprobar('Al crearla queda elegida e identificada', (await chip('Sesión 1').getAttribute('aria-pressed')) === 'true' && (await p.locator('.sesiones-estado').innerText()).includes('Sesión 1'));
    comprobar('Sesión nueva vacía: no muestra tarjetas', (await visibles()).length === 0 && (await p.locator('.seccion-vacia-texto', { hasText: 'Sesión 1' }).count()) > 0);
    const despues = await audio();
    comprobar('Cambiar de sesión no detiene ni reinicia lo que suena', despues && !despues.pausado && despues.src === antes.src && despues.t >= antes.t, JSON.stringify([antes, despues]));
    await boton('Detener').click();

    // ── Renombrar y crear otra ──
    await boton('Gestionar sesiones').click();
    await p.getByLabel('Nombre de Sesión 1').fill('Sesión 1: el muelle');
    await p.getByLabel('Nombre de Sesión 1').press('Enter');
    await boton('Cerrar').click();
    comprobar('Renombrar sesión', (await chip('Sesión 1: el muelle').count()) === 1 && (await guardado()).sesiones[0].nombre === 'Sesión 1: el muelle');
    comprobar('La siguiente propone «Sesión 2»', (await nuevaSesion()) === 'Sesión 2');

    // ── Traer tarjetas de Main a una sesión (selección en bloque) ──
    await chip('Sesión 1: el muelle').click();
    await boton('Traer tarjetas de Main').click();
    comprobar('«Traer tarjetas» abre Main en modo selección', (await chip('Main').getAttribute('aria-pressed')) === 'true' && (await p.locator('.seleccion').count()) === 1);
    comprobar('Destino propuesto: la sesión desde la que se vino', (await p.locator('#seleccion-destino option:checked').innerText()) === 'Sesión 1: el muelle');
    await seleccionar('Alfa', 'Beta', 'Lluvia');
    comprobar('Seleccionar no reproduce', (await audio())?.pausado !== false);
    await boton('Añadir a la sesión').click();
    await p.waitForTimeout(200);
    comprobar('Añadir en bloque', (await guardado()).sesion_elementos.length === 3);
    // La misma tarjeta, también en la Sesión 2 (sin duplicarse)
    await boton('Hecho').click();
    await boton('Seleccionar tarjetas').click();
    await seleccionar('Beta', 'Gamma');
    await p.selectOption('#seleccion-destino', { label: 'Sesión 2' });
    await boton('Añadir a la sesión').click();
    await p.waitForTimeout(200);
    comprobar('En modo selección se ve en qué sesiones está cada tarjeta', (await p.locator('.tarjeta', { hasText: 'Beta' }).locator('.tarjeta-donde').innerText()) === 'Sesión 1: el muelle, Sesión 2');
    await boton('Hecho').click();
    const g1 = await guardado();
    comprobar('Una tarjeta en varias sesiones sin duplicar tarjetas, sonidos ni pistas', g1.elementos.length === 5 && g1.recursos.length === 5 && g1.pistas.length === 5 && g1.sesion_elementos.filter((r) => r.elemento_id === 'el-1').length === 2);

    await chip('Sesión 1: el muelle').click();
    comprobar('Sesión 1 muestra solo sus tarjetas', orden(await visibles()) === orden(['Alfa', 'Beta', 'Lluvia']));
    await chip('Sesión 2').click();
    comprobar('Sesión 2 muestra solo las suyas', orden(await visibles()) === orden(['Beta', 'Gamma']));

    // ── Común ──
    await boton('Seleccionar tarjetas').click();
    await boton('Seleccionar todas las visibles').click();
    comprobar('Seleccionar todas las visibles', (await p.locator('.tarjeta[data-seleccionada]').count()) === 2);
    await boton('Terminar selección').click();
    await chip('Main').click();
    await boton('Seleccionar tarjetas').click();
    await seleccionar('Delta');
    await boton('Común a todas las sesiones').click();
    await p.waitForTimeout(150);
    await boton('Hecho').click();
    await chip('Sesión 1: el muelle').click();
    comprobar('Común aparece en todas las sesiones', (await visibles()).includes('Delta') && (await p.locator('.tarjeta', { hasText: 'Delta' }).locator('.tarjeta-comun').count()) === 1);
    await chip('Sesión 2').click();
    comprobar('… también en la otra', (await visibles()).includes('Delta'));

    // ── Quitar de una sesión sin borrar ──
    await chip('Sesión 1: el muelle').click();
    await boton('Seleccionar tarjetas').click();
    await seleccionar('Alfa');
    await boton('Quitar de «Sesión 1: el muelle»').click();
    await p.waitForTimeout(150);
    await boton('Hecho').click();
    const g2 = await guardado();
    comprobar('Quitar de una sesión no borra la tarjeta ni su sonido', !(await visibles()).includes('Alfa') && g2.elementos.some((e) => e.nombre === 'Alfa') && g2.pistas.some((x) => x.elemento_id === 'el-0') && g2.recursos.some((r) => r.id === 're-0'));

    // ── Reordenar dentro de la sesión (teclado) ──
    await chip('Sesión 2').click();
    const antesOrden = await p.locator('.seccion-lugar .tarjeta-nombre').allInnerTexts();
    const ultimo = antesOrden[antesOrden.length - 1];
    await boton(`Mover ${ultimo}`).focus();
    await p.keyboard.press('Space');
    for (let i = 0; i < antesOrden.length; i++) await p.keyboard.press('ArrowLeft');
    await p.keyboard.press('Space');
    await p.waitForTimeout(200);
    const trasOrden = await p.locator('.seccion-lugar .tarjeta-nombre').allInnerTexts();
    comprobar('Reordenar dentro de una sesión', trasOrden[0] === ultimo, `${antesOrden} → ${trasOrden}`);
    await chip('Main').click();
    const completo = await p.locator('.seccion-lugar .tarjeta-nombre').allInnerTexts();
    const ordenSesion = completo.filter((x) => trasOrden.includes(x));
    comprobar('… y el orden completo de la carpeta lo respeta sin perder tarjetas', completo.length === 4 && ordenSesion.join() === trasOrden.join(), completo.join());

    // ── Crear dentro de una sesión ──
    await chip('Sesión 2').click();
    await p.getByRole('button', { name: /^Añadir lugar/ }).first().click();
    await p.waitForSelector('dialog[open] #ed-nombre');
    comprobar('Editor: la sesión elegida viene marcada', await p.getByLabel('Sesión 2', { exact: true }).isChecked());
    await p.fill('#ed-nombre', 'Taberna');
    await boton('Guardar').click();
    await p.waitForSelector('dialog[open]', { state: 'detached' });
    await p.waitForTimeout(150);
    comprobar('Una tarjeta creada en una sesión queda en ella', (await visibles()).includes('Taberna'));
    await p.getByRole('button', { name: /^Añadir lugar/ }).first().click();
    await p.fill('#ed-nombre', 'Puerto');
    await p.getByLabel('Común a todas las sesiones').check();
    await boton('Guardar').click();
    await p.waitForSelector('dialog[open]', { state: 'detached' });
    await p.waitForTimeout(150);
    const g3 = await guardado();
    const puerto = g3.elementos.find((e) => e.nombre === 'Puerto');
    comprobar('… salvo que se marque común (sin relaciones, en todas)', g3.elementos_comunes.some((c) => c.elemento_id === puerto.id) && !g3.sesion_elementos.some((r) => r.elemento_id === puerto.id));

    // ── Editor: cambiar las sesiones de una tarjeta existente ──
    await boton('Editar Gamma').click();
    await p.getByLabel('Sesión 1: el muelle', { exact: true }).check();
    await p.getByLabel('Sesión 2', { exact: true }).uncheck();
    await boton('Guardar').click();
    await p.waitForSelector('dialog[open]', { state: 'detached' });
    await p.waitForTimeout(150);
    comprobar('Editor: mover una tarjeta de sesión', !(await visibles()).includes('Gamma'));

    // ── Finalizada ──
    await boton('Gestionar sesiones').click();
    await p.locator('.sesion-fila', { has: p.getByLabel('Nombre de Sesión 1: el muelle') }).getByLabel('Finalizada').check();
    await boton('Cerrar').click();
    await chip('Sesión 1: el muelle').click();
    comprobar('Finalizada: se atenúa pero sigue accesible', (await chip('Sesión 1: el muelle').getAttribute('data-finalizada')) === 'true' && (await visibles()).includes('Beta'));
    await boton('Reproducir Beta').click();
    await p.waitForFunction(() => window.__audioBandaSonora && !window.__audioBandaSonora.paused, null, { timeout: 10000 });
    comprobar('Finalizada: se puede reproducir', true);
    await boton('Detener').click();

    // ── Recarga ──
    await p.reload();
    await p.waitForSelector('.sesion-chip');
    comprobar('Tras recargar: sesión elegida y su contenido', (await chip('Sesión 1: el muelle').getAttribute('aria-pressed')) === 'true' && orden(await visibles()) === orden(['Beta', 'Lluvia', 'Delta', 'Puerto', 'Gamma']));
    comprobar('Tras recargar no suena nada', (await audio())?.pausado !== false);

    // ── Copias: exportar con sesiones ──
    const copia = await p.evaluate((k) => localStorage.getItem(k), CLAVE);
    const c = JSON.parse(copia);
    comprobar('La copia incluye sesiones, relaciones y comunes', c.sesiones.length === 2 && c.sesion_elementos.length > 0 && c.elementos_comunes.length === 2);

    // ── Eliminar una sesión ──
    await boton('Gestionar sesiones').click();
    const fila = p.locator('.sesion-fila', { has: p.getByLabel('Nombre de Sesión 2') });
    await fila.getByRole('button', { name: 'Eliminar Sesión 2' }).click();
    const pregunta = await fila.locator('.confirmar p').innerText();
    comprobar('Confirmación clara al eliminar', pregunta.includes('Solo se borra la organización') && pregunta.includes('Main'));
    await boton('Eliminar sesión').click();
    await boton('Cerrar').click();
    const g4 = await guardado();
    comprobar('Eliminar sesión: no se pierden tarjetas, sonidos ni pistas', g4.sesiones.length === 1 && g4.elementos.length === 7 && g4.recursos.length === 5 && g4.pistas.length === 5 && !g4.sesion_elementos.some((r) => !g4.sesiones.some((s) => s.id === r.sesion_id)));

    // ── Importar copias en un navegador limpio ──
    const { p: q, errores: errores2 } = await preparar(b);
    const h = ayudas(q);
    await q.goto('http://localhost:4173/');
    await q.waitForSelector('.sesion-chip');
    await h.boton('Copias').click();
    await q.getByLabel('Pega aquí el texto de una copia').fill(JSON.stringify(antigua));
    await h.boton('Comprobar texto').click();
    await h.boton('Añadir').click();
    await q.waitForTimeout(400);
    comprobar('Importar una copia antigua (sin sesiones)', (await h.guardado()).elementos.length === 5 && (await h.guardado()).sesiones.length === 0);
    await q.getByLabel('Pega aquí el texto de una copia').fill(copia);
    await h.boton('Comprobar texto').click();
    comprobar('Al comprobar, avisa de las sesiones', (await q.locator('.confirmar p').innerText()).includes('2 sesiones'));
    await h.boton('Añadir').click();
    await q.waitForTimeout(800);
    await h.boton('Cerrar').click();
    const gi = await h.guardado();
    const s1 = gi.sesiones.find((s) => s.nombre === 'Sesión 1: el muelle');
    comprobar('Importar con sesiones: las recrea con sus tarjetas y finalizada', gi.sesiones.length === 2 && s1?.finalizada === true && gi.sesion_elementos.filter((r) => r.sesion_id === s1.id).length === c.sesion_elementos.filter((r) => r.sesion_id === c.sesiones.find((s) => s.nombre === s1.nombre).id).length && gi.elementos_comunes.length === 2);

    comprobar('Sin errores de JavaScript (local)', errores.length + errores2.length === 0, [...errores, ...errores2].join(' / '));
  }

  // ═════════════ Supabase simulado ═════════════
  {
    const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
    const exp = Math.floor(Date.now() / 1000) + 3600;
    const UID = '11111111-1111-1111-1111-111111111111';
    const usuario = { id: UID, aud: 'authenticated', role: 'authenticated', email: 'dm@example.com', user_metadata: {}, app_metadata: { provider: 'email' } };
    const JWT = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: UID, exp, role: 'authenticated', aud: 'authenticated' })}.firma`;
    const token = JSON.stringify({ access_token: JWT, token_type: 'bearer', expires_in: 3600, expires_at: exp, refresh_token: 'r', user: usuario });
    const tablas = { elementos: antigua.elementos.map((e) => ({ ...e })), recursos: antigua.recursos.map((r) => ({ ...r })), pistas: antigua.pistas.map((x) => ({ ...x })), sesiones: [], sesion_elementos: [], elementos_comunes: [], carpetas: [], carpeta_elementos: [] };
    let sin004 = true;
    let n = 0;
    const cuerpos = [];
    const servidor = async (r) => {
      const req = r.request();
      const u = new URL(req.url());
      const t = u.pathname.match(/^\/rest\/v1\/(\w+)/)?.[1];
      const id = u.searchParams.get('id')?.replace('eq.', '');
      if (u.pathname.startsWith('/auth/v1/')) return r.fulfill(u.pathname.includes('/user') ? { json: usuario } : { status: 204, body: '' });
      if (!t) return r.fulfill({ status: 404, body: '' });
      if (sin004 && ['sesiones', 'sesion_elementos', 'elementos_comunes'].includes(t))
        return r.fulfill({ status: 404, json: { code: 'PGRST205', message: `Could not find the table 'public.${t}' in the schema cache` } });
      if (req.method() === 'GET') return r.fulfill({ json: tablas[t] });
      if (req.method() === 'POST') {
        const cuerpo = JSON.parse(req.postData());
        cuerpos.push(cuerpo);
        if (t === 'sesion_elementos' && tablas[t].some((x) => x.sesion_id === cuerpo.sesion_id && x.elemento_id === cuerpo.elemento_id))
          return r.fulfill({ status: 409, json: { code: '23505', message: 'duplicate key value violates unique constraint' } });
        const fila = { id: `${t}-${++n}`, ...cuerpo };
        tablas[t].push(fila);
        return r.fulfill({ status: 201, json: fila });
      }
      if (req.method() === 'PATCH') {
        tablas[t] = tablas[t].map((f) => (f.id === id ? { ...f, ...JSON.parse(req.postData()) } : f));
        return r.fulfill({ status: 204, body: '' });
      }
      if (req.method() === 'DELETE') {
        tablas[t] = tablas[t].filter((f) => f.id !== id);
        if (t === 'sesiones') tablas.sesion_elementos = tablas.sesion_elementos.filter((x) => x.sesion_id !== id);
        return r.fulfill({ status: 204, body: '' });
      }
      return r.fulfill({ status: 404, body: '' });
    };
    const { ctx, p, errores } = await preparar(b);
    await ctx.route(SB + '/**', servidor);
    const { boton, chip, visibles, seleccionar, nuevaSesion } = ayudas(p);
    await p.goto('http://localhost:4174/');
    await p.evaluate((s) => localStorage.setItem('sb-prueba-auth-token', s), token);
    await p.reload();
    await p.waitForSelector('.tarjeta');

    // ── Sin bd/004: la biblioteca funciona y se explica qué falta ──
    comprobar('Sin bd/004: la biblioteca carga entera', (await visibles()).length === 5);
    comprobar('Sin bd/004: se indica ejecutar la migración', (await p.locator('.sesiones .aviso-suave').innerText()).includes('bd/004-sesiones.sql'));
    await boton('+ Nueva sesión').click();
    await boton('Crear sesión').click();
    await p.waitForSelector('dialog[open]', { state: 'detached' });
    comprobar('Sin bd/004: crear sesión avisa sin romper nada', (await p.locator('.aviso[role="alert"]').innerText()).includes('bd/004') && tablas.sesiones.length === 0);
    comprobar('Sin bd/004: el editor no muestra sesiones', await (async () => {
      await boton('Editar Alfa').click();
      const k = await p.locator('.editor-sesiones').count();
      await boton('Cancelar').click();
      return k === 0;
    })());

    // ── Con bd/004 ──
    sin004 = false;
    await p.reload();
    await p.waitForSelector('.tarjeta');
    await nuevaSesion('Sesión 1');
    await boton('Traer tarjetas de Main').click();
    await seleccionar('Alfa', 'Gamma');
    await boton('Añadir a la sesión').click();
    await p.waitForTimeout(300);
    await boton('Hecho').click();
    await chip('Sesión 1').click();
    comprobar('Supabase: asignar en bloque', orden(await visibles()) === orden(['Alfa', 'Gamma']) && tablas.sesion_elementos.length === 2);
    comprobar('Supabase: el navegador nunca envía user_id', cuerpos.every((c) => !('user_id' in c)));
    await boton('Editar Alfa').click();
    await p.getByLabel('Común a todas las sesiones').check();
    await boton('Guardar').click();
    await p.waitForSelector('dialog[open]', { state: 'detached' });
    await p.waitForTimeout(200);
    comprobar('Supabase: marcar común desde el editor', tablas.elementos_comunes.length === 1 && tablas.elementos_comunes[0].elemento_id === 'el-0');

    // ── Nuevo inicio de sesión: todo vuelve desde la base de datos ──
    await p.evaluate(() => { for (const k of Object.keys(localStorage)) if (k.startsWith('sb-') || k === 'banda-sonora:sesion-activa') localStorage.removeItem(k); });
    await p.reload();
    await p.evaluate((s) => localStorage.setItem('sb-prueba-auth-token', s), token);
    await p.reload();
    await p.waitForSelector('.tarjeta');
    await chip('Sesión 1').click();
    comprobar('Supabase: tras volver a entrar, sesiones, relaciones y comunes siguen', orden(await visibles()) === orden(['Alfa', 'Gamma']) && (await p.locator('.tarjeta', { hasText: 'Alfa' }).locator('.tarjeta-comun').count()) === 1);

    // ── Fallo al guardar: se restaura y se avisa ──
    await ctx.route(SB + '/rest/v1/sesion_elementos**', (r) => (r.request().method() === 'DELETE' ? r.fulfill({ status: 500, json: { message: 'fallo simulado' } }) : r.fallback()));
    await boton('Seleccionar tarjetas').click();
    await seleccionar('Gamma');
    await boton('Quitar de «Sesión 1»').click();
    await p.waitForTimeout(300);
    await boton('Hecho').click();
    comprobar('Supabase: si falla quitar, la tarjeta vuelve y se avisa', (await visibles()).includes('Gamma') && (await p.locator('.aviso[role="alert"]').count()) > 0);
    comprobar('Sin errores de JavaScript (Supabase)', errores.length === 0, errores.join(' / '));
  }

  const f = fin();
  await b.close();
  process.exit(f ? 1 : 0);
})();
