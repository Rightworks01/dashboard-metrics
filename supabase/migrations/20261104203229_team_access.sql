-- Acceso solo para el equipo: antes bastaba con tener cuenta en Supabase Auth (cualquier
-- `authenticated` leía todo). Si los registros públicos se activaran por error, una cuenta nueva
-- no vería nada ni podría pausar campañas. Altas: insert en team_members (SQL / panel de Supabase).

create table if not exists public.team_members (
  user_id  uuid primary key references auth.users (id) on delete cascade,
  email    text,
  added_at timestamptz not null default now()
);
alter table public.team_members enable row level security;
drop policy if exists own_row on public.team_members;
create policy own_row on public.team_members for select to authenticated using (user_id = (select auth.uid()));

create or replace function public.is_team_member()
returns boolean
language sql stable security definer
set search_path = ''
as $$ select exists (select 1 from public.team_members where user_id = (select auth.uid())) $$;
revoke all on function public.is_team_member() from public, anon;
grant execute on function public.is_team_member() to authenticated;

-- Los usuarios que existen hoy son del equipo (se crean a mano)
insert into public.team_members (user_id, email)
select id, email from auth.users
on conflict (user_id) do nothing;

-- Lectura: solo miembros del equipo
do $$
declare t text;
begin
  foreach t in array array['appointments','contacts','conversations','crm_users','messages',
                           'meta_ads_daily','meta_campaigns','opportunities','product_values'] loop
    execute format('drop policy if exists authenticated_read on public.%I', t);
    execute format('drop policy if exists team_read on public.%I', t);
    execute format('create policy team_read on public.%I for select to authenticated using ((select public.is_team_member()))', t);
  end loop;
end $$;

-- Escritura solo con service_role (API routes / cron): nada para anon ni authenticated
do $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('revoke insert, update, delete, truncate, references, trigger on public.%I from anon, authenticated', t);
    execute format('revoke select on public.%I from anon', t);
  end loop;
end $$;

-- La vista materializada no tiene RLS: nadie la lee directo por la API. metrics_rollup la lee
-- como definer y antes comprueba que quien llama sea del equipo.
revoke select on public.metrics_creatives_daily from anon, authenticated;

alter function public.metrics_rollup(date, date, text, text[]) rename to metrics_rollup_unchecked;
revoke all on function public.metrics_rollup_unchecked(date, date, text, text[]) from public, anon, authenticated;

create or replace function public.metrics_rollup(p_from date, p_to date, p_group text, p_campaigns text[] default null)
returns table(key text, campaign_id text, spend numeric, impressions bigint, clicks bigint, leads_reported bigint,
              leads_ghl bigint, leads_responded bigint, opps_created bigint, opps_appointment bigint, opps_won bigint,
              cpl_real numeric, cpl_responded numeric, cost_per_appointment numeric, cost_per_won numeric,
              response_rate numeric, ctr numeric)
language plpgsql stable security definer
set search_path = ''
as $$
begin
  if not public.is_team_member() then
    raise exception 'acceso solo para el equipo' using errcode = '42501';
  end if;
  return query select * from public.metrics_rollup_unchecked(p_from, p_to, p_group, p_campaigns);
end $$;
revoke all on function public.metrics_rollup(date, date, text, text[]) from public, anon;
grant execute on function public.metrics_rollup(date, date, text, text[]) to authenticated;

revoke execute on function public.is_reminder(text) from anon;
