-- 1) Estado/país del contacto (campo estándar `state` de GHL) para el mapa.
-- 2) Catálogo de campañas de Meta (nombre + estado) para poder pausarlas/activarlas.
-- 3) metrics_rollup acepta p_group = 'campaign'.
-- 4) leads_by_state: leads atribuidos a Meta por estado en un rango.

alter table public.contacts add column state text, add column country text;
create index idx_contacts_state on public.contacts (state);

-- ------------------------------------------------------------
-- meta_campaigns: lo escribe el backend (sync-meta-ads y el toggle de estado)
-- ------------------------------------------------------------
create table public.meta_campaigns (
  id                text primary key,
  name              text not null,
  status            text not null,                      -- ACTIVE | PAUSED | ARCHIVED ...
  effective_status  text,                               -- lo que realmente corre (p. ej. ADSET_PAUSED)
  objective         text,
  daily_budget      numeric(12,2),                      -- en unidades de la moneda (Meta manda centavos)
  synced_at         timestamptz not null default now()
);

alter table public.meta_campaigns enable row level security;
create policy "authenticated_read" on public.meta_campaigns for select to authenticated using (true);

-- ------------------------------------------------------------
-- metrics_rollup: mismo contrato + agrupación por campaña
-- ------------------------------------------------------------
create or replace function public.metrics_rollup(p_from date, p_to date, p_group text)
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

-- ------------------------------------------------------------
-- leads_by_state: el estado viene tal cual de GHL ("TX", "Texas", " texas "); se agrupa por
-- upper(trim()) y la app lo normaliza a código USPS.
-- ------------------------------------------------------------
create function public.leads_by_state(p_from date, p_to date)
returns table (
  state         text,
  leads         bigint,
  responded     bigint,
  appointments  bigint,
  won           bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    coalesce(nullif(upper(trim(c.state)), ''), '') as state,
    count(*)::bigint                                as leads,
    count(*) filter (where c.responded)::bigint     as responded,
    count(*) filter (where exists (
      select 1 from public.opportunities o
       where o.contact_id = c.id and o.appointment_reached_at is not null
    ))::bigint                                      as appointments,
    count(*) filter (where exists (
      select 1 from public.opportunities o
       where o.contact_id = c.id and o.status = 'won'
    ))::bigint                                      as won
  from public.contacts c
  where c.meta_ad_id is not null
    and c.created_at::date between p_from and p_to
  group by 1
  order by 2 desc;
$$;

revoke execute on function public.leads_by_state(date, date) from public, anon;
grant execute on function public.leads_by_state(date, date) to authenticated;
