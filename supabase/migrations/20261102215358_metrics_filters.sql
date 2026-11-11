-- Paso 2: filtro por campaña en todo el dashboard + "cita" con el calendario.
-- Cita = el lead tiene una cita de calendario no cancelada, o su oportunidad llegó a Appointment
-- (o más allá). Se cuenta por fecha de creación del lead (cohorte), igual que los leads.
-- La columna sigue llamándose opps_appointment para no romper a quien la lee.

drop function public.metrics_rollup(date, date, text);
drop function public.leads_by_state(date, date);
drop materialized view public.metrics_creatives_daily;

create or replace function public.contact_has_cita(p_contact uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
           select 1 from public.appointments a
            where a.contact_id = p_contact
              and coalesce(a.status, '') not in ('cancelled', 'invalid')
         )
      or exists (
           select 1 from public.opportunities o
            where o.contact_id = p_contact and o.appointment_reached_at is not null
         );
$$;

create materialized view public.metrics_creatives_daily as
with leads as (
  select
    c.meta_ad_id as ad_id,
    c.created_at::date as date,
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
    o.created_at::date as date,
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
revoke all on public.metrics_creatives_daily from anon, authenticated;
grant select on public.metrics_creatives_daily to authenticated;

create function public.metrics_rollup(p_from date, p_to date, p_group text, p_campaigns text[] default null)
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
      case p_group
        when 'day'      then m.date::text
        when 'ad'       then m.ad_id
        when 'campaign' then coalesce(m.campaign_id, '')
        else 'total'
      end as key,
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
      and (p_campaigns is null or m.campaign_id = any(p_campaigns))
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

revoke execute on function public.metrics_rollup(date, date, text, text[]) from public, anon;
grant execute on function public.metrics_rollup(date, date, text, text[]) to authenticated;

-- Anuncios de las campañas pedidas (los contactos guardan el anuncio; la campaña sale de Meta)
create function public.leads_by_state(p_from date, p_to date, p_campaigns text[] default null)
returns table (state text, leads bigint, responded bigint, appointments bigint, won bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    coalesce(nullif(upper(trim(c.state)), ''), '') as state,
    count(*)::bigint                                as leads,
    count(*) filter (where c.responded)::bigint     as responded,
    count(*) filter (where public.contact_has_cita(c.id))::bigint as appointments,
    count(*) filter (where exists (
      select 1 from public.opportunities o where o.contact_id = c.id and o.status = 'won'
    ))::bigint                                      as won
  from public.contacts c
  where c.meta_ad_id is not null
    and c.created_at::date between p_from and p_to
    and (p_campaigns is null or c.meta_ad_id in (
      select distinct d.ad_id from public.meta_ads_daily d where d.campaign_id = any(p_campaigns)
    ))
  group by 1
  order by 2 desc;
$$;

revoke execute on function public.leads_by_state(date, date, text[]) from public, anon;
grant execute on function public.leads_by_state(date, date, text[]) to authenticated;
revoke execute on function public.contact_has_cita(uuid) from public, anon;
grant execute on function public.contact_has_cita(uuid) to authenticated, service_role;
