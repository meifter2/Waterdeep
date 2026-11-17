-- Banda sonora · Migración 002: biblioteca de sonidos.
-- Elementos (personajes, lugares, ambientes…), recursos de audio (Spotify, YouTube, archivos propios)
-- y pistas (el uso de un recurso dentro de un elemento, con su tramo y bucle).
--
-- SEGURA E IDEMPOTENTE: solo añade. No borra ni modifica la tabla `canciones`.
-- Se puede ejecutar varias veces: las canciones ya migradas no se duplican.
-- Requiere haber ejecutado antes bd/esquema.sql.
-- Uso: Supabase › SQL Editor › New query › pegar todo › Run.

begin;

create schema if not exists private;

-- Fecha de última edición automática (ya existe si se ejecutó esquema.sql; se reafirma).
create or replace function private.tocar_actualizado()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.actualizado := now();
  return new;
end;
$$;
revoke execute on function private.tocar_actualizado() from public, anon, authenticated;

-- ───────────── Elementos: lo que el máster pulsa en la mesa ─────────────
create table if not exists public.elementos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  tipo text not null check (tipo in ('opening', 'ending', 'personaje', 'lugar', 'momento', 'ambiente', 'efecto')),
  nombre text not null check (char_length(btrim(nombre)) between 1 and 120),
  descripcion text not null default '' check (char_length(descripcion) <= 500),
  retrato_ruta text check (retrato_ruta is null or char_length(retrato_ruta) <= 300),
  orden integer not null default 0,
  migrado_de uuid unique,
  creado timestamptz not null default now(),
  actualizado timestamptz not null default now(),
  unique (id, user_id)
);
create index if not exists elementos_user_id_tipo_idx on public.elementos (user_id, tipo);

-- ───────────── Recursos: sonidos de la biblioteca ─────────────
create table if not exists public.recursos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  origen text not null check (origen in ('spotify', 'youtube', 'archivo')),
  titulo text not null default '' check (char_length(titulo) <= 200),
  descripcion text not null default '' check (char_length(descripcion) <= 500),
  enlace text not null default '' check (char_length(enlace) <= 500),
  archivo_ruta text check (archivo_ruta is null or char_length(archivo_ruta) <= 300),
  archivo_nombre text not null default '' check (char_length(archivo_nombre) <= 200),
  archivo_tipo text not null default '' check (char_length(archivo_tipo) <= 100),
  archivo_bytes bigint check (archivo_bytes is null or archivo_bytes >= 0),
  archivo_hash text check (archivo_hash is null or archivo_hash ~ '^[0-9a-f]{64}$'),
  duracion_ms integer check (duracion_ms is null or duracion_ms >= 0),
  creado timestamptz not null default now(),
  actualizado timestamptz not null default now(),
  unique (id, user_id),
  check ((origen = 'archivo') = (archivo_ruta is not null)),
  check (origen = 'archivo' or enlace <> '')
);
create index if not exists recursos_user_id_idx on public.recursos (user_id);

-- ───────────── Pistas: un recurso usado en un elemento ─────────────
-- Las claves compuestas (id, user_id) garantizan que elemento, recurso y pista son del mismo usuario.
-- Borrar un elemento borra sus pistas, NO sus recursos ni archivos.
create table if not exists public.pistas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  elemento_id uuid not null,
  recurso_id uuid not null,
  etiqueta text not null default '' check (char_length(etiqueta) <= 60),
  inicio_ms integer check (inicio_ms is null or inicio_ms >= 0),
  fin_ms integer check (fin_ms is null or fin_ms > 0),
  bucle boolean not null default false,
  orden integer not null default 0,
  creado timestamptz not null default now(),
  foreign key (elemento_id, user_id) references public.elementos (id, user_id) on delete cascade,
  foreign key (recurso_id, user_id) references public.recursos (id, user_id) on delete cascade,
  check (fin_ms is null or inicio_ms is null or fin_ms > inicio_ms)
);
create index if not exists pistas_elemento_id_idx on public.pistas (elemento_id);
create index if not exists pistas_recurso_id_idx on public.pistas (recurso_id);
create index if not exists pistas_user_id_idx on public.pistas (user_id);

-- ───────────── Seguridad: solo usuarios con sesión y solo sus filas ─────────────
alter table public.elementos enable row level security;
alter table public.recursos enable row level security;
alter table public.pistas enable row level security;

revoke all on public.elementos, public.recursos, public.pistas from anon;
grant select, insert, update, delete on public.elementos, public.recursos, public.pistas to authenticated;

drop policy if exists "elementos: ver los míos" on public.elementos;
create policy "elementos: ver los míos" on public.elementos for select to authenticated
  using ((select auth.uid()) = user_id);
drop policy if exists "elementos: crear los míos" on public.elementos;
create policy "elementos: crear los míos" on public.elementos for insert to authenticated
  with check ((select auth.uid()) = user_id);
