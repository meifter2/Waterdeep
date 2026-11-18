import type { EstadoReproduccion } from '../../data/reproduccion'
import type { Segmento } from './motor'
import { MotorArchivo } from './motorArchivo'

// Motor de mezcla (fase 2): varias capas de archivos propios sonando a la vez, encima del canal principal.
//
// Decisión: un HTMLAudioElement por voz (reutilizando MotorArchivo, con su tramo, bucle y turnos), no Web Audio:
// - los archivos largos (hasta 50 MB) se reproducen en streaming, sin decodificarlos enteros en memoria;
// - los enlaces firmados de Supabase funcionan sin depender de CORS (Web Audio exige crossOrigin);
// - no hay AudioContext que desbloquear en el móvil, ni silencios por el interruptor de iPhone.
// Límite conocido: en iPhone/iPad el navegador ignora el volumen por elemento (el silencio sí funciona).
//
// Ambientes: hasta MAX_AMBIENTES canales, cada uno con su propio elemento de audio (se crea al activarlo
// y se libera al detenerlo). Efectos: un grupo de hasta MAX_EFECTOS voces reutilizables; si se piden más,
// se corta la más antigua.

export const MAX_AMBIENTES = 3
export const MAX_EFECTOS = 6

export type Capa = 'ambiente' | 'efecto'
/** Estado de una capa: los de siempre más «fin» (terminó sola, sin repetir). */
export type EstadoCapa = EstadoReproduccion | 'fin'
export type InformeMezcla = (capa: Capa, id: string, estado: EstadoCapa, aviso?: string) => void

interface Voz {
  motor: MotorArchivo
  /** Lanzamiento al que pertenece ahora la voz ('' = libre). */
  id: string
  url: string
}

export class MotorMezcla {
  private ambientes = new Map<string, MotorArchivo>()
  private voces: Voz[] = []

  constructor(private informar: InformeMezcla) {}

  // ── Ambientes ──

  /** Pone (o vuelve a poner) un archivo en el canal de ambiente `id`. Si el canal no existe, lo crea. */
  ambiente(id: string, url: string, seg: Segmento, bucle: boolean, volumen: number, silenciado: boolean) {
    let m = this.ambientes.get(id)
    if (!m) {
      const motor = new MotorArchivo((e, a) => {
        if (this.ambientes.get(id) === motor) this.informar('ambiente', id, e, a)
      })
      motor.alFin = () => {
        if (this.ambientes.get(id) === motor) this.informar('ambiente', id, 'fin')
      }
      this.ambientes.set(id, motor)
      m = motor
    }
    m.fijarRepetir(bucle)
    m.fijarVolumen(volumen, silenciado)
    void m.reproducir(url, seg)
  }

  alternarAmbiente(id: string) {
    this.ambientes.get(id)?.alternar()
  }

  /** Detiene el canal y libera su archivo. */
  quitarAmbiente(id: string) {
    const m = this.ambientes.get(id)
    if (!m) return
    this.ambientes.delete(id)
    m.alFin = undefined
    m.liberar()
  }

  bucleAmbiente(id: string, valor: boolean) {
    this.ambientes.get(id)?.fijarRepetir(valor)
  }

  volumenAmbiente(id: string, volumen: number, silenciado: boolean) {
    this.ambientes.get(id)?.fijarVolumen(volumen, silenciado)
  }

  // ── Efectos ──

  /** Lanza un efecto una vez. Reutiliza una voz libre (mejor si ya tiene ese archivo: empieza al instante). */
  efecto(id: string, url: string, seg: Segmento, volumen: number, silenciado: boolean) {
    const libres = this.voces.filter((v) => !v.id)
    let voz = libres.find((v) => v.url === url) ?? (this.voces.length < MAX_EFECTOS ? undefined : libres[0])
    if (!voz) {
      if (this.voces.length >= MAX_EFECTOS) {
        // No debería pasar (el almacén corta la más antigua antes), pero por si acaso: se roba la primera.
        voz = this.voces[0]
        voz.motor.detener()
      } else {
        const nueva: Voz = { motor: undefined as unknown as MotorArchivo, id: '', url: '' }
        nueva.motor = new MotorArchivo((e, a) => {
          // Solo interesan «sonando» y los errores: las pausas son el final o un corte ordenado.
          if (nueva.id && (e === 'sonando' || e === 'error')) this.informar('efecto', nueva.id, e, a)
        })
        nueva.motor.alFin = () => {
          const lanzado = nueva.id
          if (!lanzado) return
          nueva.id = ''
          nueva.motor.detener()
          this.informar('efecto', lanzado, 'fin')
        }
        this.voces.push(nueva)
        voz = nueva
      }
    }
    voz.id = id
    voz.url = url
    voz.motor.repetir = false
    voz.motor.fijarVolumen(volumen, silenciado)
    void voz.motor.reproducir(url, seg)
  }

  /** Corta un lanzamiento concreto (la voz queda libre, con su archivo para reutilizarlo). */
  cortarEfecto(id: string) {
    const voz = this.voces.find((v) => v.id === id)
    if (!voz) return
    voz.id = ''
    voz.motor.detener()
  }

  volumenEfectos(volumen: number, silenciado: boolean) {
    for (const v of this.voces) v.motor.fijarVolumen(volumen, silenciado)
  }

  /** Corta todos los efectos y suelta sus archivos. */
  liberarEfectos() {
    for (const v of this.voces) {
      v.id = ''
      v.motor.alFin = undefined
      v.motor.liberar()
    }
    this.voces = []
  }

  /** Detiene y libera todas las capas. */
  liberarTodo() {
    for (const id of [...this.ambientes.keys()]) this.quitarAmbiente(id)
    this.liberarEfectos()
  }

  /** Para las pruebas: qué elementos de audio existen y cómo están. */
  diagnostico() {
    const ver = (capa: Capa, id: string, m: MotorArchivo) => {
      const a = m.elemento
      return { capa, id, src: a.getAttribute('src') ?? '', pausado: a.paused, t: a.currentTime, volumen: a.volume, silenciado: a.muted, bucle: m.repetir }
    }
    return [
      ...[...this.ambientes.entries()].map(([id, m]) => ver('ambiente', id, m)),
      ...this.voces.map((v) => ver('efecto', v.id, v.motor)),
    ]
  }
}
