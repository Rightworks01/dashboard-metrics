-- Miembros limitados a un agente: team_members.agent_id (ID de usuario de GHL; null = ve todo).
-- La RLS solo les deja leer los contactos asignados a ese agente y lo que cuelga de ellos
-- (conversaciones, mensajes, oportunidades, citas). Las funciones de lectura son security invoker,
-- así que leads_list, lead_timeline, leads_by_state, sequence_reply_stats y call_stats quedan
-- filtradas solas. metrics_rollup (definer, agrega todo) se les niega.

alter table public.team_members add column if not exists agent_id text;

create or replace function public.my_agent_scope()
returns text
language sql stable security definer
set search_path = ''
as $$ select agent_id from public.team_members where user_id = (select auth.uid()) $$;
revoke all on function public.my_agent_scope() from public, anon;
grant execute on function public.my_agent_scope() to authenticated;

-- ¿Puede quien llama ver este contacto? (miembro y, si está limitado, contacto de su agente)
create or replace function public.can_see_contact(p_contact uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select public.is_team_member() and (
    public.my_agent_scope() is null
    or exists (select 1 from public.contacts c where c.id = p_contact and c.assigned_to = public.my_agent_scope())
  )
$$;
revoke all on function public.can_see_contact(uuid) from public, anon;
grant execute on function public.can_see_contact(uuid) to authenticated;

drop policy if exists team_read on public.contacts;
create policy team_read on public.contacts for select to authenticated
  using ((select public.is_team_member()) and ((select public.my_agent_scope()) is null or assigned_to = (select public.my_agent_scope())));

drop policy if exists team_read on public.conversations;
create policy team_read on public.conversations for select to authenticated
  using ((select public.is_team_member()) and ((select public.my_agent_scope()) is null or public.can_see_contact(contact_id)));

drop policy if exists team_read on public.opportunities;
create policy team_read on public.opportunities for select to authenticated
  using ((select public.is_team_member()) and ((select public.my_agent_scope()) is null or public.can_see_contact(contact_id)));

drop policy if exists team_read on public.appointments;
create policy team_read on public.appointments for select to authenticated
  using ((select public.is_team_member()) and ((select public.my_agent_scope()) is null or public.can_see_contact(contact_id)));

drop policy if exists team_read on public.messages;
create policy team_read on public.messages for select to authenticated
  using ((select public.is_team_member()) and ((select public.my_agent_scope()) is null or exists (
    select 1 from public.conversations cv where cv.id = conversation_id and public.can_see_contact(cv.contact_id))));

-- metrics_rollup agrega TODOS los leads: solo para miembros sin límite de agente
create or replace function public.metrics_rollup(p_from date, p_to date, p_group text, p_campaigns text[] default null)
returns table(key text, campaign_id text, spend numeric, impressions bigint, clicks bigint, leads_reported bigint,
              leads_ghl bigint, leads_responded bigint, opps_created bigint, opps_appointment bigint, opps_won bigint,
              cpl_real numeric, cpl_responded numeric, cost_per_appointment numeric, cost_per_won numeric,
              response_rate numeric, ctr numeric)
language plpgsql stable security definer
set search_path = ''
as $$
begin
  if not public.is_team_member() or public.my_agent_scope() is not null then
    raise exception 'acceso solo para el equipo' using errcode = '42501';
  end if;
  return query select * from public.metrics_rollup_unchecked(p_from, p_to, p_group, p_campaigns);
end $$;
