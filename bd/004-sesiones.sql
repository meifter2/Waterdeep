-- DFY · 004: organización por sesiones de juego.
-- Carpetas de sesión («Sesión 1», «Sesión 2»…) y en qué sesiones aparece cada tarjeta (muchos a muchos),
-- más las tarjetas «comunes» que aparecen en todas. Una tarjeta puede estar en varias sesiones SIN duplicarse:
-- solo se guarda la relación; no se copian elementos, recursos, pistas, retratos ni archivos.
--
-- SEGURA E IDEMPOTENTE: solo AÑADE tablas nuevas. No modifica ni borra elementos, recursos, pistas ni archivos.
-- No asigna nada automáticamente: tras ejecutarla, todo sigue en «Toda la biblioteca» como antes.
-- Requiere haber ejecutado antes 002-biblioteca.sql. Uso: Supabase › SQL Editor › New query › pegar todo › Run.

begin;

-- ───────────── Sesiones (carpetas) ─────────────
create table if not exists public.sesiones (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  nombre text not null check (char_length(btrim(nombre)) between 1 and 60),
  finalizada boolean not null default false,
  orden integer not null default 0,
  creado timestamptz not null default now(),
  actualizado timestamptz not null default now(),
  unique (id, user_id)
);
create index if not exists sesiones_user_id_idx on public.sesiones (user_id);

-- ───────────── Qué tarjetas hay en cada sesión (muchos a muchos) ─────────────
-- Las claves compuestas (…, user_id) garantizan que sesión y tarjeta son del MISMO usuario.
-- Borrar una sesión borra solo sus relaciones; borrar una tarjeta, sus relaciones. Nunca al revés.
create table if not exists public.sesion_elementos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  sesion_id uuid not null,
  elemento_id uuid not null,
  creado timestamptz not null default now(),
  unique (sesion_id, elemento_id),
  foreign key (sesion_id, user_id) references public.sesiones (id, user_id) on delete cascade,
  foreign key (elemento_id, user_id) references public.elementos (id, user_id) on delete cascade
);
create index if not exists sesion_elementos_elemento_idx on public.sesion_elementos (elemento_id, user_id);
create index if not exists sesion_elementos_sesion_idx on public.sesion_elementos (sesion_id, user_id);
create index if not exists sesion_elementos_user_id_idx on public.sesion_elementos (user_id);

-- ───────────── Tarjetas comunes a todas las sesiones ─────────────
create table if not exists public.elementos_comunes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  elemento_id uuid not null,
  creado timestamptz not null default now(),
  unique (elemento_id),
  foreign key (elemento_id, user_id) references public.elementos (id, user_id) on delete cascade
);
create index if not exists elementos_comunes_user_id_idx on public.elementos_comunes (user_id);
create index if not exists elementos_comunes_elemento_idx on public.elementos_comunes (elemento_id, user_id);

-- ───────────── Seguridad: solo usuarios con sesión y solo sus filas ─────────────
alter table public.sesiones enable row level security;
alter table public.sesion_elementos enable row level security;
alter table public.elementos_comunes enable row level security;

revoke all on public.sesiones, public.sesion_elementos, public.elementos_comunes from anon;
grant select, insert, update, delete on public.sesiones, public.sesion_elementos, public.elementos_comunes to authenticated;

drop policy if exists "sesiones: ver las mías" on public.sesiones;
create policy "sesiones: ver las mías" on public.sesiones for select to authenticated
  using ((select auth.uid()) = user_id);
drop policy if exists "sesiones: crear las mías" on public.sesiones;
create policy "sesiones: crear las mías" on public.sesiones for insert to authenticated
  with check ((select auth.uid()) = user_id);
drop policy if exists "sesiones: editar las mías" on public.sesiones;
create policy "sesiones: editar las mías" on public.sesiones for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists "sesiones: borrar las mías" on public.sesiones;
create policy "sesiones: borrar las mías" on public.sesiones for delete to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "sesion_elementos: ver los míos" on public.sesion_elementos;
create policy "sesion_elementos: ver los míos" on public.sesion_elementos for select to authenticated
  using ((select auth.uid()) = user_id);
drop policy if exists "sesion_elementos: crear los míos" on public.sesion_elementos;
create policy "sesion_elementos: crear los míos" on public.sesion_elementos for insert to authenticated
  with check ((select auth.uid()) = user_id);
drop policy if exists "sesion_elementos: borrar los míos" on public.sesion_elementos;
create policy "sesion_elementos: borrar los míos" on public.sesion_elementos for delete to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "elementos_comunes: ver los míos" on public.elementos_comunes;
create policy "elementos_comunes: ver los míos" on public.elementos_comunes for select to authenticated
  using ((select auth.uid()) = user_id);
drop policy if exists "elementos_comunes: crear los míos" on public.elementos_comunes;
create policy "elementos_comunes: crear los míos" on public.elementos_comunes for insert to authenticated
  with check ((select auth.uid()) = user_id);
drop policy if exists "elementos_comunes: borrar los míos" on public.elementos_comunes;
create policy "elementos_comunes: borrar los míos" on public.elementos_comunes for delete to authenticated
  using ((select auth.uid()) = user_id);

drop trigger if exists sesiones_actualizado on public.sesiones;
create trigger sesiones_actualizado before update on public.sesiones
  for each row execute function private.tocar_actualizado();

commit;
