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

interface VozAmbiente {
  motor: MotorArchivo
  /** Canal al que pertenece (cambia si se recupera mientras se apagaba). */
  id: string
  pistaId: string
  url: string
}

export class MotorMezcla {
  private ambientes = new Map<string, VozAmbiente>()
  /** Ambientes que se están apagando con fundido: siguen sonando hasta terminar y entonces se liberan. */
  private saliendo: VozAmbiente[] = []
  private voces: Voz[] = []

  constructor(private informar: InformeMezcla) {}

  // ── Ambientes ──

  /**
   * Pone (o vuelve a poner) un archivo en el canal de ambiente `id`, entrando con un fundido de `entradaMs`.
   * Si ese mismo sonido se estaba apagando, se recupera (vuelve a subir desde donde esté): sin duplicarlo ni recargarlo.
   */
  ambiente(id: string, pistaId: string, url: string, seg: Segmento, bucle: boolean, volumen: number, silenciado: boolean, entradaMs = 0) {
    let v = this.ambientes.get(id)
    if (!v) {
      const i = this.saliendo.findIndex((x) => x.pistaId === pistaId && x.url === url && x.motor.suena)
      if (i >= 0) {
        const recuperada = this.saliendo.splice(i, 1)[0]
        recuperada.id = id
        this.ambientes.set(id, recuperada)
        recuperada.motor.fijarRepetir(bucle)
        recuperada.motor.fijarVolumen(volumen, silenciado)
        void recuperada.motor.fundir(1, entradaMs)
        this.informar('ambiente', id, 'sonando', '')
        return
      }
      const voz: VozAmbiente = { motor: undefined as unknown as MotorArchivo, id, pistaId, url }
      voz.motor = new MotorArchivo((e, a) => {
        if (this.ambientes.get(voz.id) === voz) this.informar('ambiente', voz.id, e, a)
      })
      voz.motor.alFin = () => {
        if (this.ambientes.get(voz.id) === voz) this.informar('ambiente', voz.id, 'fin')
      }
      this.ambientes.set(id, voz)
      v = voz
    }
    v.url = url
    v.motor.fijarRepetir(bucle)
    v.motor.fijarVolumen(volumen, silenciado)
    v.motor.entrarCon(entradaMs)
    void v.motor.reproducir(url, seg)
  }

  alternarAmbiente(id: string) {
    this.ambientes.get(id)?.motor.alternar()
  }

  /** Quita el canal. Con `salidaMs` se apaga con fundido y se libera al terminar; sin él (o si no suena), al instante. */
  quitarAmbiente(id: string, salidaMs = 0) {
    const v = this.ambientes.get(id)
    if (!v) return
    this.ambientes.delete(id)
    if (salidaMs <= 0 || !v.motor.suena) return this.soltar(v)
    this.saliendo.push(v)
    void v.motor.fundir(0, salidaMs).then((completo) => {
      // Si se canceló (se recuperó el sonido o se paró todo), ya se ocupó quien lo canceló.
      if (completo && this.saliendo.includes(v)) {
        this.saliendo.splice(this.saliendo.indexOf(v), 1)
        this.soltar(v)
      }
    })
  }

  private soltar(v: VozAmbiente) {
    v.motor.alFin = undefined
    v.motor.liberar()
  }

  bucleAmbiente(id: string, valor: boolean) {
    this.ambientes.get(id)?.motor.fijarRepetir(valor)
  }

  volumenAmbiente(id: string, volumen: number, silenciado: boolean) {
    this.ambientes.get(id)?.motor.fijarVolumen(volumen, silenciado)
  }

  /** El volumen nuevo (maestro, silencio) también llega a los ambientes que se están apagando. */
  volumenSaliendo(volumen: (pistaId: string) => { volumen: number; silenciado: boolean }) {
    for (const v of this.saliendo) {
      const x = volumen(v.pistaId)
      v.motor.fijarVolumen(x.volumen, x.silenciado)
    }
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
  /** Para y suelta TODO al instante (también lo que se estaba apagando). Es el botón de emergencia. */
  liberarTodo() {
    for (const id of [...this.ambientes.keys()]) this.quitarAmbiente(id)
    for (const v of this.saliendo.splice(0)) this.soltar(v)
    this.liberarEfectos()
  }

  /** Para las pruebas: qué elementos de audio existen y cómo están. */
  diagnostico() {
    const ver = (capa: Capa | 'saliendo', id: string, m: MotorArchivo) => {
      const a = m.elemento
      return { capa, id, src: a.getAttribute('src') ?? '', pausado: a.paused, t: a.currentTime, volumen: a.volume, silenciado: a.muted, bucle: m.repetir, nivel: m.nivel }
    }
    return [
      ...[...this.ambientes.entries()].map(([id, v]) => ver('ambiente', id, v.motor)),
      ...this.saliendo.map((v) => ver('saliendo', '', v.motor)),
      ...this.voces.map((v) => ver('efecto', v.id, v.motor)),
    ]
  }
}
