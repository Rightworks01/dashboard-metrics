-- Proyecciones: valor estimado de un "ganado" por producto. Las campañas se asignan a un producto
-- cuando su nombre contiene `keyword` (sin distinguir mayúsculas). Valores aproximados que fija el equipo.
create table public.product_values (
  id            uuid primary key default gen_random_uuid(),
  name          text not null unique,
  keyword       text not null,
  value_per_win numeric(12,2),           -- USD por venta / reclutado; null = aún sin definir
  updated_at    timestamptz not null default now(),
  updated_by    text
);

alter table public.product_values enable row level security;
create policy "authenticated_read" on public.product_values for select to authenticated using (true);
-- Escribe solo el backend (Server Action con sesión verificada + service role)

insert into public.product_values (name, keyword) values ('IUL', 'IUL'), ('Reclutamiento', 'Reclutamiento');
