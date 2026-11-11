-- Zona horaria del contacto en GHL (campo estándar timezone = {{contact.timezone}}), IANA.
alter table public.contacts add column if not exists timezone text;
