import "server-only";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { logError, logInfo } from "@base/conexiones/log";
import { supabaseAdmin } from "@base/conexiones/supabase/admin";

export type WinValueState = { ok?: boolean; error?: string };

const schema = z.object({
  opportunityId: z.uuid(),
  value: z.string().trim().transform((v) => v.replace(/[$,\s]/g, "")),
});

/**
 * Guarda el valor real de un ganado (vacío = borrar). Sin permisos: quién puede hacerlo lo decide la
 * Capa 3 (`saveWinValue` en capa3-cuentas/acciones.ts, solo administradores).
 */
export async function saveWinValueOp(form: FormData, by: string): Promise<WinValueState> {
  try {
    const parsed = schema.safeParse({ opportunityId: form.get("opportunityId"), value: String(form.get("value") ?? "") });
    if (!parsed.success) return { error: "Datos no válidos." };
    const { opportunityId, value } = parsed.data;
    const db = supabaseAdmin();
    if (value === "") {
      const { error } = await db.from("won_values").delete().eq("opportunity_id", opportunityId);
      if (error) throw error;
    } else {
      const amount = Number(value);
      if (!Number.isFinite(amount) || amount < 0 || amount > 10_000_000) return { error: "Monto no válido." };
      const { error } = await db.from("won_values").upsert({
        opportunity_id: opportunityId, value: amount, updated_at: new Date().toISOString(), updated_by: by,
      });
      if (error) throw error;
    }
    logInfo("reportes.saveWinValue", { opportunityId, cleared: value === "", user: by });
    revalidatePath("/reportes");
    return { ok: true };
  } catch (error) {
    logError("reportes.saveWinValue", error);
    return { error: "No se pudo guardar. Revisa los logs de Vercel (reportes.saveWinValue)." };
  }
}
