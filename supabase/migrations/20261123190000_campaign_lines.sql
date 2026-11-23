-- Línea de trabajo de cada campaña (Vida / Comercial-Casas / Reclutamiento), fijada por un admin. Sin fila =
-- automática por palabras del nombre (capa1-base/util/lineas.ts). Solo segmenta las pestañas de Leads: el resto
-- del dashboard muestra todas las campañas, tengan línea o no.
create table if not exists public.campaign_lines (
  campaign_id text primary key,
  line text not null check (line in ('vida', 'comercial', 'reclutamiento')),
  updated_at timestamptz not null default now(),
  updated_by text
);

alter table public.campaign_lines enable row level security;
drop policy if exists campaign_lines_team_read on public.campaign_lines;
create policy campaign_lines_team_read on public.campaign_lines for select to authenticated using (public.is_team_member());
revoke insert, update, delete on public.campaign_lines from anon, authenticated;
