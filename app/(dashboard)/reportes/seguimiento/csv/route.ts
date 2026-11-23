import { puede } from "@cuentas/roles";
import { myAccess } from "@cuentas/auth";
import { logError } from "@base/conexiones/log";
import { buildFollowupReport } from "@base/datos/followup";
import { getCampaigns, resolveCampaignScope, resolveRange } from "@base/datos/metrics";
import { APPOINTMENT_PHASE_LABEL } from "@base/util/appointments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const cell = (v: unknown): string => {
  if (v === null || v === undefined) return "";
  const s = typeof v === "number" ? (Number.isInteger(v) ? String(v) : v.toFixed(2)) : typeof v === "boolean" ? (v ? "Sí" : "No") : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const line = (...xs: unknown[]) => xs.map(cell).join(",");
const mins = (ms: number | null) => (ms === null ? null : Math.round(ms / 60_000));

/** Reporte de seguimiento en CSV (Excel): resumen, agentes, citas y una fila por lead. */
export async function GET(req: Request) {
  const access = await myAccess().catch(() => null);
  if (!puede(access, "reportes")) return new Response("no autorizado", { status: 401 });
  const sp = new URL(req.url).searchParams;
  const { from, to } = await resolveRange(sp.get("from") ?? undefined, sp.get("to") ?? undefined);
  const scope = await resolveCampaignScope(sp.get("camp") ?? undefined);
  try {
    const names = new Map((await getCampaigns()).map((c) => [c.id, c.name]));
    const campaignNames = scope.mode === "todas" ? [] : scope.ids.filter((id) => id !== "0").map((id) => names.get(id) ?? `Campaña ${id}`);
    const r = await buildFollowupReport(from, to, scope.ids, campaignNames);
    const rows: string[] = [line("Reporte de seguimiento Right Works", `${from} a ${to}`),
      line(campaignNames.length === 1 ? "Campaña" : "Campañas", campaignNames.length ? campaignNames.join(" · ") : "Todas las campañas de la cuenta")];
    for (const s of r.summary) rows.push(line("", s));
    for (const n of r.notes) rows.push(line("Aviso", n));
    const head = ["Leads", "Con contacto humano", "1er contacto mediana (min)", "Contactados ≤5 min", "Sin contacto", "Sin contacto +24h", "Respondieron",
      "Respondieron sin respuesta humana", "Mensajes de agentes", "Mensajes automáticos", "Mensajes de leads", "Llamadas salientes", "Contestadas",
      "Minutos en llamada", "Entrantes perdidas", "Perdidas sin devolver", "Con cita", "Ganados"];
    type T = typeof r.total;
    const vals = (t: T) => [t.leads, t.contacted, mins(t.medianFirstMs), t.under5, t.noContact, t.noContact24h, t.responded, t.respondedNoHuman,
      t.humanMsgs, t.autoMsgs, t.inboundMsgs, t.callsOut, t.callsAnswered, Math.round(t.callSeconds / 60), t.missedIn, t.missedUnreturned, t.withCita, t.won];
    rows.push("", line("POR AGENTE"), line("Agente", ...head));
    for (const a of r.agents) rows.push(line(a.agentName, ...vals(a)));
    rows.push(line("Total", ...vals(r.total)));
    rows.push("", line("POR CAMPAÑA"), line("Campaña", ...head));
    for (const c of r.campaigns) rows.push(line(c.campaignName, ...vals(c)));
    rows.push("", line("CITAS POR RESPONSABLE"), line("Responsable", "Total", "Pendientes", "Asistieron", "No asistieron", "Pasaron sin marcar", "Canceladas"));
    for (const o of r.appointmentsByOwner) rows.push(line(o.ownerName, o.total, o.pendiente, o.asistio, o.no_asistio, o.paso, o.cancelada));
    rows.push("", line("CITAS"), line("Lead", "Fecha y hora (UTC)", "Responsable", "Estado", "Cita"));
    for (const a of r.appointments) rows.push(line(a.contact_name_display, a.start_time?.replace("T", " ").slice(0, 16), a.owner_name ?? "Sin responsable", APPOINTMENT_PHASE_LABEL[a.phase], a.title));
    rows.push("", line("ETAPAS DEL PIPELINE"), line("Etapa", "Leads"));
    for (const s of r.stages) rows.push(line(s.stage, s.leads));
    rows.push("", line("LEADS"), line("Lead", "Entró (UTC)", "Campaña", "Agente", "Etapa", "Contacto humano", "1er contacto (min)", "Mensajes de agentes",
      "Automáticos", "Respondió", "Mensajes del lead", "Llamadas salientes", "Contestadas", "Minutos en llamada", "Perdidas sin devolver",
      "Último contacto humano (UTC)", "Citas", "Ganado", "Enlace en GHL"));
    for (const l of r.leads) {
      rows.push(line(l.name, l.created_at.replace("T", " ").slice(0, 16), l.campaign_name, l.agent_name ?? "Sin asignar", l.stage, l.first_contact_ms !== null,
        mins(l.first_contact_ms), l.human_msgs_out, l.auto_msgs_out, l.responded, l.inbound_msgs, l.calls_out, l.calls_answered,
        Math.round(l.call_seconds / 60), l.missed_unreturned, l.last_human_at?.replace("T", " ").slice(0, 16), l.appointments, l.won, l.contact_url));
    }
    return new Response("﻿" + rows.join("\r\n"), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="seguimiento-right-works-${from}-a-${to}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    logError("reportes.seguimiento.csv", error, { from, to });
    return new Response("No se pudo generar el CSV", { status: 500 });
  }
}
