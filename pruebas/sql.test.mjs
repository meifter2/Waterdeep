// Valida bd/esquema.sql + 002-biblioteca + 003-enlaces-audio + 004-sesiones + 005-carpetas-biblioteca en Postgres real (PGlite, WASM) con un
// «Supabase mínimo» simulado: auth.users, auth.uid(), roles anon/authenticated y Storage.
// No sustituye a probar en Supabase, pero comprueba sintaxis, migración, idempotencia, RLS y claves.
import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'

const raiz = new URL('../', import.meta.url)
const sql = (f) => readFileSync(new URL(f, raiz), 'utf8')
const A = '00000000-0000-0000-0000-00000000000a'
const B = '00000000-0000-0000-0000-00000000000b'
let fallos = 0
const comprobar = (n, ok, extra = '') => {
  if (!ok) fallos++
  console.log(ok ? 'OK ' : 'MAL', n, extra)
}
const db = new PGlite()
const uno = async (q, p) => (await db.query(q, p)).rows[0]
const cuenta = async (t) => Number((await uno(`select count(*)::int as n from ${t}`)).n)
const falla = async (q) => {
  try {
    await db.exec(q)
    return false
  } catch {
    return true
  }
}
const comoUsuario = async (id) => db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${id}', false);`)
const comoAdmin = async () => db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`)

// ── Supabase mínimo ──
await db.exec(`
  create role anon nologin; create role authenticated nologin; create role service_role nologin;
  create schema auth; create schema storage;
  create table auth.users (id uuid primary key, email text);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
  create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets(id), name text, owner uuid);
  alter table storage.objects enable row level security;
  create function storage.foldername(name text) returns text[] language sql immutable as $$ select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;
  grant usage on schema public, auth, storage to anon, authenticated;
  grant execute on function auth.uid() to anon, authenticated;
  grant select, insert, update, delete on storage.objects to authenticated;
  grant select on storage.buckets to authenticated;
  insert into auth.users values ('${A}', 'a@x.com'), ('${B}', 'b@x.com');
