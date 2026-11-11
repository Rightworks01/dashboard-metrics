-- ============================================================
-- 0001_init.sql — Esquema mínimo viable (5 tablas)
-- ============================================================

create extension if not exists "pgcrypto";

-- ------------------------------------------------------------
-- 1. contacts
-- ------------------------------------------------------------
create table public.contacts (
  id                uuid primary key default gen_random_uuid(),
  id_ghl            text not null unique,               -- ID en GHL (fuente de verdad)
  meta_ad_id        text,                               -- atribución first-touch
  meta_campaign_id  text,
  meta_adset_id     text,
  created_at        timestamptz not null default now(), -- created_at en GHL
  assigned_to       text,                               -- user_id GHL del vendedor
  tags              text[] not null default '{}',
  status            text,                               -- status del contacto en GHL
  responded         boolean not null default false,
  synced_at         timestamptz not null default now()
);

create index idx_contacts_meta_ad_id on public.contacts (meta_ad_id);
create index idx_contacts_created_at on public.contacts (created_at);
create index idx_contacts_assigned_to on public.contacts (assigned_to);

-- ------------------------------------------------------------
-- 2. opportunities
-- ------------------------------------------------------------
create table public.opportunities (
  id                uuid primary key default gen_random_uuid(),
  id_ghl            text not null unique,
  contact_id        uuid not null references public.contacts(id) on delete cascade,
  pipeline_stage    text,
  value             numeric(12,2) not null default 0,
  stage_entered_at  timestamptz,
  stage_changed_at  timestamptz,
  status            text not null default 'open',       -- open | won | lost | abandoned
  created_at        timestamptz not null default now(),
  synced_at         timestamptz not null default now()
);

create index idx_opps_contact_id on public.opportunities (contact_id);
create index idx_opps_stage on public.opportunities (pipeline_stage);
create index idx_opps_status on public.opportunities (status);

-- ------------------------------------------------------------
-- 3. conversations
-- ------------------------------------------------------------
create table public.conversations (
  id                uuid primary key default gen_random_uuid(),
  id_ghl            text not null unique,
  contact_id        uuid not null references public.contacts(id) on delete cascade,
  channel           text not null,                      -- sms | whatsapp | email | ig | fb ...
  first_message_at  timestamptz,
  first_response_at timestamptz,
  responded         boolean not null default false,
  created_at        timestamptz not null default now(),
  synced_at         timestamptz not null default now()
);

create index idx_conv_contact_id on public.conversations (contact_id);
create index idx_conv_channel on public.conversations (channel);

-- ------------------------------------------------------------
-- 4. messages  (agnóstica a la fuente)
-- ------------------------------------------------------------
create table public.messages (
  id                uuid primary key default gen_random_uuid(),
  id_external       text,                               -- ID en GHL o WA Connector (futuro)
  conversation_id   uuid not null references public.conversations(id) on delete cascade,
  direction         text not null check (direction in ('inbound','outbound')),
  source_channel    text not null default 'ghl',        -- 'ghl' hoy, 'wa_connector' mañana
  body              text,
  sent_at           timestamptz not null,
  template_id       text,
  synced_at         timestamptz not null default now()
);

create index idx_msg_conversation_id on public.messages (conversation_id);
create index idx_msg_sent_at on public.messages (sent_at);
create index idx_msg_source_channel on public.messages (source_channel);
-- evitar duplicados al re-sincronizar. Índice NO parcial: los NULL ya son distintos
-- en Postgres, y así funciona upsert(..., { onConflict: 'source_channel,id_external' })
create unique index uq_msg_source_external
  on public.messages (source_channel, id_external);

-- ------------------------------------------------------------
-- 5. meta_ads_daily
-- ------------------------------------------------------------
create table public.meta_ads_daily (
  ad_id             text not null,
  date              date not null,
  campaign_id       text,
  adset_id          text,
  spend             numeric(12,2) not null default 0,
  impressions       bigint not null default 0,
  clicks            bigint not null default 0,
  leads_reported    int not null default 0,             -- lo que reporta Meta (NO el CPL real)
  video_3s          bigint not null default 0,
  video_thruplay    bigint not null default 0,
  synced_at         timestamptz not null default now(),
  primary key (ad_id, date)
);

