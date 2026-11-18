"use server";

// Acciones del dashboard que necesitan permiso. Aquí solo se decide QUIÉN puede; lo que hace cada una
// vive en la Capa 1 (capa1-base/). Las páginas las pasan a los botones por props.
import { saveWinValueOp, type WinValueState } from "@base/datos/won-values";
import { myAccess } from "@cuentas/auth";
import { puede } from "@cuentas/roles";

/** Valor real de un ganado en Reportes: solo administradores (los agentes no cargan montos). */
export async function saveWinValue(_: WinValueState, form: FormData): Promise<WinValueState> {
  const access = await myAccess().catch(() => null);
  if (!puede(access, "reportes")) return { error: "Solo un administrador puede cargar valores." };
  return saveWinValueOp(form, access.email);
}
