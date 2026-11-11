-- Consola de accesos (/accesos): los permisos viven en team_members en vez de en el código.
--   is_admin    = puede entrar a /accesos y gestionar a los demás
--   can_see_ads = ve Campañas y Anuncios (antes: solo el correo del dueño, fijo en lib/auth.ts)
-- agent_id (migración agent_scope) sigue igual: null = ve todo; un ID de GHL = solo los leads de ese agente.
-- Un miembro limitado a un agente nunca ve anuncios (la app lo ignora aunque la columna diga true).

alter table public.team_members
  add column if not exists is_admin    boolean not null default false,
  add column if not exists can_see_ads boolean not null default false;

-- El dueño: administrador y con acceso a anuncios, como hasta ahora
update public.team_members t
   set is_admin = true, can_see_ads = true
  from auth.users u
 where u.id = t.user_id and lower(u.email) = 'oriana.lopez08@gmail.com';
