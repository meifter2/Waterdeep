-- DFY · 005: carpetas temáticas de Main («Xanathar», «Tabernas», «Drama»…) dentro de cada categoría.
-- Un solo nivel: cada carpeta pertenece a UNA categoría (personaje, lugar, momento…) y cada tarjeta está como mucho en UNA
-- carpeta. Es independiente de las sesiones (004) y de los sonidos: mover una tarjeta de carpeta no cambia sus sesiones,
-- sus pistas ni sus archivos.
--
-- SEGURA E IDEMPOTENTE: solo AÑADE dos tablas nuevas. No modifica elementos, recursos, pistas, sesiones ni sus relaciones.
-- No mueve nada: tras ejecutarla, todas las tarjetas siguen en «Sin carpeta».
-- Requiere 002 (y es independiente de 004). Uso: Supabase › SQL Editor › New query › pegar todo › Run.

begin;

-- ───────────── Carpetas temáticas (una categoría cada una) ─────────────
create table if not exists public.carpetas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  tipo text not null check (tipo in ('opening', 'ending', 'personaje', 'lugar', 'momento', 'ambiente', 'efecto')),
  nombre text not null check (char_length(btrim(nombre)) between 1 and 60),
  orden integer not null default 0,
  creado timestamptz not null default now(),
  actualizado timestamptz not null default now(),
  unique (id, user_id)
);
-- Sin nombres repetidos en la misma categoría (sin distinguir mayúsculas ni espacios de los extremos).
create unique index if not exists carpetas_nombre_unico on public.carpetas (user_id, tipo, lower(btrim(nombre)));
create index if not exists carpetas_user_id_tipo_idx on public.carpetas (user_id, tipo);

-- ───────────── En qué carpeta está cada tarjeta (como mucho una) ─────────────
-- Las claves compuestas (…, user_id) impiden meter una tarjeta en la carpeta de otro usuario (o la de otro en la tuya).
-- Borrar una carpeta borra solo estas filas: sus tarjetas vuelven a «Sin carpeta». Borrar una tarjeta, su fila.
create table if not exists public.carpeta_elementos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  carpeta_id uuid not null,
  elemento_id uuid not null,
  creado timestamptz not null default now(),
  actualizado timestamptz not null default now(),
  unique (elemento_id),
  foreign key (carpeta_id, user_id) references public.carpetas (id, user_id) on delete cascade,
  foreign key (elemento_id, user_id) references public.elementos (id, user_id) on delete cascade
);
create index if not exists carpeta_elementos_carpeta_idx on public.carpeta_elementos (carpeta_id, user_id);
create index if not exists carpeta_elementos_elemento_idx on public.carpeta_elementos (elemento_id, user_id);
create index if not exists carpeta_elementos_user_id_idx on public.carpeta_elementos (user_id);

-- ───────────── Seguridad: solo usuarios con sesión y solo sus filas ─────────────
alter table public.carpetas enable row level security;
alter table public.carpeta_elementos enable row level security;

revoke all on public.carpetas, public.carpeta_elementos from anon;
grant select, insert, update, delete on public.carpetas, public.carpeta_elementos to authenticated;

drop policy if exists "carpetas: ver las mías" on public.carpetas;
create policy "carpetas: ver las mías" on public.carpetas for select to authenticated
  using ((select auth.uid()) = user_id);
drop policy if exists "carpetas: crear las mías" on public.carpetas;
create policy "carpetas: crear las mías" on public.carpetas for insert to authenticated
  with check ((select auth.uid()) = user_id);
drop policy if exists "carpetas: editar las mías" on public.carpetas;
create policy "carpetas: editar las mías" on public.carpetas for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists "carpetas: borrar las mías" on public.carpetas;
create policy "carpetas: borrar las mías" on public.carpetas for delete to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "carpeta_elementos: ver los míos" on public.carpeta_elementos;
create policy "carpeta_elementos: ver los míos" on public.carpeta_elementos for select to authenticated
  using ((select auth.uid()) = user_id);
drop policy if exists "carpeta_elementos: crear los míos" on public.carpeta_elementos;
create policy "carpeta_elementos: crear los míos" on public.carpeta_elementos for insert to authenticated
  with check ((select auth.uid()) = user_id);
drop policy if exists "carpeta_elementos: mover los míos" on public.carpeta_elementos;
create policy "carpeta_elementos: mover los míos" on public.carpeta_elementos for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists "carpeta_elementos: borrar los míos" on public.carpeta_elementos;
create policy "carpeta_elementos: borrar los míos" on public.carpeta_elementos for delete to authenticated
  using ((select auth.uid()) = user_id);

-- Una tarjeta solo entra en una carpeta de SU categoría («Drama» es de Momentos: un personaje no puede ir ahí).
create or replace function private.carpeta_misma_categoria()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.carpetas c join public.elementos e on e.id = new.elemento_id and e.user_id = c.user_id
    where c.id = new.carpeta_id and c.tipo = e.tipo
  ) then
    raise exception 'La tarjeta y la carpeta son de categorías distintas' using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke execute on function private.carpeta_misma_categoria() from public, anon, authenticated;

drop trigger if exists carpeta_elementos_misma_categoria on public.carpeta_elementos;
create trigger carpeta_elementos_misma_categoria before insert or update of carpeta_id, elemento_id on public.carpeta_elementos
  for each row execute function private.carpeta_misma_categoria();

drop trigger if exists carpetas_actualizado on public.carpetas;
create trigger carpetas_actualizado before update on public.carpetas
  for each row execute function private.tocar_actualizado();
drop trigger if exists carpeta_elementos_actualizado on public.carpeta_elementos;
create trigger carpeta_elementos_actualizado before update on public.carpeta_elementos
  for each row execute function private.tocar_actualizado();

commit;
