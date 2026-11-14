// Tirador de dados: admite expresiones como "d20", "2d6+3", "1d8 + 1d6 - 1".

export interface Resultado {
  total: number
  detalle: string
}

const TERMINO = /([+-]?)\s*(\d*)d(\d+)|([+-]?)\s*(\d+)/gi

export function tirar(expresion: string, aleatorio = Math.random): Resultado | null {
  const limpia = expresion.replace(/\s+/g, '').toLowerCase()
  if (!limpia || !/^[+-]?(\d*d\d+|\d+)([+-](\d*d\d+|\d+))*$/.test(limpia)) return null

  let total = 0
  const partes: string[] = []
  for (const m of limpia.matchAll(TERMINO)) {
    if (m[3]) {
      const signo = m[1] === '-' ? -1 : 1
      const cantidad = Math.min(Number(m[2] || 1), 100)
      const caras = Number(m[3])
      if (caras < 1 || caras > 1000) return null
      const tiradas = Array.from({ length: cantidad }, () => 1 + Math.floor(aleatorio() * caras))
      total += signo * tiradas.reduce((a, b) => a + b, 0)
      partes.push(`${signo < 0 ? '−' : partes.length ? '+' : ''}${cantidad}d${caras} [${tiradas.join(', ')}]`)
    } else if (m[5]) {
      const signo = m[4] === '-' ? -1 : 1
      total += signo * Number(m[5])
      partes.push(`${signo < 0 ? '−' : '+'}${m[5]}`)
    }
  }
  return { total, detalle: partes.join(' ') }
}
