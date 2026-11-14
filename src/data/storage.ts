// Acceso a localStorage tolerante a fallos (modo privado, iframes, cookies bloqueadas).
// Si no hay almacenamiento, se usa memoria y la app avisa de que no se guardará.

const memoria = new Map<string, string>()

function probar(): boolean {
  try {
    const k = '__prueba__'
    window.localStorage.setItem(k, '1')
    window.localStorage.removeItem(k)
    return true
  } catch {
    return false
  }
}

export const almacenamientoDisponible = probar()

export const almacenamientoSeguro = {
  getItem(clave: string): string | null {
    if (!almacenamientoDisponible) return memoria.get(clave) ?? null
    try {
      return window.localStorage.getItem(clave)
    } catch {
      return memoria.get(clave) ?? null
    }
  },
  setItem(clave: string, valor: string): void {
    memoria.set(clave, valor)
    if (!almacenamientoDisponible) return
    try {
      window.localStorage.setItem(clave, valor)
    } catch {
      /* cuota llena o bloqueado: queda en memoria */
    }
  },
  removeItem(clave: string): void {
    memoria.delete(clave)
    if (!almacenamientoDisponible) return
    try {
      window.localStorage.removeItem(clave)
    } catch {
      /* nada */
    }
  },
}

