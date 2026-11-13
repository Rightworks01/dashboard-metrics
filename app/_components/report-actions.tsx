"use client";

import { useActionState } from "react";
import { saveWinValue, type WinValueState } from "@/app/(dashboard)/reportes/actions";

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
export function WinValueForm({ opportunityId, value }: { opportunityId: string; value: number | null }) {
  const [state, action, pending] = useActionState<WinValueState, FormData>(saveWinValue, {});
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
