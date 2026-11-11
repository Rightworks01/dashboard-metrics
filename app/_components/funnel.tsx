import { fmtInt, fmtPct } from "@/lib/format";
import type { RollupRow } from "@/lib/metrics";

/** Embudo Meta → GHL: barra de un solo color + conversión desde la etapa anterior. */
export function Funnel({ total }: { total: RollupRow | null }) {
  const steps = [
    { label: "Leads según Meta", value: total?.leads_reported ?? 0 },
    { label: "Leads reales (GHL)", value: total?.leads_ghl ?? 0 },
    { label: "Respondieron", value: total?.leads_responded ?? 0 },
    { label: "Citas", value: total?.opps_appointment ?? 0 },
    { label: "Ganados", value: total?.opps_won ?? 0 },
  ];
  const max = Math.max(...steps.map((s) => s.value), 1);
  return (
    <ol className="space-y-3">
      {steps.map((s, i) => {
        const prev = i > 0 ? steps[i - 1].value : 0;
        return (
          <li key={s.label} title={`${s.label}: ${fmtInt(s.value)}`}>
            <div className="mb-1 flex items-baseline justify-between gap-2 text-xs">
              <span className="text-ink-2">{s.label}</span>
              <span className="tabular-nums">
                <span className="font-semibold text-ink">{fmtInt(s.value)}</span>
                {i > 0 && <span className="ml-1.5 text-ink-3">{fmtPct(prev > 0 ? s.value / prev : null)}</span>}
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-surface-2">
              <div className="h-full rounded-full bg-accent" style={{ width: `${s.value > 0 ? Math.max(2, (s.value / max) * 100) : 0}%` }} />
            </div>
          </li>
        );
      })}
      <li className="pt-1 text-[11px] text-ink-3">% = conversión desde la etapa anterior.</li>
    </ol>
  );
}
