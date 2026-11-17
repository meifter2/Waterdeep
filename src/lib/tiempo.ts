// Tiempos de las pistas: se guardan en milisegundos y se escriben como m:ss (o m:ss.d).

/** «1:30», «90», «1:30.5», «0:05» → milisegundos. Vacío → null. Texto inválido → NaN. */
export function leerTiempo(texto: string): number | null {
  const t = texto.trim().replace(',', '.')
  if (!t) return null
  const m = t.match(/^(?:(\d+):)?(\d+(?:\.\d{1,3})?)$/)
  if (!m) return NaN
  const minutos = Number(m[1] ?? 0)
  const segundos = Number(m[2])
  if (m[1] !== undefined && segundos >= 60) return NaN
  return Math.round((minutos * 60 + segundos) * 1000)
}

/** 90500 → «1:30.5»; null → «». */
export function escribirTiempo(ms: number | null | undefined): string {
  if (ms == null) return ''
  const decimas = Math.round(ms / 100)
  const minutos = Math.floor(decimas / 600)
  const resto = decimas - minutos * 600
  const segundos = Math.floor(resto / 10)
  const decima = resto % 10
  return `${minutos}:${String(segundos).padStart(2, '0')}${decima ? `.${decima}` : ''}`
}

/** Describe un tramo para la interfaz: «desde 1:20 hasta 2:45». */
export function describirTramo(inicio: number | null, fin: number | null): string {
  if (inicio == null && fin == null) return ''
  if (fin == null) return `desde ${escribirTiempo(inicio)}`
  return `${escribirTiempo(inicio ?? 0)}–${escribirTiempo(fin)}`
}

export function formatearBytes(b: number | null | undefined): string {
  if (!b) return ''
  if (b < 1024 * 1024) return `${Math.round(b / 1024)} KB`
  return `${(b / 1024 / 1024).toFixed(1).replace('.', ',')} MB`
}
