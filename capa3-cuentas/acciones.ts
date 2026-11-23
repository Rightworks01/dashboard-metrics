"use server";

// Acciones del dashboard que necesitan permiso. Aquí solo se decide QUIÉN puede; lo que hace cada una
// vive en la Capa 1 (capa1-base/). Las páginas las pasan a los botones por props.
import { saveWinValueOp, type WinValueState } from "@base/datos/won-values";
import { setCampaignLineOp, type SetLineResult } from "@base/datos/campaign-lines";
import { parseLinea } from "@base/util/lineas";
import { revalidatePath } from "next/cache";
import { myAccess } from "@cuentas/auth";
import { puede } from "@cuentas/roles";

/** Valor real de un ganado en Reportes: solo administradores (los agentes no cargan montos). */
export async function saveWinValue(_: WinValueState, form: FormData): Promise<WinValueState> {
  const access = await myAccess().catch(() => null);
  if (!puede(access, "reportes")) return { error: "Solo un administrador puede cargar valores." };
  return saveWinValueOp(form, access.email);
}

/** Línea de trabajo de una campaña (solo admins). `line` vacío = volver a automática. */
export async function setCampaignLine(campaignId: string, line: string): Promise<SetLineResult> {
  const access = await myAccess().catch(() => null);
  if (!puede(access, "lineas")) return { error: "Solo un administrador puede asignar líneas." };
  const parsed = line ? parseLinea(line) : null;
  if (line && !parsed) return { error: "Línea no válida." };
  const result = await setCampaignLineOp(campaignId, parsed, access.email);
  if (result.ok) revalidatePath("/", "layout");
  return result;
}
