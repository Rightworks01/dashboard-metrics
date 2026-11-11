import Link from "next/link";
import { fmtInt, fmtMoney, fmtPct } from "@/lib/format";
import type { RollupRow, SortColumn } from "@/lib/metrics";

type Column = { key: SortColumn; label: string; fmt: (r: RollupRow) => string; group: "meta" | "real" };

const COLUMNS: Column[] = [
  { key: "spend", label: "Inversión", fmt: (r) => fmtMoney(r.spend), group: "meta" },
  { key: "ctr", label: "CTR", fmt: (r) => fmtPct(r.ctr), group: "meta" },
  { key: "leads_reported", label: "Leads Meta", fmt: (r) => fmtInt(r.leads_reported), group: "meta" },
  { key: "leads_ghl", label: "Leads reales", fmt: (r) => fmtInt(r.leads_ghl), group: "real" },
  { key: "cpl_real", label: "CPL real", fmt: (r) => fmtMoney(r.cpl_real), group: "real" },
  { key: "response_rate", label: "Respuesta", fmt: (r) => fmtPct(r.response_rate), group: "real" },
  { key: "opps_appointment", label: "Citas", fmt: (r) => fmtInt(r.opps_appointment), group: "real" },
  { key: "cost_per_appointment", label: "Costo/cita", fmt: (r) => fmtMoney(r.cost_per_appointment), group: "real" },
  { key: "opps_won", label: "Ganados", fmt: (r) => fmtInt(r.opps_won), group: "real" },
  { key: "cost_per_won", label: "Costo/ganado", fmt: (r) => fmtMoney(r.cost_per_won), group: "real" },
];

const META_COLS = COLUMNS.filter((c) => c.group === "meta").length;
// Separador visual entre lo que reporta Meta y lo que pasa de verdad en GHL
const divider = (i: number) => (i === META_COLS ? "border-l border-line" : "");

/** Tabla por anuncio, agrupada Meta vs GHL. Encabezados ordenan vía URL (`sortHref`). */
// Columnas cuyo número abre la lista de leads de ese anuncio
const LEAD_LINKS: Partial<Record<SortColumn, string | undefined>> = { leads_ghl: undefined, opps_appointment: "cita", opps_won: "ganado" };

export function AdsTable({ rows, total, sort, dir, sortHref, campaignName, leadsHref }: {
  rows: RollupRow[];
  total: RollupRow | null;
  sort: SortColumn;
  dir: "asc" | "desc";
  sortHref: (key: SortColumn, dir: "asc" | "desc") => string;
  campaignName: Map<string, string>;
  leadsHref: (adId: string, etapa?: string) => string;
}) {
  if (rows.length === 0) return <p className="px-5 pb-5 text-sm text-ink-3">Sin anuncios con gasto en este rango.</p>;
  return (
    <div className="relative overflow-x-auto">
      <table className="w-full text-right text-sm tabular-nums">
        <thead className="text-xs text-ink-3">
          <tr className="border-t border-line">
            <th />
            <th colSpan={META_COLS} className="px-3 pt-2 text-center font-medium">Según Meta</th>
            <th colSpan={COLUMNS.length - META_COLS} className="border-l border-line px-3 pt-2 text-center font-medium">Según GHL (real)</th>
          </tr>
          <tr className="border-b border-line bg-surface-2/60">
            <th className="sticky left-0 bg-surface px-5 py-2.5 text-left font-medium">Anuncio</th>
            {COLUMNS.map((c, i) => {
              const active = sort === c.key;
              return (
                <th key={c.key} aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : undefined}
                  className={`whitespace-nowrap px-3 py-2.5 font-medium ${divider(i)}`}>
                  <Link href={sortHref(c.key, active && dir === "desc" ? "asc" : "desc")}
                    className={`hover:text-ink ${active ? "text-ink" : ""}`}>
                    {c.label}<span aria-hidden="true" className="ml-0.5">{active ? (dir === "asc" ? "↑" : "↓") : ""}</span>
                  </Link>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((r) => (
            <tr key={r.key} className="transition-colors hover:bg-surface-2/50">
              <td className="sticky left-0 bg-surface px-5 py-2.5 text-left">
                <span className="font-mono text-xs text-ink">{r.key}</span>
                {r.campaign_id && (
                  <span className="block max-w-64 truncate text-xs text-ink-3">{campaignName.get(r.campaign_id) ?? `camp. ${r.campaign_id}`}</span>
                )}
              </td>
              {COLUMNS.map((c, i) => (
                <td key={c.key} className={`px-3 py-2.5 ${divider(i)} ${sort === c.key ? "font-semibold text-ink" : "text-ink-2"}`}>
                  {c.key in LEAD_LINKS && Number(r[c.key]) > 0 ? (
                    <Link href={leadsHref(r.key, LEAD_LINKS[c.key])} className="font-medium text-accent hover:underline">{c.fmt(r)}</Link>
                  ) : c.fmt(r)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
        {total && (
          <tfoot className="border-t-2 border-line font-semibold text-ink">
            <tr>
              <td className="sticky left-0 bg-surface px-5 py-2.5 text-left">Total</td>
              {COLUMNS.map((c, i) => <td key={c.key} className={`px-3 py-2.5 ${divider(i)}`}>{c.fmt(total)}</td>)}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}
