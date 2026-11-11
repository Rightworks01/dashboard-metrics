-- Agrega metrics_creatives_daily en un rango, por total / día / anuncio, y recalcula los
-- ratios desde las sumas (promediar ratios diarios daría un CPL incorrecto).
-- security invoker: respeta los permisos de quien llama (solo `authenticated` lee la vista).
create or replace function public.metrics_rollup(p_from date, p_to date, p_group text)
returns table (
  key             text,
  campaign_id     text,
  spend           numeric,
  impressions     bigint,
  clicks          bigint,
  leads_reported  bigint,
  leads_ghl       bigint,
  leads_responded bigint,
  opps_created    bigint,
  opps_won        bigint,
  cpl_real        numeric,
  cpl_responded   numeric,
  cost_per_opp    numeric,
  cost_per_won    numeric,
  response_rate   numeric,
  ctr             numeric
)
language sql
stable
security invoker
set search_path = ''
as $$
  with g as (
    select
      case p_group when 'day' then m.date::text when 'ad' then m.ad_id else 'total' end as key,
      max(m.campaign_id)               as campaign_id,
      coalesce(sum(m.spend), 0)        as spend,
      sum(m.impressions)::bigint       as impressions,
      sum(m.clicks)::bigint            as clicks,
      sum(m.leads_reported)::bigint    as leads_reported,
      sum(m.leads_ghl)::bigint         as leads_ghl,
      sum(m.leads_responded)::bigint   as leads_responded,
      sum(m.opps_created)::bigint      as opps_created,
      sum(m.opps_won)::bigint          as opps_won
    from public.metrics_creatives_daily m
    where m.date between p_from and p_to
    group by 1
  )
  select
    g.key, g.campaign_id, g.spend, g.impressions, g.clicks, g.leads_reported,
    g.leads_ghl, g.leads_responded, g.opps_created, g.opps_won,
    case when g.leads_ghl > 0       then round(g.spend / g.leads_ghl, 2) end,
    case when g.leads_responded > 0 then round(g.spend / g.leads_responded, 2) end,
    case when g.opps_created > 0    then round(g.spend / g.opps_created, 2) end,
    case when g.opps_won > 0        then round(g.spend / g.opps_won, 2) end,
    case when g.leads_ghl > 0       then g.leads_responded::numeric / g.leads_ghl end,
    case when g.impressions > 0     then g.clicks::numeric / g.impressions end
  from g
  order by case when p_group = 'day' then g.key end, g.spend desc;
$$;

revoke execute on function public.metrics_rollup(date, date, text) from public, anon;
grant execute on function public.metrics_rollup(date, date, text) to authenticated;
