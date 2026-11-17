// Utilidades compartidas por las pruebas de interfaz.
const os = require('os');

const CARPETA = { opening: 'opening', ending: 'ending', personaje: 'personaje', lugar: 'lugar', momento: 'momento', ambiente: 'ambiente', efecto: 'efecto' };
const NUEVO = { opening: 'Añadir opening', ending: 'Añadir ending', personaje: 'Añadir personaje', lugar: 'Añadir lugar', momento: 'Añadir momento', ambiente: 'Añadir ambiente', efecto: 'Añadir efecto' };

/** WAV de prueba: tono de 440 Hz, mono, 8 kHz. */
function wav(segundos = 4) {
  const tasa = 8000, n = tasa * segundos, b = Buffer.alloc(44 + n * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + n * 2, 4); b.write('WAVE', 8); b.write('fmt ', 12);
  b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(tasa, 24);
  b.writeUInt32LE(tasa * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) b.writeInt16LE(Math.round(Math.sin((2 * Math.PI * 440 * i) / tasa) * 8000), 44 + i * 2);
  return b;
}

/**
 * Crea un elemento desde la interfaz.
 * sonidos: [{ enlace } | { archivo: {name, buffer} } | { biblioteca: 'título' }, con etiqueta/inicio/fin/bucle opcionales]
 */
async function crearElemento(p, { tipo = 'personaje', nombre, descripcion = '', sonidos = [], retrato = null }) {
  await p.getByRole('button', { name: new RegExp('^' + NUEVO[tipo]) }).first().click();
  await p.waitForSelector('dialog[open] #ed-nombre');
  await p.fill('#ed-nombre', nombre);
  if (descripcion) await p.fill('#ed-descripcion', descripcion);
  if (retrato) await p.setInputFiles('input[aria-label="Imagen del retrato"]', retrato);
  await anadirSonidos(p, sonidos);
  await p.getByRole('button', { name: 'Guardar', exact: true }).click();
  await p.waitForSelector('dialog[open]', { state: 'detached', timeout: 15000 });
}

async function anadirSonidos(p, sonidos) {
  for (const s of sonidos) {
    const antes = await p.locator('.fila-pista').count();
    if (s.enlace) {
      await p.getByRole('button', { name: 'Enlace', exact: true }).click();
      await p.fill('#nuevo-enlace', s.enlace);
      await p.getByRole('button', { name: 'Añadir enlace' }).click();
    } else if (s.archivo) {
      await p.getByRole('button', { name: 'Archivo propio' }).click();
      await p.setInputFiles('input[aria-label="Archivos de audio"]', s.archivo);
    } else if (s.biblioteca) {
      await p.getByRole('button', { name: 'De la biblioteca' }).click();
      await p.locator('.lista-sonidos li', { hasText: s.biblioteca }).getByRole('button', { name: 'Añadir' }).click();
    }
    await p.waitForFunction((n) => document.querySelectorAll('.fila-pista').length > n, antes);
    const fila = p.locator('.fila-pista').nth(antes);
    if (s.etiqueta != null) await fila.locator('[id$="-etiqueta"]').fill(s.etiqueta);
    if (s.inicio != null) await fila.locator('[id$="-inicio"]').fill(s.inicio);
    if (s.fin != null) await fila.locator('[id$="-fin"]').fill(s.fin);
    if (s.bucle != null) await fila.getByLabel('En bucle').setChecked(s.bucle);
  }
}

function comprobador() {
  let fallos = 0;
  const comprobar = (n, ok, extra = '') => { if (!ok) fallos++; console.log(ok ? 'OK ' : 'MAL', n, extra) };
  const fin = () => { console.log(fallos ? `\n${fallos} FALLOS` : '\nTodas las comprobaciones correctas'); return fallos };
  return { comprobar, fin };
}

const CAPTURAS = process.env.CAPTURAS || os.tmpdir() + '/';

module.exports = { wav, crearElemento, anadirSonidos, comprobador, CAPTURAS, CARPETA };
