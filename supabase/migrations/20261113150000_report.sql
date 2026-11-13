-- Reportes (/reportes, solo admins).
-- 1) won_values: valor real de un ganado que carga un ADMIN (los agentes no cargan montos). Tiene
--    prioridad sobre opportunities.value de GHL; si ninguno tiene valor, el reporte usa punto de
--    equilibrio y, si se piden, escenarios con un rango estimado.
-- 2) report_agents: resultados por agente de los leads de Meta de la cohorte (rango + campañas).
-- 3) report_wins: lista de ganados de la cohorte con su valor (manual o de GHL).

create table public.won_values (
  opportunity_id uuid primary key references public.opportunities (id) on delete cascade,
  value          numeric(12,2) not null check (value >= 0),
  note           text,
  updated_at     timestamptz not null default now(),
  updated_by     text
);
alter table public.won_values enable row level security;
create policy team_read on public.won_values for select to authenticated
  using ((select public.is_team_member()) and (select public.my_agent_scope()) is null);
-- Escribe solo el backend (Server Action con is_admin + service role)
revoke all on public.won_values from anon;
revoke insert, update, delete, truncate, references, trigger on public.won_values from authenticated;

create function public.report_agents(p_from date, p_to date, p_campaigns text[] default null)
returns table (
  agent_id          text,
  agent_name        text,
  leads             bigint,
  responded         bigint,
  contacted_5min    bigint,
  no_contact        bigint,
  no_contact_24h    bigint,
  citas             bigint,
  showed            bigint,
  won               bigint,
  won_value         numeric,
  won_without_value bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  with cc as (
    select c.id, c.assigned_to, c.created_at, c.responded
    from public.cohort_contacts(p_from, p_to, p_campaigns) x
    join public.contacts c on c.id = x.id
  ),
  per as (
    select cc.*,
      (select min(m.sent_at) from public.messages m
         join public.conversations cv on cv.id = m.conversation_id
        where cv.contact_id = cc.id and m.direction = 'outbound' and not m.automated) as first_human,
      public.contact_has_cita(cc.id) as has_cita,
      exists (select 1 from public.appointments a where a.contact_id = cc.id and a.status = 'showed') as showed
    from cc
  ),
  wins as (
    select o.contact_id,
           count(*) as n,
           sum(coalesce(wv.value, nullif(o.value, 0))) as val,
           count(*) filter (where coalesce(wv.value, nullif(o.value, 0)) is null) as no_val
    from public.opportunities o
    left join public.won_values wv on wv.opportunity_id = o.id
    where o.status = 'won' and o.contact_id in (select id from cc)
    group by 1
  )
  select
    coalesce(p.assigned_to, ''),
    max(u.name),
    count(*)::bigint,
    count(*) filter (where p.responded)::bigint,
    count(*) filter (where p.first_human <= p.created_at + interval '5 minutes')::bigint,
    count(*) filter (where p.first_human is null)::bigint,
    count(*) filter (where p.first_human is null and p.created_at < now() - interval '24 hours')::bigint,
    count(*) filter (where p.has_cita)::bigint,
    count(*) filter (where p.showed)::bigint,
    coalesce(sum(w.n), 0)::bigint,
    coalesce(sum(w.val), 0)::numeric,
    coalesce(sum(w.no_val), 0)::bigint
  from per p
  left join wins w on w.contact_id = p.id
  left join public.crm_users u on u.id = p.assigned_to
  group by 1
  order by 3 desc;
$$;

create function public.report_wins(p_from date, p_to date, p_campaigns text[] default null)
returns table (
  opportunity_id uuid,
  contact_id     uuid,
  contact_name   text,
  agent_id       text,
  agent_name     text,
  campaign_id    text,
  campaign_name  text,
  ad_id          text,
  won_at         timestamptz,
  value_ghl      numeric,
  value_manual   numeric
)
language sql
stable
security invoker
set search_path = ''
as $$
  select o.id, c.id, c.name, c.assigned_to, u.name,
         coalesce(c.meta_campaign_id, ad.campaign_id), mc.name, c.meta_ad_id,
         coalesce(o.stage_changed_at, o.synced_at),
         nullif(o.value, 0), wv.value
  from public.cohort_contacts(p_from, p_to, p_campaigns) x
  join public.contacts c on c.id = x.id
  join public.opportunities o on o.contact_id = c.id and o.status = 'won'
  left join public.won_values wv on wv.opportunity_id = o.id
  left join public.crm_users u on u.id = c.assigned_to
  left join lateral (
    select d.campaign_id from public.meta_ads_daily d where d.ad_id = c.meta_ad_id limit 1
  ) ad on true
  left join public.meta_campaigns mc on mc.id = coalesce(c.meta_campaign_id, ad.campaign_id)
  order by 9 desc;
$$;

revoke execute on function public.report_agents(date, date, text[]) from public, anon;
revoke execute on function public.report_wins(date, date, text[]) from public, anon;
grant execute on function public.report_agents(date, date, text[]) to authenticated;
grant execute on function public.report_wins(date, date, text[]) to authenticated;
