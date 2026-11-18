import { puede } from "@cuentas/roles";
import { myAccess } from "@cuentas/auth";
import { logError } from "@base/conexiones/log";
import { resolveCampaignScope, resolveRange } from "@base/datos/metrics";
import { buildReport, FUNDING, parseReportParams } from "@base/datos/report";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const cell = (v: unknown): string => {
  if (v === null || v === undefined) return "";
  const s = typeof v === "number" ? (Number.isInteger(v) ? String(v) : v.toFixed(2)) : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const line = (...xs: unknown[]) => xs.map(cell).join(",");

/** El mismo reporte en CSV (abre en Excel): una sección por tabla, separadas por una línea en blanco. */
export async function GET(req: Request) {
  const access = await myAccess().catch(() => null);
  if (!puede(access, "reportes")) return new Response("no autorizado", { status: 401 });
  const sp = new URL(req.url).searchParams;
  const raw: Record<string, string | string[]> = {};
  for (const k of new Set(sp.keys())) { const all = sp.getAll(k); raw[k] = all.length > 1 ? all : all[0]; }
  const { from, to } = await resolveRange(sp.get("from") ?? undefined, sp.get("to") ?? undefined);
  const scope = await resolveCampaignScope(sp.get("camp") ?? undefined);
  try {
    const r = await buildReport(from, to, scope.ids, parseReportParams(raw));
    const rows: string[] = [];
    rows.push(line("Reporte de campañas Right Works", `${from} a ${to}`), line("Inversión", FUNDING[r.params.funding]), line("Resumen", r.summary));
    for (const b of r.bullets) rows.push(line("", b.text));
    rows.push("", line("EMBUDO"), line("Inversión", "Leads Meta", "Leads GHL", "Respondieron", "Citas", "Asistieron", "Ganados", "CPL real", "Costo por cita", "Equilibrio por ganado"));
    rows.push(line(r.investment, r.total?.leads_reported ?? 0, r.total?.leads_ghl ?? 0, r.totals.responded, r.totals.citas, r.totals.showed, r.totals.wins,
      r.total?.cpl_real ?? null, r.totals.citas ? r.investment / r.totals.citas : null, r.breakEvenPerWin));
    rows.push("", line("POR AGENTE"), line("Agente", "Leads", "Contactado ≤5 min", "Sin contacto +24h", "Respondieron", "Citas", "Asistieron", "Ganados", "Valor real recuperado", "Ganados sin valor"));
    for (const a of r.agents) rows.push(line(a.agent_name ?? (a.agent_id || "Sin agente"), a.leads, a.contacted_5min, a.no_contact_24h, a.responded, a.citas, a.showed, a.won, a.won_value, a.won_without_value));
    rows.push("", line("INVERSIONISTAS"), line("Inversionista", "Invirtió", "%", "Equilibrio por ganado", "Recuperado real (proporcional)", "Escenario bajo", "Escenario esperado", "Escenario alto", "Según quién cerró (real)", "Según quién cerró (esperado)", "Base de 'quién cerró'"));
    for (const i of r.investors) rows.push(line(i.name, i.invested, i.share, i.breakEvenPerWin, i.proportional.real, i.proportional.scenario?.low ?? null,
      i.proportional.scenario?.mid ?? null, i.proportional.scenario?.high ?? null, i.byCloser.real, i.byCloser.scenario?.mid ?? null, i.closerLabel));
    rows.push("", line("POR CAMPAÑA"), line("Campaña", "ID", "Gasto", "Leads Meta", "Leads GHL", "CPL real", "Citas", "Costo por cita", "Ganados"));
    for (const c of r.campaigns) rows.push(line(c.name, c.id, c.row.spend, c.row.leads_reported, c.row.leads_ghl, c.row.cpl_real, c.row.opps_appointment, c.row.cost_per_appointment, c.row.opps_won));
    rows.push("", line("POR ANUNCIO"), line("Anuncio", "Gasto", "Leads Meta", "Leads GHL", "CPL real", "Citas", "Costo por cita", "Ganados"));
    for (const a of r.ads) if (a.spend > 0 || a.leads_ghl > 0) rows.push(line(a.key, a.spend, a.leads_reported, a.leads_ghl, a.cpl_real, a.opps_appointment, a.cost_per_appointment, a.opps_won));
    rows.push("", line("GANADOS"), line("Lead", "Agente", "Campaña", "Fecha", "Valor", "Origen del valor"));
    for (const w of r.wins) rows.push(line(w.contact_name, w.agent_name, w.campaign_name, w.won_at?.slice(0, 10), w.value, w.source === "manual" ? "cargado" : w.source === "ghl" ? "GHL" : "sin valor"));
    const body = "﻿" + rows.join("\r\n");
    return new Response(body, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="reporte-right-works-${from}-a-${to}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    logError("reportes.csv", error, { from, to });
    return new Response("No se pudo generar el CSV", { status: 500 });
  }
}
