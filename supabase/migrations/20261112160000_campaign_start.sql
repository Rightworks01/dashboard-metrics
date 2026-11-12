-- Fecha de inicio de cada campaña en Meta (start_time; created_time de respaldo), para avisar cuando
-- una campaña lleva pocos días y sus métricas todavía no son representativas (fase de aprendizaje).
alter table public.meta_campaigns
  add column if not exists start_time   timestamptz,
  add column if not exists created_time timestamptz;