`)

await db.exec(sql('bd/esquema.sql'))
const X = 'https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT?si=1'
const Y = 'https://youtu.be/dQw4w9WgXcQ'
await db.query(
  `insert into public.canciones (user_id, tipo, nombre, enlace, nota) values
   ($1,'personaje','Idris',$3,'Snowbelle City'), ($1,'lugar','Ancla',$4,''), ($1,'momento','Persecución',$3,'otra nota'),
   ($1,'ending','Sin enlace','',''), ($2,'personaje','Otro máster',$3,'')`,
  [A, B, X, Y],
)

// ── Migración (dos veces) ──
await db.exec(sql('bd/002-biblioteca.sql'))
const e1 = await cuenta('public.elementos'), r1 = await cuenta('public.recursos'), p1 = await cuenta('public.pistas')
comprobar('Migra un elemento por canción', e1 === 5, `(${e1})`)
comprobar('Un recurso por enlace distinto y usuario (reutiliza)', r1 === 3, `(${r1})`)
comprobar('Una pista por canción con enlace', p1 === 4, `(${p1})`)
const idris = await uno(`select e.tipo, r.origen, r.titulo, p.etiqueta, p.bucle from public.elementos e
  join public.pistas p on p.elemento_id = e.id join public.recursos r on r.id = p.recurso_id where e.nombre = 'Idris'`)
comprobar('Conserva carpeta, origen y título', idris?.tipo === 'personaje' && idris.origen === 'spotify' && idris.titulo === 'Snowbelle City' && idris.etiqueta === 'Tema principal' && idris.bucle === true)
comprobar('Detecta YouTube', (await uno(`select origen from public.recursos where enlace = $1`, [Y]))?.origen === 'youtube')

await db.exec(sql('bd/002-biblioteca.sql'))
comprobar('Repetir la migración no duplica nada', (await cuenta('public.elementos')) === e1 && (await cuenta('public.recursos')) === r1 && (await cuenta('public.pistas')) === p1)
await db.query(`insert into public.canciones (user_id, tipo, nombre, enlace) values ($1, 'lugar', 'Nueva', $2)`, [A, Y])
await db.exec(sql('bd/002-biblioteca.sql'))
comprobar('Una canción nueva se migra al repetir y reutiliza su recurso', (await cuenta('public.elementos')) === e1 + 1 && (await cuenta('public.recursos')) === r1 && (await cuenta('public.pistas')) === p1 + 1)
comprobar('La tabla canciones queda intacta', (await cuenta('public.canciones')) === 6)
comprobar('Repetir esquema.sql (original) sigue funcionando', !(await falla(sql('bd/esquema.sql'))))

// ── Restricciones ──
comprobar('Recurso de archivo sin ruta: rechazado', await falla(`insert into public.recursos (user_id, origen, titulo) values ('${A}', 'archivo', 'x')`))
comprobar('Tramo con fin antes del inicio: rechazado', await falla(`insert into public.pistas (user_id, elemento_id, recurso_id, inicio_ms, fin_ms)
  select '${A}', e.id, r.id, 5000, 1000 from public.elementos e, public.recursos r where e.user_id = '${A}' and r.user_id = '${A}' limit 1`))

// ── 003: enlaces directos de audio ──
const urlOk = `insert into public.recursos (user_id, origen, titulo, enlace) values ('${A}', 'url', 'Lluvia', 'https://sonidos.example/lluvia.mp3')`
comprobar('Antes de 003, un enlace de audio se rechaza', await falla(urlOk))
const antes003 = [await cuenta('public.elementos'), await cuenta('public.recursos'), await cuenta('public.pistas')]
await db.exec(sql('bd/003-enlaces-audio.sql'))
await db.exec(sql('bd/003-enlaces-audio.sql'))
comprobar('003 se puede repetir y no toca ninguna fila', JSON.stringify(antes003) === JSON.stringify([await cuenta('public.elementos'), await cuenta('public.recursos'), await cuenta('public.pistas')]))
comprobar('Con 003, un enlace https de audio se guarda', !(await falla(urlOk)))
comprobar('Enlace de audio http (no seguro): rechazado', await falla(`insert into public.recursos (user_id, origen, enlace) values ('${A}', 'url', 'http://sonidos.example/a.mp3')`))
comprobar('Enlace de audio sin enlace: rechazado', await falla(`insert into public.recursos (user_id, origen) values ('${A}', 'url')`))
comprobar('Enlace de audio con archivo en Storage: rechazado', await falla(`insert into public.recursos (user_id, origen, enlace, archivo_ruta) values ('${A}', 'url', 'https://s.example/a.mp3', '${A}/a.mp3')`))
comprobar('Un origen desconocido sigue rechazado', await falla(`insert into public.recursos (user_id, origen, enlace) values ('${A}', 'otro', 'https://s.example/a.mp3')`))
comprobar('Tras 003, archivo sin ruta sigue rechazado', await falla(`insert into public.recursos (user_id, origen, titulo) values ('${A}', 'archivo', 'x')`))
await db.exec(`delete from public.recursos where origen = 'url'`)

// ── RLS como usuario A ──
await comoUsuario(A)
comprobar('A solo ve sus elementos', (await cuenta('public.elementos')) === 5)
comprobar('A solo ve sus recursos', (await cuenta('public.recursos')) === 2)
const deA = await uno(`select id from public.elementos where nombre = 'Ancla'`)
const recB = (await comoAdmin(), await uno(`select id from public.recursos where user_id = '${B}'`))
await comoUsuario(A)
comprobar('A no puede usar un recurso de B en su elemento', await falla(`insert into public.pistas (elemento_id, recurso_id) values ('${deA.id}', '${recB.id}')`))
comprobar('A no puede regalar su elemento a B', await falla(`update public.elementos set user_id = '${B}' where id = '${deA.id}'`))
const nuevo = await uno(`insert into public.recursos (origen, titulo, archivo_ruta, archivo_bytes) values ('archivo', 'Lluvia', '${A}/lluvia.mp3', 1000) returning id, user_id`)
comprobar('A crea un recurso sin enviar user_id (lo pone auth.uid())', nuevo?.user_id === A)
comprobar('A borra un elemento y sus recursos siguen', await (async () => {
  const antes = await cuenta('public.recursos')
  await db.exec(`delete from public.elementos where id = '${deA.id}'`)
  return (await cuenta('public.recursos')) === antes
})())
comprobar('A sube a su carpeta de Storage', !(await falla(`insert into storage.objects (bucket_id, name) values ('audio', '${A}/lluvia.mp3')`)))
comprobar('A no puede subir a la carpeta de B', await falla(`insert into storage.objects (bucket_id, name) values ('audio', '${B}/robo.mp3')`))
comprobar('A no puede subir a otros buckets', await falla(`insert into storage.objects (bucket_id, name) values ('otro', '${A}/x.mp3')`))

// ── Anónimo ──
await db.exec(`reset role; set role anon;`)
comprobar('Sin sesión no se lee nada', await falla(`select * from public.elementos`))
await comoAdmin()
const cubo = await uno(`select public, file_size_limit from storage.buckets where id = 'audio'`)
comprobar('Bucket de audio privado y con límite de 50 MB', cubo?.public === false && Number(cubo.file_size_limit) === 52428800)

// ── 004: sesiones (muchos a muchos) ──
await comoAdmin()
const nucleo = async () => [await cuenta('public.elementos'), await cuenta('public.recursos'), await cuenta('public.pistas')].join()
const antes004 = await nucleo()
await db.exec(sql('bd/004-sesiones.sql'))
await db.exec(sql('bd/004-sesiones.sql'))
comprobar('004 se puede repetir y no toca elementos, recursos ni pistas', (await nucleo()) === antes004)
comprobar('004 no asigna nada automáticamente', (await cuenta('public.sesiones')) === 0 && (await cuenta('public.sesion_elementos')) === 0 && (await cuenta('public.elementos_comunes')) === 0)
const elemB = await uno(`select id from public.elementos where user_id = '${B}' limit 1`)
await comoUsuario(B)
const sesB = await uno(`insert into public.sesiones (nombre) values ('Sesión de B') returning id`)
await comoUsuario(A)
const [t1, t2] = (await db.query(`select id from public.elementos order by nombre limit 2`)).rows
const s1 = await uno(`insert into public.sesiones (nombre) values ('Sesión 1') returning id, user_id`)
const s2 = await uno(`insert into public.sesiones (nombre) values ('Sesión 2') returning id`)
comprobar('A crea sesiones sin enviar user_id', s1?.user_id === A)
comprobar('Nombre de sesión vacío: rechazado', await falla(`insert into public.sesiones (nombre) values ('   ')`))
await db.exec(`insert into public.sesion_elementos (sesion_id, elemento_id) values ('${s1.id}', '${t1.id}'), ('${s2.id}', '${t1.id}'), ('${s1.id}', '${t2.id}')`)
comprobar('Una tarjeta en varias sesiones sin duplicarse', (await cuenta('public.sesion_elementos')) === 3 && (await cuenta('public.elementos')) === 4)
comprobar('La misma tarjeta dos veces en la misma sesión: rechazado', await falla(`insert into public.sesion_elementos (sesion_id, elemento_id) values ('${s1.id}', '${t1.id}')`))
comprobar('A no ve las sesiones de B', (await cuenta('public.sesiones')) === 2)
comprobar('A no puede meter una tarjeta de B en su sesión', await falla(`insert into public.sesion_elementos (sesion_id, elemento_id) values ('${s1.id}', '${elemB.id}')`))
comprobar('A no puede meter su tarjeta en una sesión de B', await falla(`insert into public.sesion_elementos (sesion_id, elemento_id) values ('${sesB.id}', '${t1.id}')`))
comprobar('A marca una tarjeta como común', !(await falla(`insert into public.elementos_comunes (elemento_id) values ('${t2.id}')`)))
comprobar('A no puede marcar como común una tarjeta de B', await falla(`insert into public.elementos_comunes (elemento_id) values ('${elemB.id}')`))
await db.exec(`delete from public.sesion_elementos where sesion_id = '${s2.id}' and elemento_id = '${t1.id}'`)
comprobar('Quitar una tarjeta de una sesión no borra la tarjeta ni sus pistas', (await cuenta('public.elementos')) === 4 && (await cuenta('public.sesion_elementos')) === 2)
const pistasA = await cuenta('public.pistas')
await db.exec(`delete from public.sesiones where id = '${s1.id}'`)
comprobar('Borrar una sesión: se van sus relaciones, NO las tarjetas, pistas ni recursos', (await cuenta('public.sesion_elementos')) === 0 && (await cuenta('public.elementos')) === 4 && (await cuenta('public.pistas')) === pistasA)
await comoUsuario(B)
comprobar('B no ve las sesiones, relaciones ni comunes de A', (await cuenta('public.sesiones')) === 1 && (await cuenta('public.elementos_comunes')) === 0)
await db.exec(`reset role; set role anon;`)
comprobar('Sin sesión no se leen sesiones', await falla(`select * from public.sesiones`))
await comoAdmin()
await db.exec(`delete from public.elementos where id = '${t2.id}'`)
comprobar('Borrar una tarjeta quita también su marca de común', (await cuenta('public.elementos_comunes')) === 0)

// ── 005: carpetas temáticas de Main ──
await comoAdmin()
// Escenario real: Sesión 1 y Sesión 2 ya existen con tarjetas (y una común) ANTES de ejecutar la 005.
await comoUsuario(A)
const [u1, u2, u3] = (await db.query(`select id, tipo from public.elementos order by nombre`)).rows
const se1 = await uno(`insert into public.sesiones (nombre) values ('Sesión 1') returning id`)
const se2 = await uno(`insert into public.sesiones (nombre) values ('Sesión 2') returning id`)
await db.exec(`insert into public.sesion_elementos (sesion_id, elemento_id) values ('${se1.id}', '${u1.id}'), ('${se2.id}', '${u1.id}'), ('${se2.id}', '${u2.id}');
  insert into public.elementos_comunes (elemento_id) values ('${u3.id}')`)
await comoAdmin()
const foto = async () => JSON.stringify([
  (await db.query(`select id, tipo, nombre, orden, retrato_ruta from public.elementos order by id`)).rows,
  (await db.query(`select id, elemento_id, recurso_id, inicio_ms, fin_ms, bucle, orden from public.pistas order by id`)).rows,
  (await db.query(`select id from public.recursos order by id`)).rows,
  (await db.query(`select id, nombre, finalizada from public.sesiones order by id`)).rows,
  (await db.query(`select sesion_id, elemento_id from public.sesion_elementos order by id`)).rows,
  (await db.query(`select elemento_id from public.elementos_comunes order by id`)).rows,
])
const antes005 = await foto()
await db.exec(sql('bd/005-carpetas-biblioteca.sql'))
await db.exec(sql('bd/005-carpetas-biblioteca.sql'))
comprobar('005 se puede repetir y NO cambia tarjetas, pistas, sonidos, sesiones ni sus relaciones', (await foto()) === antes005)
comprobar('005 no mueve nada: todo empieza «Sin carpeta»', (await cuenta('public.carpetas')) === 0 && (await cuenta('public.carpeta_elementos')) === 0)
await comoUsuario(B)
const carB = await uno(`insert into public.carpetas (tipo, nombre) values ('personaje', 'Carpeta de B') returning id`)
await comoUsuario(A)
const tipoDe = u1.tipo
const otroTipo = tipoDe === 'momento' ? 'lugar' : 'momento'
const c1 = await uno(`insert into public.carpetas (tipo, nombre) values ('${tipoDe}', 'Xanathar') returning id, user_id`)
const c2 = await uno(`insert into public.carpetas (tipo, nombre, orden) values ('${tipoDe}', 'Zhentarim', 1) returning id`)
const cOtra = await uno(`insert into public.carpetas (tipo, nombre) values ('${otroTipo}', 'Drama') returning id`)
comprobar('A crea carpetas sin enviar user_id', c1?.user_id === A)
comprobar('Nombre de carpeta vacío: rechazado', await falla(`insert into public.carpetas (tipo, nombre) values ('${tipoDe}', '  ')`))
comprobar('Nombre repetido en la misma categoría: rechazado', await falla(`insert into public.carpetas (tipo, nombre) values ('${tipoDe}', ' xanathar ')`))
comprobar('El mismo nombre en otra categoría: permitido', !(await falla(`insert into public.carpetas (tipo, nombre) values ('${otroTipo}', 'Xanathar')`)))
comprobar('Categoría inventada: rechazada', await falla(`insert into public.carpetas (tipo, nombre) values ('octava', 'Nada')`))
const rel = await uno(`insert into public.carpeta_elementos (carpeta_id, elemento_id) values ('${c1.id}', '${u1.id}') returning id`)
comprobar('Meter una tarjeta en una carpeta', !!rel?.id)
comprobar('Una tarjeta solo en UNA carpeta', await falla(`insert into public.carpeta_elementos (carpeta_id, elemento_id) values ('${c2.id}', '${u1.id}')`))
comprobar('Una tarjeta no entra en una carpeta de otra categoría', await falla(`insert into public.carpeta_elementos (carpeta_id, elemento_id) values ('${cOtra.id}', '${u1.id}')`))
await db.exec(`update public.carpeta_elementos set carpeta_id = '${c2.id}' where id = '${rel.id}'`)
comprobar('Mover de carpeta (actualizar la relación)', (await uno(`select carpeta_id from public.carpeta_elementos where id = '${rel.id}'`)).carpeta_id === c2.id)
comprobar('Mover a otra categoría por actualización: rechazado', await falla(`update public.carpeta_elementos set carpeta_id = '${cOtra.id}' where id = '${rel.id}'`))
comprobar('A no puede meter su tarjeta en una carpeta de B', await falla(`insert into public.carpeta_elementos (carpeta_id, elemento_id) values ('${carB.id}', '${u2.id}')`))
comprobar('A no puede meter una tarjeta de B en su carpeta', await falla(`insert into public.carpeta_elementos (carpeta_id, elemento_id) values ('${c1.id}', '${elemB.id}')`))
comprobar('Mover de carpeta no toca sus sesiones', (await db.query(`select 1 from public.sesion_elementos where elemento_id = '${u1.id}'`)).rows.length === 2)
const pistas005 = await cuenta('public.pistas')
await db.exec(`delete from public.carpetas where id = '${c2.id}'`)
comprobar('Borrar una carpeta: su tarjeta vuelve a «Sin carpeta» sin perder pistas ni sesiones', (await cuenta('public.carpeta_elementos')) === 0 && (await cuenta('public.elementos')) === 3 && (await cuenta('public.pistas')) === pistas005 && (await cuenta('public.sesion_elementos')) === 3)
await comoUsuario(B)
comprobar('B no ve las carpetas de A', (await cuenta('public.carpetas')) === 1)
comprobar('B no puede renombrar ni borrar carpetas de A', (await db.query(`update public.carpetas set nombre = 'Hackeada' where id = '${c1.id}' returning id`)).rows.length === 0 && (await db.query(`delete from public.carpetas where id = '${c1.id}' returning id`)).rows.length === 0)
await db.exec(`reset role; set role anon;`)
comprobar('Sin sesión no se leen carpetas', await falla(`select * from public.carpetas`))
await comoAdmin()
await db.exec(`insert into public.carpeta_elementos (user_id, carpeta_id, elemento_id) values ('${A}', '${c1.id}', '${u1.id}')`)
await db.exec(`delete from public.elementos where id = '${u1.id}'`)
comprobar('Borrar una tarjeta quita su relación con la carpeta (la carpeta sigue)', (await cuenta('public.carpeta_elementos')) === 0 && (await cuenta(`public.carpetas where id = '${c1.id}'`)) === 1)

console.log(fallos ? `\n${fallos} FALLOS` : '\nTodas las comprobaciones correctas')
process.exit(fallos ? 1 : 0)
