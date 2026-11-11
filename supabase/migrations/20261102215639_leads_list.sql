-- Paso 3: lista de leads (atribuidos a Meta) con todo lo que la página de Leads y la ficha
-- al pasar el mouse necesitan. El estado se normaliza en la app (lib/us-states.ts).
create function public.leads_list(
  p_from      date,
  p_to        date,
  p_campaigns text[] default null,
  p_filter    text   default 'todos',  -- todos | cita | ganado | respondio | sin_contacto
  p_ad        text   default null,
  p_agent     text   default null,
  p_limit     int    default 1000
)
returns table (
  id                  uuid,
  id_ghl              text,
  name                text,
  created_at          timestamptz,
  state               text,
  assigned_to         text,
  agent_name          text,
  ad_id               text,
  adset_id            text,
  campaign_id         text,
  campaign_name       text,
  stage               text,
  opp_status          text,
  has_cita            boolean,
  appointment_at      timestamptz,
  appointment_status  text,
  responded           boolean,
  first_human_at      timestamptz,
  last_reply          text,
  last_reply_at       timestamptz,
  conversation_ghl    text
)
language sql
stable
security invoker
set search_path = ''
as $$
  with base as (
    select
      c.*,
      coalesce(c.meta_campaign_id, ad.campaign_id) as camp_id,
      coalesce(c.meta_adset_id, ad.adset_id)       as set_id
    from public.contacts c
    left join lateral (
      select d.campaign_id, d.adset_id from public.meta_ads_daily d where d.ad_id = c.meta_ad_id limit 1
    ) ad on true
    where c.meta_ad_id is not null
      and c.created_at::date between p_from and p_to
      and (p_ad is null or c.meta_ad_id = p_ad)
      and (p_agent is null or c.assigned_to = p_agent)
  )
  select
    b.id, b.id_ghl, b.name, b.created_at, b.state, b.assigned_to, u.name,
    b.meta_ad_id, b.set_id, b.camp_id, mc.name,
    opp.pipeline_stage, opp.status,
    public.contact_has_cita(b.id),
    appt.start_time, appt.status,
    b.responded,
    human.first_at,
    reply.body, reply.sent_at,
    conv.id_ghl
  from base b
  left join public.crm_users u on u.id = b.assigned_to
  left join public.meta_campaigns mc on mc.id = b.camp_id
  left join lateral (
    select o.pipeline_stage, o.status from public.opportunities o
     where o.contact_id = b.id order by o.stage_changed_at desc nulls last, o.created_at desc limit 1
  ) opp on true
  left join lateral (
    -- la próxima cita si hay; si no, la última
    select a.start_time, a.status from public.appointments a
     where a.contact_id = b.id and coalesce(a.status, '') not in ('cancelled', 'invalid')
     order by (a.start_time >= now()) desc, case when a.start_time >= now() then a.start_time end asc, a.start_time desc
     limit 1
  ) appt on true
  left join lateral (
    select min(m.sent_at) as first_at from public.messages m
      join public.conversations cv on cv.id = m.conversation_id
     where cv.contact_id = b.id and m.direction = 'outbound' and not m.automated
  ) human on true
  left join lateral (
    select m.body, m.sent_at from public.messages m
      join public.conversations cv on cv.id = m.conversation_id
     where cv.contact_id = b.id and m.direction = 'inbound' and coalesce(m.body, '') <> ''
     order by m.sent_at desc limit 1
  ) reply on true
  left join lateral (
    select cv.id_ghl from public.conversations cv where cv.contact_id = b.id order by cv.created_at desc limit 1
  ) conv on true
  where (p_campaigns is null or b.camp_id = any(p_campaigns))
    and case p_filter
          when 'cita'         then public.contact_has_cita(b.id)
          when 'ganado'       then opp.status = 'won'
          when 'respondio'    then b.responded
          when 'sin_contacto' then human.first_at is null
          else true
        end
  order by b.created_at desc
  limit p_limit;
$$;

revoke execute on function public.leads_list(date, date, text[], text, text, text, int) from public, anon;
grant execute on function public.leads_list(date, date, text[], text, text, text, int) to authenticated;
