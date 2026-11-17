-- Días en la zona horaria de la cuenta publicitaria de Meta (no UTC), para que los leads de GHL caigan
-- el mismo día que Meta los reporta. La zona la guarda sync-meta-ads en sync_state.meta_account_timezone
-- (timezone_name de la cuenta); mientras no exista, UTC (comportamiento anterior).
--   local_day(ts) = día en esa zona. Se reemplaza `created_at::date` en la vista materializada,
--   leads_by_state, leads_list y cohort_contacts (y con ello Respuesta y Reportes).

create or replace function public.account_tz()
returns text
language sql stable security definer
set search_path = ''
as $$
  select coalesce((select value from public.sync_state where key = 'meta_account_timezone'), 'UTC')
$$;

create or replace function public.local_day(p_ts timestamptz)
returns date
language sql stable
set search_path = ''
as $$ select (p_ts at time zone public.account_tz())::date $$;

revoke all on function public.account_tz() from public, anon;
revoke all on function public.local_day(timestamptz) from public, anon;
grant execute on function public.account_tz() to authenticated, service_role;
grant execute on function public.local_day(timestamptz) to authenticated, service_role;

-- Funciones: mismo cuerpo, cambiando c.created_at::date por local_day(c.created_at)
do $$
declare
  f text;
  def text;
begin
  foreach f in array array[
    'public.leads_by_state(date, date, text[])',
    'public.leads_list(date, date, text[], text, text, text, int)',
    'public.cohort_contacts(date, date, text[])'
  ] loop
    def := pg_get_functiondef(f::regprocedure);
    if position('c.created_at::date' in def) = 0 then
      raise exception 'no encontré c.created_at::date en %', f;
    end if;
    execute replace(def, 'c.created_at::date', 'public.local_day(c.created_at)');
  end loop;
end $$;

-- Vista materializada: misma definición (migración metrics_filters), agrupando por día de la cuenta
drop materialized view public.metrics_creatives_daily;

create materialized view public.metrics_creatives_daily as
with leads as (
  select
    c.meta_ad_id as ad_id,
    public.local_day(c.created_at) as date,
    count(*) as leads_ghl,
    count(*) filter (where c.responded) as leads_responded,
    count(*) filter (where public.contact_has_cita(c.id)) as leads_cita
  from public.contacts c
  where c.meta_ad_id is not null
  group by 1, 2
),
opps as (
  select
    c.meta_ad_id as ad_id,
    public.local_day(o.created_at) as date,
    count(*) as opps_created,
    count(*) filter (where o.status = 'won') as opps_won
  from public.opportunities o
  join public.contacts c on c.id = o.contact_id
  where c.meta_ad_id is not null
  group by 1, 2
)
select
  m.ad_id,
  m.date,
  m.campaign_id,
  m.adset_id,
  m.spend,
  m.impressions,
  m.clicks,
  m.leads_reported,
  coalesce(l.leads_ghl, 0)         as leads_ghl,
  coalesce(l.leads_responded, 0)   as leads_responded,
  coalesce(o.opps_created, 0)      as opps_created,
  coalesce(l.leads_cita, 0)        as opps_appointment,
  coalesce(o.opps_won, 0)          as opps_won,
  case when coalesce(l.leads_ghl,0) > 0       then m.spend / l.leads_ghl end        as cpl_real,
  case when coalesce(l.leads_responded,0) > 0 then m.spend / l.leads_responded end  as cpl_responded,
  case when coalesce(l.leads_cita,0) > 0      then m.spend / l.leads_cita end       as cost_per_appointment,
  case when coalesce(o.opps_won,0) > 0        then m.spend / o.opps_won end         as cost_per_won,
  case when coalesce(l.leads_ghl,0) > 0       then l.leads_responded::numeric / l.leads_ghl end as response_rate
from public.meta_ads_daily m
left join leads l on l.ad_id = m.ad_id and l.date = m.date
left join opps  o on o.ad_id = m.ad_id and o.date = m.date;

create unique index uq_metrics_creatives_daily on public.metrics_creatives_daily (ad_id, date);
-- Sin acceso directo por la API: metrics_rollup (definer) la lee tras comprobar el equipo
revoke all on public.metrics_creatives_daily from anon, authenticated;
