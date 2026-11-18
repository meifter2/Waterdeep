-- DFY · 003: enlaces directos de audio (fase 2)
-- Permite guardar como sonido un enlace https a un archivo de audio (MP3, OGG…) que se reproduce en streaming.
-- Solo AMPLÍA lo admitido: no borra ni cambia ninguna fila, tabla, bucket ni política.
-- Se puede ejecutar varias veces sin problema. Requiere haber ejecutado antes 002-biblioteca.sql.

begin;

-- Orígenes admitidos: los de siempre + 'url' (enlace directo a un audio).
alter table public.recursos drop constraint if exists recursos_origen_check;
alter table public.recursos
  add constraint recursos_origen_check check (origen in ('spotify', 'youtube', 'archivo', 'url'));

-- Un enlace de audio siempre es https (el navegador bloquea audio http dentro de una web https).
-- Las reglas de 002 siguen valiendo: sin archivo en Storage (archivo_ruta nulo) y con enlace.
alter table public.recursos drop constraint if exists recursos_url_https_check;
alter table public.recursos
  add constraint recursos_url_https_check check (origen <> 'url' or enlace ~ '^https://');

commit;
