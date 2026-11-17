// Archivos propios: validación, huella, duración, retratos reducidos y almacén local (IndexedDB).

export const MAX_AUDIO = 50 * 1024 * 1024
export const MAX_IMAGEN_ORIGINAL = 15 * 1024 * 1024
export const LADO_RETRATO = 512

export const TIPOS_AUDIO = [
  'audio/mpeg', 'audio/mp3', 'audio/mp4', 'audio/x-m4a', 'audio/aac', 'audio/ogg', 'audio/opus',
  'audio/wav', 'audio/x-wav', 'audio/wave', 'audio/webm', 'audio/flac', 'audio/x-flac',
]
const EXTENSIONES: Record<string, string> = {
  mp3: 'audio/mpeg', m4a: 'audio/mp4', mp4: 'audio/mp4', aac: 'audio/aac', ogg: 'audio/ogg', oga: 'audio/ogg',
  opus: 'audio/ogg', wav: 'audio/wav', webm: 'audio/webm', flac: 'audio/flac',
}

export class ErrorArchivo extends Error {}

export function extension(nombre: string): string {
  return (nombre.split('.').pop() ?? '').toLowerCase().slice(0, 8)
}

/** Tipo de audio fiable (algunos sistemas no lo informan o usan alias). */
export function tipoAudio(f: File): string {
  const porNombre = EXTENSIONES[extension(f.name)]
  if (f.type && TIPOS_AUDIO.includes(f.type)) return f.type === 'audio/mp3' ? 'audio/mpeg' : f.type
  return porNombre ?? f.type
}

/** Comprueba un audio antes de subirlo. Lanza ErrorArchivo con un mensaje claro. */
export function validarAudio(f: File) {
  const tipo = tipoAudio(f)
  if (!TIPOS_AUDIO.includes(tipo)) throw new ErrorArchivo(`«${f.name}» no es un formato de audio admitido. Usa MP3, M4A, OGG, WAV, WEBM o FLAC.`)
  if (f.size > MAX_AUDIO) throw new ErrorArchivo(`«${f.name}» pesa ${(f.size / 1048576).toFixed(0)} MB. El máximo son 50 MB: recórtalo o conviértelo a MP3.`)
  const prueba = document.createElement('audio').canPlayType(tipo)
  if (prueba === '') throw new ErrorArchivo(`Este navegador no puede reproducir «${f.name}». Prueba con MP3.`)
}

/** Huella SHA-256 en hexadecimal (para no subir dos veces el mismo archivo). */
export async function huella(b: Blob): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await b.arrayBuffer())
  return [...new Uint8Array(digest)].map((x) => x.toString(16).padStart(2, '0')).join('')
}

/** Duración en ms, o null si el navegador no la sabe leer a tiempo. */
export function duracionAudio(b: Blob): Promise<number | null> {
  return new Promise((resolver) => {
    const url = URL.createObjectURL(b)
    const a = new Audio()
    const fin = (v: number | null) => {
      URL.revokeObjectURL(url)
      resolver(v)
    }
    const limite = setTimeout(() => fin(null), 5000)
    a.preload = 'metadata'
    a.onloadedmetadata = () => {
      clearTimeout(limite)
      fin(Number.isFinite(a.duration) ? Math.round(a.duration * 1000) : null)
    }
    a.onerror = () => {
      clearTimeout(limite)
      fin(null)
    }
    a.src = url
  })
}

/** Reduce una imagen a 512 px (lado mayor) en WebP. Lanza ErrorArchivo si no es una imagen válida. */
export async function prepararRetrato(f: File): Promise<Blob> {
  if (!f.type.startsWith('image/')) throw new ErrorArchivo('Elige una imagen (JPG, PNG o WebP).')
  if (f.size > MAX_IMAGEN_ORIGINAL) throw new ErrorArchivo('La imagen pesa demasiado (máximo 15 MB).')
  let bmp: ImageBitmap
  try {
    bmp = await createImageBitmap(f)
  } catch {
    throw new ErrorArchivo('No se ha podido leer la imagen. Prueba con JPG o PNG.')
  }
  const escala = Math.min(1, LADO_RETRATO / Math.max(bmp.width, bmp.height))
  const lienzo = document.createElement('canvas')
  lienzo.width = Math.round(bmp.width * escala)
  lienzo.height = Math.round(bmp.height * escala)
  lienzo.getContext('2d')!.drawImage(bmp, 0, 0, lienzo.width, lienzo.height)
  bmp.close()
  const blob = await new Promise<Blob | null>((r) => lienzo.toBlob(r, 'image/webp', 0.85))
  if (!blob) throw new ErrorArchivo('No se ha podido preparar la imagen.')
  return blob
}

// ───── Almacén local (modo sin cuenta): los archivos viven en IndexedDB ─────
const BD = 'banda-sonora'
const ALMACEN = 'archivos'

function abrir(): Promise<IDBDatabase> {
  return new Promise((resolver, rechazar) => {
    const r = indexedDB.open(BD, 1)
    r.onupgradeneeded = () => r.result.createObjectStore(ALMACEN)
    r.onsuccess = () => resolver(r.result)
    r.onerror = () => rechazar(new ErrorArchivo('Este navegador no deja guardar archivos.'))
  })
}

async function operar<T>(modo: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await abrir()
  return new Promise((resolver, rechazar) => {
    const t = db.transaction(ALMACEN, modo)
    const r = fn(t.objectStore(ALMACEN))
    r.onsuccess = () => resolver(r.result)
    r.onerror = () => rechazar(new ErrorArchivo('No se ha podido guardar el archivo en este navegador (¿sin espacio?).'))
  })
}

export const localGuardar = (ruta: string, b: Blob) => operar('readwrite', (s) => s.put(b, ruta)).then(() => undefined)
export const localLeer = (ruta: string) => operar<Blob | undefined>('readonly', (s) => s.get(ruta))
export const localBorrar = (ruta: string) => operar('readwrite', (s) => s.delete(ruta)).then(() => undefined)
