-- Reenvíos manuales de mensajes automáticos: cuando el envío de un workflow falla, el agente reenvía a mano el
-- MISMO mensaje. GHL lo marca como manual (tiene userId), pero no es seguimiento humano.
-- Regla: mensaje saliente manual (no llamada) cuyo inicio (40 caracteres) es igual al de un automático que ese
-- mismo lead recibió antes → automated = true, origin = 'manual_resend'. Se vuelve a aplicar después de cada
-- sincronización (el upsert reescribe automated/origin).

create or replace function public.mark_manual_resends(p_conversation_ids uuid[] default null)
returns integer
language sql
security definer
set search_path = ''
as $$
  with targets as (
    select m.id
    from public.messages m
    join public.conversations cv on cv.id = m.conversation_id
    where (p_conversation_ids is null or m.conversation_id = any(p_conversation_ids))
      and m.direction = 'outbound' and not m.automated and coalesce(m.kind, '') <> 'call'
      and length(coalesce(m.body, '')) >= 20
      and exists (
        select 1 from public.messages a
        join public.conversations c2 on c2.id = a.conversation_id
        where c2.contact_id = cv.contact_id and a.direction = 'outbound' and a.automated
          and coalesce(a.origin, '') <> 'manual_resend'
          and a.sent_at < m.sent_at and left(a.body, 40) = left(m.body, 40)
      )
  ), upd as (
    update public.messages m set automated = true, origin = 'manual_resend'
    from targets t where m.id = t.id
    returning 1
  )
  select count(*)::integer from upd;
$$;

revoke execute on function public.mark_manual_resends(uuid[]) from public, anon, authenticated;
grant execute on function public.mark_manual_resends(uuid[]) to service_role;

-- Reporte de seguimiento: además cuenta los reenvíos manuales por lead
drop function if exists public.followup_lead_activity(date, date, text[]);
create function public.followup_lead_activity(p_from date, p_to date, p_campaigns text[] default null)
returns table (
  contact_id uuid,
  human_msgs_out bigint, auto_msgs_out bigint, inbound_msgs bigint,
  calls_out bigint, calls_answered bigint, call_seconds bigint, calls_in bigint, missed_in bigint, missed_unreturned bigint,
  last_human_at timestamptz, last_inbound_at timestamptz,
  manual_resends bigint       -- automáticos que fallaron y un agente reenvió a mano (cuentan como automáticos)
)
language sql
stable
security invoker
set search_path = ''
as $$
  with m as (
    select cc.id as contact_id, x.*
    from public.cohort_contacts(p_from, p_to, p_campaigns) cc
    join public.conversations cv on cv.contact_id = cc.id
    join public.messages x on x.conversation_id = cv.id
  ),
  missed as (
    select a.contact_id, a.sent_at,
      exists (select 1 from m o where o.contact_id = a.contact_id and o.direction = 'outbound'
                and not o.automated and o.sent_at > a.sent_at) as returned
    from m a
    where a.kind = 'call' and a.direction = 'inbound' and a.call_status in ('no-answer', 'voicemail', 'busy', 'failed')
  )
  select cc.id,
    count(*) filter (where m.direction = 'outbound' and not m.automated and coalesce(m.kind, '') <> 'call'),
    count(*) filter (where m.direction = 'outbound' and m.automated and coalesce(m.kind, '') <> 'call'),
    count(*) filter (where m.direction = 'inbound' and coalesce(m.kind, '') <> 'call'),
    count(*) filter (where m.kind = 'call' and m.direction = 'outbound'),
    count(*) filter (where m.kind = 'call' and m.direction = 'outbound' and m.call_status = 'completed'),
    coalesce(sum(m.call_duration_s) filter (where m.kind = 'call' and m.call_status = 'completed'), 0)::bigint,
    count(*) filter (where m.kind = 'call' and m.direction = 'inbound'),
    (select count(*) from missed x where x.contact_id = cc.id),
    (select count(*) from missed x where x.contact_id = cc.id and not x.returned),
    max(m.sent_at) filter (where m.direction = 'outbound' and not m.automated),
    max(m.sent_at) filter (where m.direction = 'inbound'),
    count(*) filter (where m.origin = 'manual_resend')
  from public.cohort_contacts(p_from, p_to, p_campaigns) cc
  left join m on m.contact_id = cc.id
  group by cc.id;
$$;

revoke execute on function public.followup_lead_activity(date, date, text[]) from public, anon;
grant execute on function public.followup_lead_activity(date, date, text[]) to authenticated;

-- Los que ya están en la base
select public.mark_manual_resends(null);
