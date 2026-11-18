"use client";

import { useActionState } from "react";
import type { WinValueState } from "@base/datos/won-values";

export type WinValueAction = (state: WinValueState, form: FormData) => Promise<WinValueState>;

/** Botón "Descargar PDF": abre el diálogo de impresión (Guardar como PDF). */
export function PrintButton() {
  return (
    <button type="button" onClick={() => window.print()}
      className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 print:hidden">
      Descargar PDF
    </button>
  );
}

/** Valor real de un ganado (solo admins; los agentes no cargan montos). */
/** `save` = la acción con permisos (la pasa la página desde la Capa 3). */
export function WinValueForm({ opportunityId, value, save }: { opportunityId: string; value: number | null; save: WinValueAction }) {
  const [state, action, pending] = useActionState<WinValueState, FormData>(save, {});
  return (
    <form action={action} className="flex items-center justify-end gap-1.5 print:hidden">
      <input type="hidden" name="opportunityId" value={opportunityId} />
      <input name="value" defaultValue={value ?? ""} inputMode="decimal" placeholder="$ valor" aria-label="Valor real del ganado"
        className="w-24 rounded-md border border-line bg-surface px-2 py-1 text-right text-xs tabular-nums text-ink focus:border-accent focus:outline-none" />
      <button type="submit" disabled={pending} className="rounded-md border border-line px-2 py-1 text-xs font-medium text-ink-2 hover:bg-surface-2 disabled:opacity-60">
        {pending ? "…" : state.ok ? "✓" : "Guardar"}
      </button>
      {state.error && <span className="text-xs text-critical">{state.error}</span>}
    </form>
  );
}
