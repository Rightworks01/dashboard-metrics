import "server-only";
import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cookies, headers } from "next/headers";
import { EMBED_COOKIE, EMBED_HEADER, SESSION_COOKIE } from "@base/conexiones/supabase/sesion";
import { requireEnv } from "@base/conexiones/env";

// Cliente con ANON_KEY + sesión del usuario (cookies): respeta RLS.
// Crear uno por request; no cachear entre requests.
export async function supabaseServer(): Promise<SupabaseClient> {
  const cookieStore = await cookies();
  // Rutas /embed (iframe en GHL): sesión aparte con cookie particionada (ver lib/embed.ts)
  const embedded = (await headers()).get(EMBED_HEADER) === "1";
  return createServerClient(requireEnv("NEXT_PUBLIC_SUPABASE_URL"), requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"), {
    cookieOptions: embedded ? EMBED_COOKIE : SESSION_COOKIE,
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (cookiesToSet) => {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Llamado desde un Server Component (no puede escribir cookies): proxy.ts refresca la sesión.
        }
      },
    },
  });
}
