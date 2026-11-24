-- Distingue el admin que viene del rol de GHL (SSO) del que un admin nombró a mano en Accesos.
-- El de GHL se recalcula en cada entrada (si en GHL pasa a User, deja de ser admin); el manual nunca se quita por SSO.
alter table public.team_members add column if not exists admin_from_ghl boolean not null default false;

-- osmarit entró por SSO cuando su rol en GHL era Admin; hoy es User → el admin vino de GHL, no de Accesos.
update public.team_members set admin_from_ghl = true where email = 'osmarit.lopez@gmail.com';
