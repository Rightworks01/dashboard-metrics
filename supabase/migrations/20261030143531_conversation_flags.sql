-- Recalcula first_message_at / first_response_at / responded a partir de `messages`,
-- sin importar la fuente (ghl, wa_connector...). La llaman webhook y reconciliación.
--   conversations.first_message_at  = primer mensaje inbound del lead
--   conversations.first_response_at = primer outbound del equipo después de ese inbound
--   conversations.responded         = el equipo respondió
--   contacts.responded              = el lead escribió al menos un inbound
create or replace function public.recompute_conversation_flags(p_conversation_ids uuid[])
returns void
language sql
security definer
set search_path = ''
as $$
  with first_in as (
    select m.conversation_id, min(m.sent_at) as first_in
    from public.messages m
    where m.conversation_id = any(p_conversation_ids)
      and m.direction = 'inbound'
    group by 1
  ),
  flags as (
    select
      fi.conversation_id,
      fi.first_in,
      (select min(m.sent_at)
         from public.messages m
        where m.conversation_id = fi.conversation_id
          and m.direction = 'outbound'
          and m.sent_at >= fi.first_in) as first_out
    from first_in fi
  )
  update public.conversations c
     set first_message_at  = f.first_in,
         first_response_at = f.first_out,
         responded         = f.first_out is not null
    from flags f
   where c.id = f.conversation_id;

  update public.contacts ct
     set responded = true
   where ct.responded = false
     and exists (
       select 1
         from public.conversations c
         join public.messages m on m.conversation_id = c.id
        where c.contact_id = ct.id
          and c.id = any(p_conversation_ids)
          and m.direction = 'inbound'
     );
$$;

revoke execute on function public.recompute_conversation_flags(uuid[]) from public, anon, authenticated;
grant execute on function public.recompute_conversation_flags(uuid[]) to service_role;
