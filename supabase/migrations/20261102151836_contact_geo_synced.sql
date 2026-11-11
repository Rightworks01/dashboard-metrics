-- Marca qué contactos ya pasaron por la sync de estado (custom field "Estado" o `state`).
-- null = pendiente: el siguiente reconcile-ghl hace un barrido completo de contactos.
alter table public.contacts add column geo_synced_at timestamptz;
