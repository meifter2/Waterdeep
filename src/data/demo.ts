import { datosVacios } from './store'
import { nuevoId } from '../lib/id'
import type { Datos, Entidad } from './types'

// Datos de ejemplo 100 % inventados para probar la app.
// No reproducen nombres, textos ni tramas del libro.

function e(campos: Partial<Entidad> & { nombre: string }): Entidad {
  const ahora = Date.now()
  return { id: nuevoId(), visible: false, creado: ahora, actualizado: ahora, ...campos }
}

export function datosDemo(): Datos {
  const muelle = e({
    nombre: 'El Ancla Torcida',
    visible: true,
    tipoLugar: 'Taberna',
    zona: 'Muelles',
    descripcion: 'Humo de pipa, redes colgadas del techo y un loro que insulta a los clientes en tres idiomas.',
    secreto: 'Bajo la bodega hay un túnel que llega hasta un almacén abandonado del puerto.',
  })
  const almacen = e({
    nombre: 'Almacén de la Sal Gris',
    tipoLugar: 'Almacén',
    zona: 'Muelles',
    descripcion: 'Un edificio cerrado con tablones. Huele a salitre y a cera quemada.',
    secreto: 'Aquí se reúne la Hermandad del Farol cada tercera noche.',
  })
  const farol = e({
    nombre: 'Hermandad del Farol',
    actitud: 'Recelosa',
    renombre: 0,
    sede: almacen.id,
    descripcion: 'Un gremio de faroleros que dice velar por las calles de noche.',
    secreto: 'Contrabandean documentos robados y buscan una llave que alguien escondió en la ciudad.',
  })
  const guardia = e({
    nombre: 'Vigías del Puente',
    visible: true,
    actitud: 'Amistosa',
    renombre: 2,
    descripcion: 'Milicia vecinal que patrulla los puentes del distrito comercial.',
    secreto: 'Su capitana sospecha de la Hermandad, pero no tiene pruebas.',
  })
  const tabernera = e({
    nombre: 'Maela Brezo',
    visible: true,
    rol: 'Tabernera del Ancla Torcida',
    estado: 'Activo',
    lugar: muelle.id,
    actitud: 'Amistosa',
    voz: 'Habla rápido y llama «tesoro» a todo el mundo.',
    descripcion: 'Simpática y bien informada. Sirve el mejor guiso de pescado del puerto.',
    secreto: 'Debe dinero a la Hermandad y le pasa información sobre los clientes.',
  })
  const farolero = e({
    nombre: 'Osric Velo',
    rol: 'Farolero',
    estado: 'Desaparecido',
    faccion: farol.id,
    actitud: 'Indiferente',
    voz: 'Susurra y nunca mira a los ojos.',
    descripcion: '',
    secreto: 'Robó la llave a su propio gremio y se esconde en el túnel bajo la taberna.',
  })
  const capitana = e({
    nombre: 'Capitana Idris Mor',
    visible: true,
    rol: 'Capitana de los Vigías',
    estado: 'Activo',
    faccion: guardia.id,
    actitud: 'Amistosa',
    voz: 'Seca, militar, golpea la mesa con los nudillos al pensar.',
    descripcion: 'Os ofreció una recompensa si encontráis al farolero desaparecido.',
    secreto: 'Si el grupo le trae pruebas contra la Hermandad, les dará un salvoconducto.',
  })
  guardia.contacto = capitana.id

  const d = datosVacios()
  d.campana = {
    nombre: 'Campaña de prueba',
    diaJuego: 'Día 4, tarde lluviosa',
    notasRapidas: 'Recordar: el loro de la taberna repite lo que oye.',
  }
  d.lugares = [muelle, almacen]
  d.facciones = [farol, guardia]
  d.pnj = [tabernera, farolero, capitana]
  d.pistas = [
    e({
      nombre: 'Cera en los guantes',
      visible: true,
      origen: muelle.id,
      quien: tabernera.id,
      texto: 'Maela encontró unos guantes de farolero manchados de cera negra en la bodega.',
      secreto: 'Son de Osric. La cera negra solo se usa en el almacén de la Hermandad.',
    }),
    e({
      nombre: 'Un ruido bajo el suelo',
      origen: muelle.id,
      texto: 'De noche se oyen golpes que vienen de debajo de la bodega.',
      secreto: 'Osric está en el túnel. Si lo encuentran, negocia: la llave a cambio de protección.',
    }),
  ]
  d.pj = [
    e({ nombre: 'Tarsa', visible: true, jugador: 'Lucía', clase: 'Pícara', especie: 'Mediana', nivel: 2, ca: 14, pgMax: 15, percepcion: 14, perspicacia: 12, secreto: 'Su hermano trabaja para la Hermandad.' }),
    e({ nombre: 'Bruno el Rojo', visible: true, jugador: 'Pablo', clase: 'Guerrero', especie: 'Humano', nivel: 2, ca: 17, pgMax: 22, percepcion: 11, perspicacia: 10 }),
    e({ nombre: 'Vela', visible: true, jugador: 'Irene', clase: 'Clériga', especie: 'Elfa', nivel: 2, ca: 16, pgMax: 17, percepcion: 13, perspicacia: 15 }),
  ]
  d.sesiones = [
    e({
      nombre: 'Sesión 1: Una ronda en el Ancla',
      visible: true,
      fecha: '2026-11-07',
      diaJuego: 'Día 1',
      resumen: 'El grupo se conoce en el Ancla Torcida y acepta buscar al farolero desaparecido.',
      secreto: 'Maela ha avisado a la Hermandad de que el grupo hace preguntas.',
    }),
    e({
      nombre: 'Sesión 2',
      fecha: '2026-11-21',
      diaJuego: 'Día 4',
      preparacion: 'Abrir con los golpes bajo la bodega. Si bajan, encuentro con dos matones de la Hermandad.',
    }),
  ]
  d.combate = {
    activo: false,
    ronda: 1,
    turno: 0,
    combatientes: [
      { id: nuevoId(), nombre: 'Matón 1', tipo: 'enemigo', iniciativa: 12, ca: 12, pg: 11, pgMax: 11, condiciones: [] },
      { id: nuevoId(), nombre: 'Matón 2', tipo: 'enemigo', iniciativa: 8, ca: 12, pg: 11, pgMax: 11, condiciones: [] },
    ],
  }
  return d
}
