-- Pasos 4 y 6: estadísticas de respuesta y de llamadas para la sección "Respuesta".
-- Solo leads atribuidos a Meta, por cohorte (fecha de entrada del lead) y filtro de campaña.

-- Leads de la cohorte (misma regla de campaña que leads_list)
create or replace function public.cohort_contacts(p_from date, p_to date, p_campaigns text[] default null)
returns table (id uuid, assigned_to text, created_at timestamptz)
language sql
stable
security invoker
set search_path = ''
as $$
  select c.id, c.assigned_to, c.created_at
  from public.contacts c
  left join lateral (
    select d.campaign_id from public.meta_ads_daily d where d.ad_id = c.meta_ad_id limit 1
  ) ad on true
  where c.meta_ad_id is not null
    and c.created_at::date between p_from and p_to
    and (p_campaigns is null or coalesce(c.meta_campaign_id, ad.campaign_id) = any(p_campaigns));
$$;

-- Recordatorios / avisos de cita: no cuentan como mensajes de seguimiento
create or replace function public.is_reminder(p_body text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(p_body, '') ilike 'Entrevista Reclutamiento -%'
      or coalesce(p_body, '') ilike 'INVOICE FOR%'
      or coalesce(p_body, '') ilike '%cita de recutamiento con%'
      or coalesce(p_body, '') ilike '%cita de reclutamiento con%';
$$;

-- % de leads que responden a cada mensaje automático de la secuencia (sin recordatorios).
-- Un mensaje "se agrupa" por sus primeros 60 caracteres; respuesta = inbound del lead en 48 h.
create or replace function public.sequence_reply_stats(p_from date, p_to date, p_campaigns text[] default null)
returns table (template text, kind text, leads_sent bigint, leads_replied bigint, reply_rate numeric)
language sql
stable
security invoker
set search_path = ''
as $$
  with sent as (
    select
      cv.contact_id,
      left(regexp_replace(m.body, '\s+', ' ', 'g'), 60) as template,
      max(m.kind) as kind,
      min(m.sent_at) as first_sent
    from public.messages m
    join public.conversations cv on cv.id = m.conversation_id
    join public.cohort_contacts(p_from, p_to, p_campaigns) cc on cc.id = cv.contact_id
    where m.direction = 'outbound' and m.automated
      and coalesce(m.body, '') <> '' and not public.is_reminder(m.body)
    group by 1, 2
  ),
  agg as (
    select
      s.template, max(s.kind) as kind,
      count(*)::bigint as leads_sent,
      count(*) filter (where exists (
        select 1 from public.messages r
          join public.conversations rc on rc.id = r.conversation_id
         where rc.contact_id = s.contact_id and r.direction = 'inbound'
           and r.sent_at > s.first_sent and r.sent_at <= s.first_sent + interval '48 hours'
      ))::bigint as leads_replied
    from sent s
    group by s.template
    having count(*) >= 3
  )
  select a.template, a.kind, a.leads_sent, a.leads_replied, a.leads_replied::numeric / a.leads_sent
  from agg a
  order by a.leads_sent desc
  limit 25;
$$;

-- Llamadas por agente (salientes) + llamadas perdidas del lead y si se devolvieron.
create or replace function public.call_stats(p_from date, p_to date, p_campaigns text[] default null)
returns table (
  agent_id text, outbound bigint, answered bigint, not_answered bigint, avg_answered_s numeric,
  missed_inbound bigint, missed_returned bigint, median_return_s numeric
)
language sql
stable
security invoker
set search_path = ''
as $$
  with calls as (
    select m.*, cv.contact_id, cc.assigned_to
    from public.messages m
    join public.conversations cv on cv.id = m.conversation_id
    join public.cohort_contacts(p_from, p_to, p_campaigns) cc on cc.id = cv.contact_id
    where m.kind = 'call'
  ),
  missed as (
    -- llamada del lead que nadie atendió, y el primer contacto humano posterior (llamada o mensaje)
    select c.contact_id, c.assigned_to, c.sent_at,
      (select min(o.sent_at) from public.messages o
         join public.conversations oc on oc.id = o.conversation_id
        where oc.contact_id = c.contact_id and o.direction = 'outbound' and not o.automated
          and o.sent_at > c.sent_at) as returned_at
    from calls c
    where c.direction = 'inbound' and c.call_status in ('no-answer', 'voicemail', 'busy', 'failed')
  ),
  agents as (
    select coalesce(sender_user_id, assigned_to) as agent_id from calls
    union select assigned_to from missed
  )
  select
    a.agent_id,
    (select count(*) from calls c where c.direction = 'outbound' and c.sender_user_id is not distinct from a.agent_id)::bigint,
    (select count(*) from calls c where c.direction = 'outbound' and c.sender_user_id is not distinct from a.agent_id and c.call_status = 'completed')::bigint,
    (select count(*) from calls c where c.direction = 'outbound' and c.sender_user_id is not distinct from a.agent_id and c.call_status in ('no-answer', 'busy', 'failed', 'voicemail'))::bigint,
    (select round(avg(c.call_duration_s)) from calls c where c.direction = 'outbound' and c.sender_user_id is not distinct from a.agent_id and c.call_status = 'completed'),
    (select count(*) from missed x where x.assigned_to is not distinct from a.agent_id)::bigint,
    (select count(*) from missed x where x.assigned_to is not distinct from a.agent_id and x.returned_at is not null)::bigint,
    (select percentile_cont(0.5) within group (order by extract(epoch from x.returned_at - x.sent_at))
       from missed x where x.assigned_to is not distinct from a.agent_id and x.returned_at is not null)::numeric
  from (select distinct agent_id from agents) a;
$$;

revoke execute on function public.cohort_contacts(date, date, text[]) from public, anon;
revoke execute on function public.sequence_reply_stats(date, date, text[]) from public, anon;
revoke execute on function public.call_stats(date, date, text[]) from public, anon;
grant execute on function public.cohort_contacts(date, date, text[]) to authenticated;
grant execute on function public.sequence_reply_stats(date, date, text[]) to authenticated;
grant execute on function public.call_stats(date, date, text[]) to authenticated;
grant execute on function public.is_reminder(text) to authenticated;
