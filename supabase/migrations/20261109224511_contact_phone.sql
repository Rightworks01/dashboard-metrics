-- Teléfono del lead (campo estándar `phone` de GHL, E.164: "+13055551234"). Lo llenan el webhook y
-- reconcile-ghl; el panel del lead lo trae de GHL si aún falta. Para cargar los existentes, se marca
-- a todos como pendientes del barrido completo de contactos (ver contact_geo_synced).
alter table public.contacts add column if not exists phone text;
update public.contacts set geo_synced_at = null where phone is null;