create index idx_meta_ads_date on public.meta_ads_daily (date);
create index idx_meta_ads_campaign on public.meta_ads_daily (campaign_id);

-- ============================================================
-- Vista materializada: métricas por creativo/día
-- ============================================================
create materialized view public.metrics_creatives_daily as
with leads as (
  select
    c.meta_ad_id as ad_id,
    c.created_at::date as date,
    count(*) as leads_ghl,
    count(*) filter (where c.responded) as leads_responded
  from public.contacts c
  where c.meta_ad_id is not null
  group by 1, 2
),
opps as (
  select
    c.meta_ad_id as ad_id,
    o.created_at::date as date,
    count(*) as opps_created,
    count(*) filter (where o.status = 'won') as opps_won
  from public.opportunities o
  join public.contacts c on c.id = o.contact_id
  where c.meta_ad_id is not null
  group by 1, 2
)
select
  m.ad_id,
  m.date,
  m.campaign_id,
  m.adset_id,
  m.spend,
  m.impressions,
  m.clicks,
  m.leads_reported,
  coalesce(l.leads_ghl, 0)        as leads_ghl,
  coalesce(l.leads_responded, 0)  as leads_responded,
  coalesce(o.opps_created, 0)     as opps_created,
  coalesce(o.opps_won, 0)         as opps_won,
  case when coalesce(l.leads_ghl,0) > 0
       then m.spend / l.leads_ghl end                              as cpl_real,
  case when coalesce(l.leads_responded,0) > 0
       then m.spend / l.leads_responded end                        as cpl_responded,
  case when coalesce(o.opps_created,0) > 0
       then m.spend / o.opps_created end                           as cost_per_opp,
  case when coalesce(o.opps_won,0) > 0
       then m.spend / o.opps_won end                               as cost_per_won,
  case when coalesce(l.leads_ghl,0) > 0
       then l.leads_responded::numeric / l.leads_ghl end           as response_rate
from public.meta_ads_daily m
left join leads l on l.ad_id = m.ad_id and l.date = m.date
left join opps  o on o.ad_id = m.ad_id and o.date = m.date;

create unique index uq_metrics_creatives_daily on public.metrics_creatives_daily (ad_id, date);

-- Refresco llamado desde el cron vía supabase.rpc('refresh_metrics_creatives_daily')
create or replace function public.refresh_metrics_creatives_daily()
returns void
language sql
security definer
set search_path = ''
as $$
  refresh materialized view concurrently public.metrics_creatives_daily;
$$;

revoke execute on function public.refresh_metrics_creatives_daily() from public, anon, authenticated;
grant execute on function public.refresh_metrics_creatives_daily() to service_role;

-- ============================================================
-- RLS: habilitar + política base (solo usuarios autenticados leen)
-- ============================================================
alter table public.contacts          enable row level security;
alter table public.opportunities     enable row level security;
alter table public.conversations     enable row level security;
alter table public.messages          enable row level security;
alter table public.meta_ads_daily    enable row level security;

do $$
declare t text;
begin
  foreach t in array array['contacts','opportunities','conversations','messages','meta_ads_daily']
  loop
    execute format(
      'create policy "authenticated_read" on public.%I for select to authenticated using (true);', t
    );
  end loop;
end $$;

-- El service role (backend/cron) bypassa RLS automáticamente.
-- No crear políticas de insert/update/delete para authenticated: solo el backend escribe.

-- Permisos sobre la vista materializada. Las vistas materializadas no admiten RLS y
-- Supabase da SELECT a anon por defecto en public: hay que quitárselo explícitamente.
revoke all on public.metrics_creatives_daily from anon, authenticated;
grant select on public.metrics_creatives_daily to authenticated;
