-- Paso 1 (datos para Leads / Respuesta / Citas):
-- mensajes con tipo, agente, automatización y resultado de llamada; nombre del contacto;
-- agentes del CRM; citas del calendario; cursor de la carga histórica de conversaciones.

-- Mensajes: todo agnóstico a la fuente (GHL hoy, wa_connector mañana)
alter table public.messages
  add column kind            text,                       -- sms | call | email | whatsapp | ... (por mensaje)
  add column sender_user_id  text,                       -- agente que lo envió (null = lead o automatización)
  add column automated       boolean not null default false, -- enviado por workflow/campaña/bulk
  add column origin          text,                       -- origen crudo en la fuente (workflow, app, api...)
  add column call_status     text,                       -- solo llamadas: completed | no-answer | voicemail | busy...
  add column call_duration_s integer,                    -- solo llamadas
  add column meta            jsonb;                      -- metadatos crudos de llamadas (para verificar formato)

create index idx_msg_sender on public.messages (sender_user_id);
create index idx_msg_kind   on public.messages (kind);

alter table public.contacts add column name text;

-- Agentes / usuarios del CRM (solo id y nombre)
create table public.crm_users (
  id         text primary key,
  name       text not null,
  synced_at  timestamptz not null default now()
);
alter table public.crm_users enable row level security;
create policy "authenticated_read" on public.crm_users for select to authenticated using (true);

-- Citas del calendario
create table public.appointments (
  id               uuid primary key default gen_random_uuid(),
  id_ghl           text not null unique,
  contact_id       uuid references public.contacts(id) on delete cascade,
  calendar_id      text,
  title            text,
  start_time       timestamptz,
  end_time         timestamptz,
  status           text,          -- confirmed | cancelled | showed | noshow | invalid | new
  assigned_user_id text,
  created_at       timestamptz,
  synced_at        timestamptz not null default now()
);
create index idx_appt_contact on public.appointments (contact_id);
create index idx_appt_start   on public.appointments (start_time);
alter table public.appointments enable row level security;
create policy "authenticated_read" on public.appointments for select to authenticated using (true);

-- Estado de cargas largas por lotes (solo backend; RLS sin políticas = nadie más lo lee)
create table public.sync_state (
  key        text primary key,
  value      text,
  updated_at timestamptz not null default now()
);
alter table public.sync_state enable row level security;

-- Fuerza un barrido completo de contactos en el próximo reconcile para llenar `name`
update public.contacts set geo_synced_at = null;
