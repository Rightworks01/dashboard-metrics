import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { requireEnv } from "@/lib/env";

// Cliente con la clave secreta: salta RLS. Solo para API Routes y cron, nunca en el cliente.
// Prefiere SUPABASE_SECRET_KEY (formato nuevo `sb_secret_…`, la crea la integración de Supabase en
// Vercel) para poder desactivar las claves JWT legacy; si no está, usa SUPABASE_SERVICE_ROLE_KEY.
let client: SupabaseClient | null = null;

export function supabaseAdmin(): SupabaseClient {
  if (!client) {
    const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!url) throw new Error("Falta la variable de entorno SUPABASE_URL");
    const key = process.env.SUPABASE_SECRET_KEY || requireEnv("SUPABASE_SERVICE_ROLE_KEY");
    client = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return client;
}

export type Row = Record<string, unknown>;

/**
 * Upsert por lotes. Todas las filas de una llamada deben tener las mismas claves:
 * supabase-js pone a NULL las columnas que falten en alguna fila.
 */
export async function upsertRows(table: string, rows: Row[], onConflict: string, chunkSize = 500): Promise<void> {
  for (let i = 0; i < rows.length; i += chunkSize) {
    const { error } = await supabaseAdmin()
      .from(table)
      .upsert(rows.slice(i, i + chunkSize), { onConflict });
    if (error) throw new Error(`upsert ${table}: ${error.message}`);
  }
}

export async function refreshMetrics(): Promise<void> {
  const { error } = await supabaseAdmin().rpc("refresh_metrics_creatives_daily");
  if (error) throw new Error(`refresh_metrics_creatives_daily: ${error.message}`);
}
