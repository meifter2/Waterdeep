// Prueba del modo Supabase con un servidor simulado.
// Requiere: npm run build:prueba && npm run preview:prueba (puerto 4174).
const { chromium } = require('playwright');
const os = require('os');
const URL = 'http://localhost:4174/';
const SB = 'https://prueba.supabase.co';
const OUT = process.env.CAPTURAS || os.tmpdir() + '/';
let fallos = 0;
const comprobar = (n, ok, extra = '') => { if (!ok) fallos++; console.log(ok ? 'OK ' : 'MAL', n, extra) };

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const exp = Math.floor(Date.now() / 1000) + 3600;
const usuario = { id: '11111111-1111-1111-1111-111111111111', aud: 'authenticated', role: 'authenticated', email: 'dm@example.com', user_metadata: { full_name: 'Máster de prueba' }, app_metadata: { provider: 'google' } };
const jwt = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: usuario.id, exp, role: 'authenticated', aud: 'authenticated', email: usuario.email })}.firma`;
const sesion = { access_token: jwt, token_type: 'bearer', expires_in: 3600, expires_at: exp, refresh_token: 'refresco', user: usuario };

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1280, height: 820 } });
  const filas = [];
  const peticiones = [];
  const servidorBueno = async (r) => {
    const req = r.request();
    const m = req.method();
    peticiones.push(`${m} ${req.url().replace(SB, '')}`);
    if (m === 'GET') return r.fulfill({ json: filas });
    if (m === 'POST') {
      const cuerpo = JSON.parse(req.postData());
      peticiones.push('BODY ' + JSON.stringify(cuerpo));
      const fila = { id: 'id-' + (filas.length + 1), orden: 0, creado: new Date().toISOString(), actualizado: new Date().toISOString(), ...cuerpo };
      filas.push(fila);
      return r.fulfill({ status: 201, json: fila });
    }
    if (m === 'DELETE') {
      const id = new globalThis.URL(req.url()).searchParams.get('id').replace('eq.', '');
      const i = filas.findIndex((f) => f.id === id);
      if (i >= 0) filas.splice(i, 1);
      return r.fulfill({ status: 204, body: '' });
    }
    return r.fulfill({ status: 204, body: '' });
  };
  await ctx.route(SB + '/rest/v1/**', servidorBueno);
  await ctx.route(SB + '/auth/v1/**', (r) => {
    peticiones.push(`${r.request().method()} ${r.request().url().replace(SB, '')}`);
    if (r.request().url().includes('/user')) return r.fulfill({ json: usuario });
    return r.fulfill({ status: 204, body: '' });
  });
  await ctx.route(/open\.spotify\.com|youtube\.com/, (r) => r.fulfill({ body: '' }));

  const p = await ctx.newPage();
  const errores = [];
  p.on('pageerror', (e) => errores.push(String(e)));

  // 1) Sin sesión → pantalla de entrada
  await p.goto(URL);
  await p.waitForSelector('.entrada');
  comprobar('Sin sesión pide entrar con Google', await p.getByRole('button', { name: 'Entrar con Google' }).isVisible());
  await p.screenshot({ path: OUT + 'entrada.png' });

  // 2) Con sesión (como al volver de Google) y con canciones antiguas en el navegador
  await p.evaluate((s) => {
    localStorage.setItem('sb-prueba-auth-token', s);
    localStorage.setItem('banda-sonora:datos', JSON.stringify({ state: { version: 2, personajes: [{ nombre: 'Maela', enlace: 'https://youtu.be/dQw4w9WgXcQ', nota: '' }] }, version: 2 }));
  }, JSON.stringify(sesion));
  await p.reload();
  await p.waitForSelector('.cabecera');
  await p.waitForTimeout(300);
  comprobar('Con sesión muestra la biblioteca y el usuario', await p.getByText('Máster de prueba').isVisible());
  comprobar('Carga canciones de Supabase', peticiones.some((x) => x.startsWith('GET /rest/v1/canciones?select=')));
  comprobar('Ofrece subir las canciones antiguas', await p.getByRole('button', { name: 'Subir a mi cuenta' }).isVisible());
  await p.getByRole('button', { name: 'Subir a mi cuenta' }).click();
  await p.waitForTimeout(300);
  comprobar('Sube la antigua como personaje', filas.length === 1 && filas[0].tipo === 'personaje' && filas[0].nombre === 'Maela');
  comprobar('Y olvida la copia antigua', await p.evaluate(() => localStorage.getItem('banda-sonora:datos') === null));

  // 3) Crear desde el editor
  await p.getByRole('button', { name: /^Añadir lugar/ }).click();
  await p.getByLabel('Nombre').fill('El Ancla Torcida');
  await p.getByLabel('Enlace de la canción').fill('https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT');
  await p.getByRole('button', { name: 'Guardar', exact: true }).click();
  await p.waitForTimeout(300);
  const cuerpo = peticiones.filter((x) => x.startsWith('BODY ')).at(-1) || '';
  comprobar('Crea en Supabase con la carpeta correcta', cuerpo.includes('"tipo":"lugar"') && cuerpo.includes('El Ancla Torcida'));
  comprobar('No envía user_id (lo pone la base de datos)', !cuerpo.includes('user_id'));
  comprobar('Aparece en Lugares', await p.locator('.seccion-lugar .tarjeta').count() === 1);
  await p.screenshot({ path: OUT + 'biblioteca-supabase.png' });

  // 4) Eliminar
  await p.getByRole('button', { name: 'Editar El Ancla Torcida' }).click();
  await p.getByRole('button', { name: 'Eliminar' }).click();
  await p.locator('.confirmar').getByRole('button', { name: 'Eliminar' }).click();
  await p.waitForTimeout(300);
  comprobar('Elimina en Supabase', peticiones.some((x) => x.startsWith('DELETE /rest/v1/canciones?id=eq.id-2')));

  // 5) Error al guardar → se deshace y avisa
  await ctx.unroute(SB + '/rest/v1/**', servidorBueno);
  await ctx.route(SB + '/rest/v1/**', (r) => r.fulfill({ status: 500, json: { message: 'caído' } }));
  await p.getByRole('button', { name: /^Añadir momento/ }).click();
  await p.getByLabel('Nombre').fill('Persecución');
  await p.getByRole('button', { name: 'Guardar', exact: true }).click();
  await p.waitForTimeout(400);
  const aviso = await p.locator('.aviso[role=alert]').innerText().catch(() => '');
  comprobar('Si Supabase falla, avisa y no deja tarjeta fantasma', aviso.includes('No se ha podido guardar') && await p.locator('.seccion-momento .tarjeta').count() === 0);

  // 6) Salir
  await p.getByRole('button', { name: 'Salir' }).click();
  await p.waitForSelector('.entrada');
  comprobar('Salir cierra la sesión y vuelve a la entrada', peticiones.some((x) => x.startsWith('POST /auth/v1/logout')));

  comprobar('Sin errores de JavaScript', errores.length === 0, errores.join(' / '));
  console.log(fallos ? `\n${fallos} FALLOS` : '\nTodas las comprobaciones correctas');
  await b.close();
})();
