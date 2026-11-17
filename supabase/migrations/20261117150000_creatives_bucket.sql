-- Bucket privado para creativos (imágenes y videos) del asistente "Publicar campaña". El navegador sube
-- con una URL firmada que entrega el servidor (solo admins); el servidor los pasa a Meta y los borra.
-- Sin políticas: nadie lee ni escribe por la API salvo con URL firmada o service role.
-- 50 MB por archivo = límite del plan gratis de Supabase.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('creatives', 'creatives', false, 52428800, array['image/jpeg', 'image/png', 'video/mp4', 'video/quicktime'])
on conflict (id) do update
  set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
