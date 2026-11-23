-- Reporte de seguimiento (Reportes → Seguimiento): actividad por lead y citas de la cohorte.
-- security invoker: la RLS aplica (un miembro limitado a un agente solo ve sus leads).

create or replace function public.followup_lead_activity(p_from date, p_to date, p_campaigns text[] default null)
returns table (
  contact_id uuid,
  human_msgs_out bigint,      -- mensajes escritos por una persona (no llamadas)
  auto_msgs_out bigint,       -- automáticos (workflows, campañas, recordatorios)
  inbound_msgs bigint,        -- mensajes del lead (no llamadas)
  calls_out bigint,
  calls_answered bigint,
  call_seconds bigint,
  calls_in bigint,
  missed_in bigint,           -- llamadas del lead que nadie atendió
  missed_unreturned bigint,   -- …y sin contacto humano posterior
  last_human_at timestamptz,  -- último contacto humano (mensaje o llamada saliente)
  last_inbound_at timestamptz
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
    max(m.sent_at) filter (where m.direction = 'inbound')
  from public.cohort_contacts(p_from, p_to, p_campaigns) cc
  left join m on m.contact_id = cc.id
  group by cc.id;
$$;

create or replace function public.followup_appointments(p_from date, p_to date, p_campaigns text[] default null)
returns table (
  appointment_id uuid, contact_id uuid, contact_name text, start_time timestamptz, status text, title text,
  owner_id text, owner_name text
)
language sql
stable
security invoker
set search_path = ''
as $$
  -- Responsable de la cita = el usuario asignado en el calendario; si no hay, el agente del lead.
  select a.id, c.id, c.name, a.start_time, a.status, a.title,
    coalesce(a.assigned_user_id, c.assigned_to), u.name
  from public.cohort_contacts(p_from, p_to, p_campaigns) cc
  join public.contacts c on c.id = cc.id
  join public.appointments a on a.contact_id = c.id
  left join public.crm_users u on u.id = coalesce(a.assigned_user_id, c.assigned_to)
  order by a.start_time desc;
$$;

revoke execute on function public.followup_lead_activity(date, date, text[]) from public, anon;
revoke execute on function public.followup_appointments(date, date, text[]) from public, anon;
grant execute on function public.followup_lead_activity(date, date, text[]) to authenticated;
grant execute on function public.followup_appointments(date, date, text[]) to authenticated;
