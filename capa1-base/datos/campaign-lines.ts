import "server-only";
import { supabaseAdmin } from "@base/conexiones/supabase/admin";
import { supabaseServer } from "@base/conexiones/supabase/server";
import { logError, logInfo } from "@base/conexiones/log";
import { parseLinea, type Linea } from "@base/util/lineas";

/** Líneas fijadas por un admin (campaign_id → línea). Las demás campañas usan la automática. */
export async function getFixedLines(): Promise<Map<string, Linea>> {
  const supabase = await supabaseServer();
  const { data, error } = await supabase.from("campaign_lines").select("campaign_id, line");
  if (error) throw new Error(`campaign_lines: ${error.message}`);
  return new Map((data ?? []).flatMap((r: { campaign_id: string; line: string }) => {
    const l = parseLinea(r.line);
    return l ? [[r.campaign_id, l] as const] : [];
  }));
}

export type SetLineResult = { ok?: boolean; error?: string };

/** Fija la línea de una campaña (null = volver a automática). Sin permisos: los decide la Capa 3. */
export async function setCampaignLineOp(campaignId: string, line: Linea | null, by: string): Promise<SetLineResult> {
  if (!/^\d+$/.test(campaignId)) return { error: "Campaña no válida." };
  try {
    const db = supabaseAdmin();
    const { error } = line
      ? await db.from("campaign_lines").upsert({ campaign_id: campaignId, line, updated_at: new Date().toISOString(), updated_by: by })
      : await db.from("campaign_lines").delete().eq("campaign_id", campaignId);
    if (error) throw error;
    logInfo("campaign_lines.set", { campaignId, line, by });
    return { ok: true };
  } catch (error) {
    logError("campaign_lines.set", error, { campaignId, line });
    return { error: "No se pudo guardar la línea." };
  }
}
