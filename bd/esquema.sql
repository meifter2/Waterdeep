-- Banda sonora: canciones de cada usuario, organizadas en carpetas.
-- Pegar entero en Supabase › SQL Editor › New query › Run. Se puede ejecutar más de una vez.

create schema if not exists private;

create table if not exists public.canciones (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  tipo text not null check (tipo in ('opening', 'ending', 'personaje', 'lugar', 'momento')),
  nombre text not null check (char_length(btrim(nombre)) between 1 and 120),
  enlace text not null default '' check (char_length(enlace) <= 500),
  nota text not null default '' check (char_length(nota) <= 300),
  orden integer not null default 0,
  creado timestamptz not null default now(),
  actualizado timestamptz not null default now()
);

-- Las consultas siempre filtran por usuario (RLS) y se agrupan por carpeta.
create index if not exists canciones_user_id_tipo_idx on public.canciones (user_id, tipo);

-- Seguridad: solo usuarios con sesión y solo sus propias filas.
alter table public.canciones enable row level security;

revoke all on public.canciones from anon;
grant select, insert, update, delete on public.canciones to authenticated;

drop policy if exists "canciones: ver las mías" on public.canciones;
create policy "canciones: ver las mías" on public.canciones
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "canciones: crear las mías" on public.canciones;
create policy "canciones: crear las mías" on public.canciones
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "canciones: editar las mías" on public.canciones;
create policy "canciones: editar las mías" on public.canciones
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "canciones: borrar las mías" on public.canciones;
create policy "canciones: borrar las mías" on public.canciones
  for delete to authenticated
  using ((select auth.uid()) = user_id);

-- Fecha de última edición automática (función en esquema privado, no expuesto).
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

drop trigger if exists canciones_actualizado on public.canciones;
create trigger canciones_actualizado
  before update on public.canciones
  for each row execute function private.tocar_actualizado();
