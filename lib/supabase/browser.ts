"use client";

import { createBrowserClient } from "@supabase/ssr";

// Cliente del navegador con la clave publicable. Solo se usa para subir creativos con una URL firmada
// que entrega el servidor (/api/meta/publish/upload); no lee datos (eso va por el servidor y la RLS).
export function supabaseBrowser() {
  return createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
}
