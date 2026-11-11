import Link from "next/link";
import { CampaignToggle } from "@/app/_components/campaign-toggle";
import { fmtInt, fmtMoney } from "@/lib/format";
import type { Campaign, RollupRow } from "@/lib/metrics";

export type CampaignView = { id: string; name: string; catalog: Campaign | null; metrics: RollupRow | null };

/** Catálogo de Meta + métricas del rango. Activas primero, luego por inversión. */
export function mergeCampaigns(catalog: Campaign[], metrics: RollupRow[]): CampaignView[] {
  const byId = new Map(metrics.map((m) => [m.key, m]));
  const rows: CampaignView[] = catalog
    .filter((c) => c.status === "ACTIVE" || c.status === "PAUSED" || byId.has(c.id))
    .map((c) => ({ id: c.id, name: c.name, catalog: c, metrics: byId.get(c.id) ?? null }));
  const known = new Set(catalog.map((c) => c.id));
  for (const m of metrics) {
    if (m.key && !known.has(m.key)) rows.push({ id: m.key, name: `Campaña ${m.key}`, catalog: null, metrics: m });
  }
  return rows.sort(
    (a, b) =>
      Number(b.catalog?.status === "ACTIVE") - Number(a.catalog?.status === "ACTIVE") ||
      (b.metrics?.spend ?? 0) - (a.metrics?.spend ?? 0),
  );
}

const STATUS_LABELS: Record<string, string> = {
  ACTIVE: "Activa",
  PAUSED: "Pausada",
  CAMPAIGN_PAUSED: "Pausada",
  ADSET_PAUSED: "Conjuntos pausados",
  IN_PROCESS: "Procesando",
  WITH_ISSUES: "Con problemas",
  ARCHIVED: "Archivada",
  DELETED: "Eliminada",
};

export function StatusPill({ campaign }: { campaign: Campaign | null }) {
  if (!campaign) return <span className="text-xs text-ink-3">Sin sincronizar</span>;
  const effective = campaign.effective_status ?? campaign.status;
  const running = effective === "ACTIVE";
  const issue = effective === "WITH_ISSUES";
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ${
      running ? "bg-good-soft text-good-ink" : issue ? "bg-critical-soft text-critical" : "bg-surface-2 text-ink-2"
    }`}>
      <span className={`size-1.5 rounded-full ${running ? "bg-good" : issue ? "bg-critical" : "bg-ink-3"}`} />
      {STATUS_LABELS[effective] ?? effective}
    </span>
  );
}

/** `canControl` undefined = vista de solo lectura (sin columna On/Off ni presupuesto). */
/** Cifra que lleva a la lista de leads filtrada (si hay a dónde ir). */
function CountLink({ value, href }: { value: number; href?: string }) {
  if (!href || value === 0) return <>{fmtInt(value)}</>;
  return <Link href={href} className="font-medium text-accent hover:underline">{fmtInt(value)}</Link>;
}

export function CampaignsTable({ rows, canControl, limit, leadsHref }: {
  rows: CampaignView[]; canControl?: boolean; limit?: number;
  leadsHref?: (campaignId: string, etapa?: string) => string;
}) {
  if (rows.length === 0) {
    return (
      <p className="px-5 pb-5 text-sm text-ink-3">
        Aún no hay campañas sincronizadas. Pulsa «Sincronizar con Meta» en Campañas o espera al cron diario.
      </p>
    );
  }
  const control = canControl !== undefined;
  return (
    <div className="relative overflow-x-auto">
      <table className="w-full text-right text-sm tabular-nums">
        <thead className="border-y border-line bg-surface-2/60 text-xs text-ink-3">
          <tr>
            <th className="px-5 py-2.5 text-left font-medium">Campaña</th>
            <th className="px-3 py-2.5 text-left font-medium">Estado</th>
            {control && <th className="px-3 py-2.5 font-medium">Presupuesto/día</th>}
            <th className="px-3 py-2.5 font-medium">Inversión</th>
            <th className="px-3 py-2.5 font-medium">Leads</th>
            <th className="px-3 py-2.5 font-medium">CPL real</th>
            <th className="px-3 py-2.5 font-medium">Citas</th>
            <th className={`${control ? "px-3" : "px-5"} py-2.5 font-medium`}>Costo/cita</th>
            {control && <th className="px-5 py-2.5 font-medium">On/Off</th>}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.slice(0, limit).map((r) => {
            const togglable = r.catalog?.status === "ACTIVE" || r.catalog?.status === "PAUSED";
            return (
              <tr key={r.id} className="transition-colors hover:bg-surface-2/50">
                <td className="max-w-72 px-5 py-3 text-left">
                  <span className="block truncate font-medium text-ink" title={r.name}>{r.name}</span>
                  <span className="font-mono text-xs text-ink-3">{r.id}</span>
                </td>
                <td className="px-3 py-3 text-left"><StatusPill campaign={r.catalog} /></td>
                {control && <td className="px-3 py-3 text-ink-2">{fmtMoney(r.catalog?.daily_budget ?? null)}</td>}
                <td className="px-3 py-3 font-medium">{fmtMoney(r.metrics?.spend ?? 0)}</td>
                <td className="px-3 py-3"><CountLink value={r.metrics?.leads_ghl ?? 0} href={leadsHref?.(r.id)} /></td>
                <td className="px-3 py-3">{fmtMoney(r.metrics?.cpl_real ?? null)}</td>
                <td className="px-3 py-3"><CountLink value={r.metrics?.opps_appointment ?? 0} href={leadsHref?.(r.id, "cita")} /></td>
                <td className={`${control ? "px-3" : "px-5"} py-3`}>{fmtMoney(r.metrics?.cost_per_appointment ?? null)}</td>
                {control && (
                  <td className="px-5 py-3">
                    <div className="flex justify-end">
                      {togglable && r.catalog ? (
                        <CampaignToggle id={r.id} name={r.name} active={r.catalog.status === "ACTIVE"} disabled={!canControl} />
                      ) : (
                        <span className="text-xs text-ink-3">—</span>
                      )}
                    </div>
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
