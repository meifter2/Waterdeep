// Acceso con email y contraseña (Supabase Auth simulado). Requiere preview:prueba (4174).
const { chromium } = require('playwright');
const { comprobador } = require('./ayuda.cjs');
const URL = 'http://localhost:4174/';
const SB = 'https://prueba.supabase.co';
const { comprobar, fin } = comprobador();

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const exp = Math.floor(Date.now() / 1000) + 3600;
const usuario = { id: '22222222-2222-2222-2222-222222222222', aud: 'authenticated', role: 'authenticated', email: 'master@example.com', user_metadata: {}, app_metadata: { provider: 'email' }, identities: [{ id: 'i' }] };
const jwt = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: usuario.id, exp, role: 'authenticated', aud: 'authenticated', email: usuario.email })}.firma`;
const sesion = { access_token: jwt, token_type: 'bearer', expires_in: 3600, expires_at: exp, refresh_token: 'refresco', user: usuario };

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1280, height: 860 } });
  const auth = [];
  await ctx.route(SB + '/auth/v1/**', (r) => {
    const req = r.request();
    const u = new globalThis.URL(req.url());
    const cuerpo = req.postData() ? JSON.parse(req.postData()) : {};
    auth.push(`${req.method()} ${u.pathname}${u.search} ${JSON.stringify(cuerpo)}`);
    if (u.pathname.endsWith('/token') && u.searchParams.get('grant_type') === 'password') {
      if (cuerpo.password === 'correcta123') return r.fulfill({ json: sesion });
      if (cuerpo.password === 'sinconfirmar1') return r.fulfill({ status: 400, json: { code: 400, error_code: 'email_not_confirmed', msg: 'Email not confirmed' } });
      return r.fulfill({ status: 400, json: { code: 400, error_code: 'invalid_credentials', msg: 'Invalid login credentials' } });
    }
    if (u.pathname.endsWith('/signup')) return r.fulfill({ json: { ...usuario, email: cuerpo.email, confirmation_sent_at: new Date().toISOString() } });
    if (u.pathname.endsWith('/recover')) return r.fulfill({ json: {} });
    if (u.pathname.endsWith('/user')) return r.fulfill({ json: usuario });
    return r.fulfill({ status: 204, body: '' });
  });
  await ctx.route(SB + '/rest/v1/**', (r) => r.fulfill({ json: [] }));
  await ctx.route(/open\.spotify\.com|youtube\.com/, (r) => r.fulfill({ body: '' }));
  const p = await ctx.newPage();
  const errores = [];
  p.on('pageerror', (e) => errores.push(String(e)));
  await p.goto(URL);
  await p.evaluate(() => localStorage.clear());
  await p.reload();
  await p.waitForSelector('.entrada');
  const texto = () => p.locator('.entrada-form').innerText();

  comprobar('Se mantiene «Entrar con Google»', await p.getByRole('button', { name: 'Entrar con Google' }).isVisible());

  // Validación local
  await p.getByRole('button', { name: 'Entrar', exact: true }).click();
  comprobar('Pide un email válido', (await texto()).includes('Escribe un email válido'));

  // Contraseña incorrecta y email sin confirmar
  await p.fill('#en-email', 'master@example.com');
  await p.fill('#en-contrasena', 'mala');
  await p.getByRole('button', { name: 'Entrar', exact: true }).click();
  await p.waitForSelector('.entrada-form [role=alert]');
  comprobar('Contraseña incorrecta: mensaje claro', (await texto()).includes('Email o contraseña incorrectos'));
  await p.fill('#en-contrasena', 'sinconfirmar1');
  await p.getByRole('button', { name: 'Entrar', exact: true }).click();
  await p.waitForFunction(() => document.querySelector('.entrada-form')?.textContent.includes('confirmado'));
  comprobar('Email sin confirmar: explica qué hacer', (await texto()).includes('Aún no has confirmado tu email'));

  // Crear cuenta
  await p.getByRole('button', { name: 'Crear una cuenta' }).click();
  await p.fill('#en-email', 'nuevo@example.com');
  await p.fill('#en-contrasena', 'corta');
  await p.getByRole('button', { name: 'Crear cuenta', exact: true }).click();
  comprobar('Crear cuenta: exige 8 caracteres', (await texto()).includes('al menos 8 caracteres'));
  await p.fill('#en-contrasena', 'larguisima1');
  await p.getByRole('button', { name: 'Crear cuenta', exact: true }).click();
  await p.waitForSelector('.entrada-form [role=status]');
  comprobar('Crear cuenta: avisa del correo de confirmación', (await texto()).includes('Te hemos enviado un correo a nuevo@example.com'));
  comprobar('…y el enlace del correo vuelve a esta misma dirección', auth.some((x) => x.includes('/signup') && x.includes('redirect_to=' + encodeURIComponent(URL))));

  // Recuperar contraseña
  await p.getByRole('button', { name: 'Ya tengo cuenta' }).click();
  await p.getByRole('button', { name: '¿Has olvidado la contraseña?' }).click();
  await p.fill('#en-email', 'master@example.com');
  await p.getByRole('button', { name: 'Enviar enlace' }).click();
  await p.waitForSelector('.entrada-form [role=status]');
  comprobar('Recuperar: envía el correo y vuelve aquí', (await texto()).includes('te llegará un correo') && auth.some((x) => x.includes('/recover') && x.includes(encodeURIComponent(URL))));

  // Entrar
  await p.getByRole('button', { name: 'Ya tengo cuenta' }).click();
  await p.fill('#en-email', 'master@example.com');
  await p.fill('#en-contrasena', 'correcta123');
  await p.getByRole('button', { name: 'Entrar', exact: true }).click();
  await p.waitForSelector('.cabecera', { timeout: 10000 });
  comprobar('Entra con email y contraseña en esta misma dirección', p.url().startsWith(URL) && (await p.getByText('master', { exact: true }).isVisible()));
  await p.reload();
  await p.waitForSelector('.cabecera');
  comprobar('Recuerda la sesión al recargar', true);
  await p.getByRole('button', { name: 'Salir' }).click();
  await p.waitForSelector('.entrada');

  // Enlace de recuperación del correo → elegir contraseña nueva
  await p.goto('about:blank'); // el enlace del correo abre la página de cero
  await p.goto(`${URL}#access_token=${jwt}&refresh_token=refresco&expires_in=3600&expires_at=${exp}&token_type=bearer&type=recovery`);
  const llego = await p.waitForSelector('#nc-contrasena', { timeout: 8000 }).then(() => true).catch(() => false);
  comprobar('El enlace de recuperación abre «Nueva contraseña»', llego);
  if (llego) {
    await p.fill('#nc-contrasena', 'nuevaclave99');
    await p.getByRole('button', { name: 'Guardar contraseña' }).click();
    await p.waitForSelector('.cabecera', { timeout: 8000 });
    comprobar('Guarda la contraseña nueva y entra', auth.some((x) => x.startsWith('PUT /auth/v1/user') && x.includes('nuevaclave99')));
  }

  comprobar('Sin errores de JavaScript', errores.length === 0, errores.join(' / '));
  const f = fin();
  await b.close();
  process.exit(f ? 1 : 0);
})();
