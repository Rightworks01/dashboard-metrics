-- Más recordatorios/avisos automáticos que no cuentan como mensajes de seguimiento
-- (confirmaciones y recordatorios de cita, avisos de taller en vivo, avisos internos al agente).
create or replace function public.is_reminder(p_body text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select b ilike 'Entrevista Reclutamiento -%'
      or b ilike 'INVOICE FOR%'
      or b ilike '%cita de recutamiento con%'
      or b ilike '%cita de reclutamiento con%'
      or b ilike '%Le escribimos en nombre de%'      -- confirmación de cita
      or b ilike '%recordatorio%'                    -- "Solo un recordatorio rápido…"
      or b ilike '%min nos vemos%'                   -- "en 5 min nos vemos: [zoom]"
      or b ilike '%Ya estamos por comenzar%'         -- aviso de taller en vivo
      or b ilike '%La sala ya está abierta%'         -- aviso de taller en vivo
      or b ilike 'Recuerda, este cliente%'           -- aviso interno al agente
  from (select coalesce(p_body, '') as b) x;
$$;
