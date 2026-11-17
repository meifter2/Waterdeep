// Valida bd/esquema.sql + bd/002-biblioteca.sql en Postgres real (PGlite, WASM) con un
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

console.log(fallos ? `\n${fallos} FALLOS` : '\nTodas las comprobaciones correctas')
process.exit(fallos ? 1 : 0)