drop policy if exists "elementos: editar los míos" on public.elementos;
create policy "elementos: editar los míos" on public.elementos for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists "elementos: borrar los míos" on public.elementos;
create policy "elementos: borrar los míos" on public.elementos for delete to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "recursos: ver los míos" on public.recursos;
create policy "recursos: ver los míos" on public.recursos for select to authenticated
  using ((select auth.uid()) = user_id);
drop policy if exists "recursos: crear los míos" on public.recursos;
create policy "recursos: crear los míos" on public.recursos for insert to authenticated
  with check ((select auth.uid()) = user_id);
drop policy if exists "recursos: editar los míos" on public.recursos;
create policy "recursos: editar los míos" on public.recursos for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists "recursos: borrar los míos" on public.recursos;
create policy "recursos: borrar los míos" on public.recursos for delete to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "pistas: ver las mías" on public.pistas;
create policy "pistas: ver las mías" on public.pistas for select to authenticated
  using ((select auth.uid()) = user_id);
drop policy if exists "pistas: crear las mías" on public.pistas;
create policy "pistas: crear las mías" on public.pistas for insert to authenticated
  with check ((select auth.uid()) = user_id);
drop policy if exists "pistas: editar las mías" on public.pistas;
create policy "pistas: editar las mías" on public.pistas for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists "pistas: borrar las mías" on public.pistas;
create policy "pistas: borrar las mías" on public.pistas for delete to authenticated
  using ((select auth.uid()) = user_id);

drop trigger if exists elementos_actualizado on public.elementos;
create trigger elementos_actualizado before update on public.elementos
  for each row execute function private.tocar_actualizado();
drop trigger if exists recursos_actualizado on public.recursos;
create trigger recursos_actualizado before update on public.recursos
  for each row execute function private.tocar_actualizado();

-- ───────────── Storage privado: audio y retratos ─────────────
-- Ruta de cada archivo: <id del usuario>/<nombre>. Cada usuario solo accede a su carpeta.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('audio', 'audio', false, 52428800, array[
    'audio/mpeg', 'audio/mp3', 'audio/mp4', 'audio/x-m4a', 'audio/aac', 'audio/ogg', 'audio/opus',
    'audio/wav', 'audio/x-wav', 'audio/wave', 'audio/webm', 'audio/flac', 'audio/x-flac']),
  ('retratos', 'retratos', false, 5242880, array['image/webp', 'image/jpeg', 'image/png'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "banda sonora: ver mis archivos" on storage.objects;
create policy "banda sonora: ver mis archivos" on storage.objects for select to authenticated
  using (bucket_id in ('audio', 'retratos') and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists "banda sonora: subir mis archivos" on storage.objects;
create policy "banda sonora: subir mis archivos" on storage.objects for insert to authenticated
  with check (bucket_id in ('audio', 'retratos') and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists "banda sonora: cambiar mis archivos" on storage.objects;
create policy "banda sonora: cambiar mis archivos" on storage.objects for update to authenticated
  using (bucket_id in ('audio', 'retratos') and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id in ('audio', 'retratos') and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists "banda sonora: borrar mis archivos" on storage.objects;
create policy "banda sonora: borrar mis archivos" on storage.objects for delete to authenticated
  using (bucket_id in ('audio', 'retratos') and (storage.foldername(name))[1] = (select auth.uid())::text);

-- ───────────── Copia de `canciones` (no la modifica) ─────────────
-- 1) Un elemento por canción.
insert into public.elementos (user_id, tipo, nombre, orden, migrado_de, creado)
select c.user_id, c.tipo, c.nombre, c.orden, c.id, c.creado
from public.canciones c
where not exists (select 1 from public.elementos e where e.migrado_de = c.id);

-- 2) Un recurso por enlace distinto (por usuario). La nota antigua solía ser el título de la canción.
insert into public.recursos (user_id, origen, titulo, enlace, creado)
select distinct on (c.user_id, btrim(c.enlace))
  c.user_id,
  case when c.enlace ~* '(spotify\.com|^\s*spotify:)' then 'spotify' else 'youtube' end,
  left(c.nota, 200),
  btrim(c.enlace),
  c.creado
from public.canciones c
where btrim(c.enlace) ~* '(spotify\.com|^spotify:|youtube\.com|youtu\.be|youtube-nocookie\.com)'
  and not exists (
    select 1 from public.recursos r where r.user_id = c.user_id and r.enlace = btrim(c.enlace)
  )
order by c.user_id, btrim(c.enlace), c.creado;

-- 3) Una pista «Tema principal» por elemento migrado que aún no tenga pistas.
insert into public.pistas (user_id, elemento_id, recurso_id, etiqueta, bucle)
select e.user_id, e.id, r.id, 'Tema principal', true
from public.canciones c
join public.elementos e on e.migrado_de = c.id
join lateral (
  select r.id from public.recursos r
  where r.user_id = c.user_id and r.enlace = btrim(c.enlace)
  order by r.creado
  limit 1
) r on true
where not exists (select 1 from public.pistas p where p.elemento_id = e.id);

commit;
