-- "Oportunidad" en el dashboard = llegó al menos a la cita (Right Works): en "Reclutamiento",
-- Appointment / No Asistio / Reclutado; en "1. New Pipeline", Appointment Booked / No Show / No Sale /
-- Sold/Underwriting / Sold/Approved / Canceled/Chargeback; o status won (por nombre, en todos los pipelines).
-- GHL solo expone la etapa actual, así que guardamos la primera vez que la vemos en una de esas
-- etapas (appointment_reached_at) y no se borra aunque luego pase a "Not Interested".

alter table public.opportunities add column appointment_reached_at timestamptz;

create or replace function public.is_appointment_or_later(p_stage text, p_status text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_status = 'won'
      or lower(trim(p_stage)) in (
           -- Pipeline "Reclutamiento"
           'appointment', 'no asistio', 'reclutado',
           -- Pipeline "1. New Pipeline"
           'appointment booked', 'appointment no show', 'appointment no sale',
           'sold/underwriting', 'sold/approved', 'canceled/chargeback');
$$;

create or replace function public.set_appointment_reached_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    new.appointment_reached_at := coalesce(old.appointment_reached_at, new.appointment_reached_at);
  end if;
  if new.appointment_reached_at is null
     and public.is_appointment_or_later(new.pipeline_stage, new.status) then
    new.appointment_reached_at := coalesce(new.stage_entered_at, now());
  end if;
  return new;
end;
$$;

revoke execute on function public.is_appointment_or_later(text, text) from public, anon;
revoke execute on function public.set_appointment_reached_at() from public, anon, authenticated;

create trigger trg_opportunities_appointment
  before insert or update on public.opportunities
  for each row execute function public.set_appointment_reached_at();

-- Backfill con la etapa actual (lo que ya pasó por la cita y luego se perdió no es recuperable)
update public.opportunities
   set appointment_reached_at = coalesce(stage_entered_at, created_at)
 where public.is_appointment_or_later(pipeline_stage, status);

create index idx_opps_appointment on public.opportunities (appointment_reached_at)
  where appointment_reached_at is not null;

-- ------------------------------------------------------------
-- Vista: agrega opps_appointment / cost_per_appointment.
-- Las citas se cuentan por fecha de creación de la oportunidad (cohorte del lead), igual que
-- opps_created, para que el costo se compare contra el gasto del anuncio que trajo al lead.
-- ------------------------------------------------------------
drop function public.metrics_rollup(date, date, text);
drop materialized view public.metrics_creatives_daily;

create materialized view public.metrics_creatives_daily as
with leads as (
  select
    c.meta_ad_id as ad_id,
    c.created_at::date as date,
    count(*) as leads_ghl,
    count(*) filter (where c.responded) as leads_responded
  from public.contacts c
  where c.meta_ad_id is not null
  group by 1, 2
),
opps as (
  select
    c.meta_ad_id as ad_id,
    o.created_at::date as date,
    count(*) as opps_created,
    count(*) filter (where o.appointment_reached_at is not null) as opps_appointment,
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
  coalesce(o.opps_appointment, 0)  as opps_appointment,
  coalesce(o.opps_won, 0)          as opps_won,
  case when coalesce(l.leads_ghl,0) > 0
       then m.spend / l.leads_ghl end                              as cpl_real,
  case when coalesce(l.leads_responded,0) > 0
       then m.spend / l.leads_responded end                        as cpl_responded,
  case when coalesce(o.opps_appointment,0) > 0
       then m.spend / o.opps_appointment end                       as cost_per_appointment,
  case when coalesce(o.opps_won,0) > 0
       then m.spend / o.opps_won end                               as cost_per_won,
  case when coalesce(l.leads_ghl,0) > 0
       then l.leads_responded::numeric / l.leads_ghl end           as response_rate
from public.meta_ads_daily m
left join leads l on l.ad_id = m.ad_id and l.date = m.date
left join opps  o on o.ad_id = m.ad_id and o.date = m.date;

create unique index uq_metrics_creatives_daily on public.metrics_creatives_daily (ad_id, date);

revoke all on public.metrics_creatives_daily from anon, authenticated;
grant select on public.metrics_creatives_daily to authenticated;

create function public.metrics_rollup(p_from date, p_to date, p_group text)
returns table (
  key                  text,
  campaign_id          text,
  spend                numeric,
  impressions          bigint,
  clicks               bigint,
  leads_reported       bigint,
  leads_ghl            bigint,
  leads_responded      bigint,
  opps_created         bigint,
  opps_appointment     bigint,
  opps_won             bigint,
  cpl_real             numeric,
  cpl_responded        numeric,
  cost_per_appointment numeric,
  cost_per_won         numeric,
  response_rate        numeric,
  ctr                  numeric
)
language sql
stable
security invoker
set search_path = ''
as $$
  with g as (
    select
      case p_group when 'day' then m.date::text when 'ad' then m.ad_id else 'total' end as key,
      max(m.campaign_id)                as campaign_id,
      coalesce(sum(m.spend), 0)         as spend,
      sum(m.impressions)::bigint        as impressions,
      sum(m.clicks)::bigint             as clicks,
      sum(m.leads_reported)::bigint     as leads_reported,
      sum(m.leads_ghl)::bigint          as leads_ghl,
      sum(m.leads_responded)::bigint    as leads_responded,
      sum(m.opps_created)::bigint       as opps_created,
      sum(m.opps_appointment)::bigint   as opps_appointment,
      sum(m.opps_won)::bigint           as opps_won
    from public.metrics_creatives_daily m
    where m.date between p_from and p_to
    group by 1
  )
  select
    g.key, g.campaign_id, g.spend, g.impressions, g.clicks, g.leads_reported,
    g.leads_ghl, g.leads_responded, g.opps_created, g.opps_appointment, g.opps_won,
    case when g.leads_ghl > 0        then round(g.spend / g.leads_ghl, 2) end,
    case when g.leads_responded > 0  then round(g.spend / g.leads_responded, 2) end,
    case when g.opps_appointment > 0 then round(g.spend / g.opps_appointment, 2) end,
    case when g.opps_won > 0         then round(g.spend / g.opps_won, 2) end,
    case when g.leads_ghl > 0        then g.leads_responded::numeric / g.leads_ghl end,
    case when g.impressions > 0      then g.clicks::numeric / g.impressions end
  from g
  order by case when p_group = 'day' then g.key end, g.spend desc;
$$;

revoke execute on function public.metrics_rollup(date, date, text) from public, anon;
grant execute on function public.metrics_rollup(date, date, text) to authenticated;
