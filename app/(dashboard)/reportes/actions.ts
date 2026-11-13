"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { myAccess } from "@/lib/auth";
import { logError, logInfo } from "@/lib/log";
import { supabaseAdmin } from "@/lib/supabase/admin";

export type WinValueState = { ok?: boolean; error?: string };

const schema = z.object({
  opportunityId: z.uuid(),
  value: z.string().trim().transform((v) => v.replace(/[$,\s]/g, "")),
});

/** Valor real de un ganado. Solo administradores (los agentes no cargan montos). Vacío = borrar. */
export async function saveWinValue(_: WinValueState, form: FormData): Promise<WinValueState> {
  try {
    const access = await myAccess();
    if (!access?.isAdmin) return { error: "Solo un administrador puede cargar valores." };
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
        opportunity_id: opportunityId, value: amount, updated_at: new Date().toISOString(), updated_by: access.email,
      });
      if (error) throw error;
    }
    logInfo("reportes.saveWinValue", { opportunityId, cleared: value === "", user: access.email });
    revalidatePath("/reportes");
    return { ok: true };
  } catch (error) {
    logError("reportes.saveWinValue", error);
    return { error: "No se pudo guardar. Revisa los logs de Vercel (reportes.saveWinValue)." };
  }
}
