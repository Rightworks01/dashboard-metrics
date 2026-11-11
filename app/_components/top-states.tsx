import Link from "next/link";
import { fmtInt, fmtPct } from "@/lib/format";
import type { StateMetrics } from "@/lib/metrics";

export function TopStates({ states, limit, leadsHref }: { states: StateMetrics[]; limit?: number; leadsHref?: (code: string) => string }) {
  if (states.length === 0) return <p className="px-5 pb-5 text-sm text-ink-3">Sin leads con estado en este rango.</p>;
  return (
    <div className="relative overflow-x-auto">
      <table className="w-full text-sm tabular-nums">
        <thead className="border-y border-line bg-surface-2/60 text-xs text-ink-3">
          <tr>
            <th className="px-5 py-2 text-left font-medium">Estado</th>
            <th className="px-3 py-2 text-right font-medium">Leads</th>
            <th className="px-3 py-2 text-right font-medium">Respuesta</th>
            <th className="px-3 py-2 text-right font-medium">Citas</th>
            <th className="px-5 py-2 text-right font-medium">Ganados</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {states.slice(0, limit).map((s) => (
            <tr key={s.code}>
              <td className="whitespace-nowrap px-5 py-2 text-left">
                <span className="mr-2 inline-block w-7 font-mono text-xs text-ink-3">{s.code}</span>
                {leadsHref ? <Link href={leadsHref(s.code)} className="text-accent hover:underline">{s.name}</Link> : s.name}
              </td>
              <td className="px-3 py-2 text-right font-medium">{fmtInt(s.leads)}</td>
              <td className="px-3 py-2 text-right text-ink-2">{fmtPct(s.leads > 0 ? s.responded / s.leads : null)}</td>
              <td className="px-3 py-2 text-right text-ink-2">{fmtInt(s.appointments)}</td>
              <td className="px-5 py-2 text-right text-ink-2">{fmtInt(s.won)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
