-- Parte B: panel lateral del lead (solo lectura). Mensajes, llamadas y citas de un contacto.
create function public.lead_timeline(p_contact uuid, p_limit int default 300)
returns table (
  at          timestamptz,
  type        text,     -- message | appointment
  direction   text,     -- inbound | outbound (mensajes)
  kind        text,     -- sms | call | email | ... (mensajes)
  automated   boolean,
  sender      text,     -- nombre del agente si se conoce
  body        text,
  call_status text,
  call_duration_s integer,
  appt_start  timestamptz,
  appt_status text,
  appt_title  text
)
language sql
stable
security invoker
set search_path = ''
as $$
  (
    select m.sent_at, 'message', m.direction, m.kind, m.automated, u.name, m.body,
           m.call_status, m.call_duration_s, null::timestamptz, null::text, null::text
    from public.messages m
    join public.conversations cv on cv.id = m.conversation_id
    left join public.crm_users u on u.id = m.sender_user_id
    where cv.contact_id = p_contact
    order by m.sent_at desc
    limit p_limit
  )
  union all
  select coalesce(a.created_at, a.start_time), 'appointment', null, null, false, au.name, null,
         null, null, a.start_time, a.status, a.title
  from public.appointments a
  left join public.crm_users au on au.id = a.assigned_user_id
  where a.contact_id = p_contact;
$$;

revoke execute on function public.lead_timeline(uuid, int) from public, anon;
grant execute on function public.lead_timeline(uuid, int) to authenticated;
