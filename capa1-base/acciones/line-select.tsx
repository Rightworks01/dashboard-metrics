"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { autoLine, LINEA_ORDER, LINEAS, type LineaInfo } from "@base/util/lineas";
import { LineDot } from "@visual/componentes/line-badge";

/**
 * Selector de la línea de trabajo de una campaña (columna "Línea" en Campañas, solo admins).
 * "Automática" = la que sale del nombre; elegir una línea la deja fijada. `assign` = acción con permiso (Capa 3).
 */
export function LineSelect({ campaignId, campaignName, info, assign }: {
  campaignId: string; campaignName: string; info: LineaInfo;
  assign: (campaignId: string, line: string) => Promise<{ ok?: boolean; error?: string }>;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const auto = autoLine(campaignName);
  const value = info.source === "admin" && info.line ? info.line : "";

  async function change(next: string) {
    setSaving(true);
    setError(null);
    const res = await assign(campaignId, next).catch(() => ({ error: "No se pudo guardar." }));
    setSaving(false);
    if (res.error) setError(res.error);
    else router.refresh();
  }

  return (
    <div className="flex flex-col items-start gap-0.5 text-left">
      <span className="flex items-center gap-2">
        {info.line ? <LineDot line={info.line} /> : <span aria-hidden="true">⚠️</span>}
        <select value={value} disabled={saving} onChange={(e) => void change(e.target.value)} aria-label={`Línea de ${campaignName}`}
          className={`rounded-md border bg-surface px-2 py-1 text-xs font-medium focus:border-accent focus:outline-none ${
            info.line ? "border-line text-ink" : "border-warning-ink/60 text-warning-ink"}`}>
          <option value="">{auto ? `Automática: ${LINEAS[auto.line].short}` : "Sin línea — elegir"}</option>
          {LINEA_ORDER.map((l) => <option key={l} value={l}>{LINEAS[l].short}</option>)}
        </select>
      </span>
      <span className="text-[11px] text-ink-3">
        {saving ? "Guardando…" : info.source === "admin" ? "✓ fijada por admin" : auto ? `automática · dice “${auto.keyword}”` : "el nombre no dice la línea"}
      </span>
      {error && <span role="alert" className="text-[11px] text-critical">{error}</span>}
    </div>
  );
}
