import "server-only";
import { z } from "zod";
import { supabaseServer } from "@base/conexiones/supabase/server";
import { getLeads, type Lead } from "@base/datos/leads";
import type { SequenceStat } from "@base/datos/response";
import { appointmentPhase, type AppointmentPhase } from "@base/util/appointments";
import { fmtDuration, fmtInt, fmtPct, titleCase } from "@base/util/format";
import { firstContactMs } from "@base/util/leads-util";

// Reporte de seguimiento en el CRM (Reportes → Seguimiento): qué pasó con los leads que entraron en el
// período (cohorte por fecha de entrada, como el resto del dashboard): contacto humano, velocidad,
// respuestas, llamadas, citas (y de quién son), ganados y qué leads necesitan atención.

const FIVE_MIN = 5 * 60_000;
const DAY = 86_400_000;
const num = z.coerce.number();

const activityRow = z.object({
  contact_id: z.string(),
  human_msgs_out: num, auto_msgs_out: num, inbound_msgs: num,
  calls_out: num, calls_answered: num, call_seconds: num, calls_in: num, missed_in: num, missed_unreturned: num,
  last_human_at: z.string().nullable(), last_inbound_at: z.string().nullable(),
});
type Activity = z.infer<typeof activityRow>;

const apptRow = z.object({
  appointment_id: z.string(), contact_id: z.string(), contact_name: z.string().nullable(),
  start_time: z.string().nullable(), status: z.string().nullable(), title: z.string().nullable(),
  owner_id: z.string().nullable(), owner_name: z.string().nullable(),
});
export type FollowupAppointment = z.infer<typeof apptRow> & { phase: AppointmentPhase; contact_name_display: string };

const seqRow = z.object({
  template: z.string(), kind: z.string().nullable(),
  leads_sent: num, leads_replied: num, reply_rate: z.coerce.number().nullable(),
});

const EMPTY_ACTIVITY: Omit<Activity, "contact_id"> = {
  human_msgs_out: 0, auto_msgs_out: 0, inbound_msgs: 0, calls_out: 0, calls_answered: 0, call_seconds: 0,
  calls_in: 0, missed_in: 0, missed_unreturned: 0, last_human_at: null, last_inbound_at: null,
};

/** Un lead con su actividad de seguimiento. */
export type FollowupLead = Lead & Omit<Activity, "contact_id"> & {
  first_contact_ms: number | null;
  won: boolean;
  appointments: number;
};

export type Tally = {
  leads: number;
  contacted: number;          // con contacto humano (mensaje o llamada de una persona)
  under5: number;             // 1er contacto humano en ≤ 5 min
  medianFirstMs: number | null;
  noContact: number;
  noContact24h: number;       // sin contacto humano y con más de 24 h desde que entró
  responded: number;          // el lead respondió
  respondedNoHuman: number;   // respondió y nadie le escribió/llamó (solo automáticos)
  humanMsgs: number;
  autoMsgs: number;
  inboundMsgs: number;
  callsOut: number;
  callsAnswered: number;
  callSeconds: number;
  callsIn: number;
  missedIn: number;
  missedUnreturned: number;
  withCita: number;           // leads con cita (calendario u oportunidad en etapa de cita)
  won: number;
};

export type AgentFollowup = Tally & { agentId: string | null; agentName: string };
export type OwnerAppointments = { ownerId: string | null; ownerName: string; total: number } & Record<AppointmentPhase, number>;
export type StageCount = { stage: string; leads: number };
export type CampaignFollowup = Tally & { campaignId: string | null; campaignName: string };

export type FollowupReport = {
  from: string; to: string; generatedAt: string;
  total: Tally;
  agents: AgentFollowup[];
  campaigns: CampaignFollowup[];
  stages: StageCount[];
  appointments: FollowupAppointment[];
  appointmentsByPhase: Record<AppointmentPhase, number>;
  appointmentsByOwner: OwnerAppointments[];
  sequence: SequenceStat[];
  leads: FollowupLead[];
  attention: {
    noContact24h: FollowupLead[];
    respondedNoHuman: FollowupLead[];
    missedUnreturned: FollowupLead[];
    noShow: FollowupAppointment[];
    unassigned: FollowupLead[];
  };
  summary: string[];
  notes: string[];
};

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

function tally(rows: FollowupLead[], now: number): Tally {
  const delays = rows.map((l) => l.first_contact_ms).filter((d): d is number => d !== null);
  const noContact = rows.filter((l) => l.first_contact_ms === null);
  const sum = (k: keyof Omit<Activity, "contact_id" | "last_human_at" | "last_inbound_at">) => rows.reduce((s, l) => s + l[k], 0);
  return {
    leads: rows.length,
    contacted: delays.length,
    under5: delays.filter((d) => d <= FIVE_MIN).length,
    medianFirstMs: median(delays),
    noContact: noContact.length,
    noContact24h: noContact.filter((l) => now - Date.parse(l.created_at) > DAY).length,
    responded: rows.filter((l) => l.responded).length,
    respondedNoHuman: rows.filter((l) => l.responded && l.first_contact_ms === null).length,
    humanMsgs: sum("human_msgs_out"),
    autoMsgs: sum("auto_msgs_out"),
    inboundMsgs: sum("inbound_msgs"),
    callsOut: sum("calls_out"),
    callsAnswered: sum("calls_answered"),
    callSeconds: sum("call_seconds"),
    callsIn: sum("calls_in"),
    missedIn: sum("missed_in"),
    missedUnreturned: sum("missed_unreturned"),
    withCita: rows.filter((l) => l.has_cita).length,
    won: rows.filter((l) => l.won).length,
  };
}

function groupBy<T>(rows: T[], key: (r: T) => string): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const r of rows) m.set(key(r), [...(m.get(key(r)) ?? []), r]);
  return m;
}

const PHASES: AppointmentPhase[] = ["pendiente", "asistio", "no_asistio", "paso", "cancelada"];
const zeroPhases = (): Record<AppointmentPhase, number> => ({ pendiente: 0, asistio: 0, no_asistio: 0, paso: 0, cancelada: 0 });
const pct = (n: number, d: number) => (d ? fmtPct(n / d) : "—");
/** "1 cita pendiente" / "3 citas pendientes": `one` y `many` sin el número. */
const n = (count: number, one: string, many: string) => `${fmtInt(count)} ${count === 1 ? one : many}`;

export async function buildFollowupReport(from: string, to: string, campaigns: string[]): Promise<FollowupReport> {
  const supabase = await supabaseServer();
  const args = { p_from: from, p_to: to, p_campaigns: campaigns.length ? campaigns : null };
  const [leads, act, appts, seq] = await Promise.all([
    getLeads({ from, to, campaigns, filter: "todos" }),
    supabase.rpc("followup_lead_activity", args),
    supabase.rpc("followup_appointments", args),
    supabase.rpc("sequence_reply_stats", args),
  ]);
  if (act.error) throw new Error(`followup_lead_activity: ${act.error.message}`);
  if (appts.error) throw new Error(`followup_appointments: ${appts.error.message}`);
  if (seq.error) throw new Error(`sequence_reply_stats: ${seq.error.message}`);

  const now = Date.now();
  const activity = new Map(z.array(activityRow).parse(act.data ?? []).map((a) => [a.contact_id, a]));
  const appointments: FollowupAppointment[] = z.array(apptRow).parse(appts.data ?? []).map((a) => ({
    ...a,
    phase: appointmentPhase(a.start_time, a.status, now),
    contact_name_display: a.contact_name ? titleCase(a.contact_name) : "Sin nombre",
  }));
  const apptCount = new Map<string, number>();
  for (const a of appointments) if (a.phase !== "cancelada") apptCount.set(a.contact_id, (apptCount.get(a.contact_id) ?? 0) + 1);

  const rows: FollowupLead[] = leads.map((l) => {
    const { contact_id: _id, ...a } = activity.get(l.id) ?? { contact_id: l.id, ...EMPTY_ACTIVITY };
    return { ...l, ...a, first_contact_ms: firstContactMs(l), won: l.opp_status === "won", appointments: apptCount.get(l.id) ?? 0 };
  });

  const total = tally(rows, now);
  const agents: AgentFollowup[] = [...groupBy(rows, (l) => l.assigned_to ?? "").entries()]
    .map(([id, rs]) => ({ agentId: id || null, agentName: id ? (rs[0].agent_name ?? `Usuario ${id}`) : "Sin asignar", ...tally(rs, now) }))
    .sort((a, b) => b.leads - a.leads);
  const campaignsOut: CampaignFollowup[] = [...groupBy(rows, (l) => l.campaign_id ?? "").entries()]
    .map(([id, rs]) => ({ campaignId: id || null, campaignName: rs[0].campaign_name ?? (id ? `Campaña ${id}` : "Sin campaña"), ...tally(rs, now) }))
    .sort((a, b) => b.leads - a.leads);
  const stages: StageCount[] = [...groupBy(rows, (l) => l.stage ?? "Sin oportunidad").entries()]
    .map(([stage, rs]) => ({ stage, leads: rs.length }))
    .sort((a, b) => b.leads - a.leads);

  const appointmentsByPhase = zeroPhases();
  for (const a of appointments) appointmentsByPhase[a.phase]++;
  const appointmentsByOwner: OwnerAppointments[] = [...groupBy(appointments, (a) => a.owner_id ?? "").entries()]
    .map(([id, as]) => {
      const phases = zeroPhases();
      for (const a of as) phases[a.phase]++;
      return { ownerId: id || null, ownerName: id ? (as[0].owner_name ?? `Usuario ${id}`) : "Sin responsable", total: as.length, ...phases };
    })
    .sort((a, b) => b.total - a.total);

  const byEntry = (a: FollowupLead, b: FollowupLead) => Date.parse(a.created_at) - Date.parse(b.created_at);
  const attention = {
    noContact24h: rows.filter((l) => l.first_contact_ms === null && now - Date.parse(l.created_at) > DAY).sort(byEntry),
    respondedNoHuman: rows.filter((l) => l.responded && l.first_contact_ms === null)
      .sort((a, b) => Date.parse(b.last_inbound_at ?? b.created_at) - Date.parse(a.last_inbound_at ?? a.created_at)),
    missedUnreturned: rows.filter((l) => l.missed_unreturned > 0).sort(byEntry),
    noShow: appointments.filter((a) => a.phase === "no_asistio" || a.phase === "paso"),
    unassigned: rows.filter((l) => !l.assigned_to).sort(byEntry),
  };

  // Resumen en texto y avisos
  const t = total;
  const summary: string[] = [];
  const notes: string[] = [];
  if (t.leads === 0) {
    summary.push("No entraron leads de Meta en este período.");
  } else {
    summary.push(`Entraron ${fmtInt(t.leads)} leads. ${fmtInt(t.contacted)} (${pct(t.contacted, t.leads)}) recibieron contacto de una persona`
      + (t.medianFirstMs !== null ? `, con un primer contacto típico a los ${fmtDuration(t.medianFirstMs)}` : "")
      + (t.contacted ? ` y ${pct(t.under5, t.contacted)} en 5 minutos o menos.` : "."));
    summary.push(`${n(t.noContact, "lead no tiene", "leads no tienen")} ningún contacto humano`
      + (t.noContact24h ? `; ${n(t.noContact24h, "lleva", "llevan")} más de 24 horas así.` : "."));
    summary.push(`${fmtInt(t.responded)} leads (${pct(t.responded, t.leads)}) respondieron`
      + (t.respondedNoHuman ? `; ${fmtInt(t.respondedNoHuman)} de ellos respondieron y nadie les contestó en persona.` : "."));
    const ap = appointmentsByPhase;
    const totalAppts = appointments.length;
    summary.push(`${n(t.withCita, "lead", "leads")} (${pct(t.withCita, t.leads)}) llegaron a cita. En el calendario hay ${n(totalAppts, "cita", "citas")}: `
      + `${n(ap.pendiente, "pendiente", "pendientes")}, ${n(ap.asistio, "asistió", "asistieron")}, ${n(ap.no_asistio, "no asistió", "no asistieron")}, `
      + `${n(ap.paso, "ya pasó sin marcar asistencia", "ya pasaron sin marcar asistencia")} y ${n(ap.cancelada, "cancelada", "canceladas")}.`);
    if (appointmentsByOwner.length) {
      summary.push("Citas por responsable: " + appointmentsByOwner.map((o) => `${o.ownerName} ${fmtInt(o.total)}`).join(", ") + ".");
    }
    summary.push(t.callsOut || t.callsIn
      ? `Llamadas: ${fmtInt(t.callsOut)} salientes (${fmtInt(t.callsAnswered)} contestadas, ${fmtDuration(t.callSeconds * 1000)} en total) y ${fmtInt(t.callsIn)} entrantes`
        + (t.missedIn ? `, de las que ${fmtInt(t.missedIn)} no se atendieron (${fmtInt(t.missedUnreturned)} sin devolver).` : ".")
      : "No hay llamadas registradas en GHL para estos leads.");
    summary.push(`Ganados: ${fmtInt(t.won)}.`);

    if (t.callsOut + t.callsIn === 0) {
      notes.push("No hay ninguna llamada registrada en GHL. Si los agentes llaman desde su celular u otro sistema, esas llamadas no aparecen aquí ni cuentan como contacto humano.");
    }
    if (t.humanMsgs === 0 && t.callsOut === 0) {
      notes.push("Todos los mensajes enviados a estos leads son automáticos (workflows y campañas). Ningún agente les escribió desde GHL.");
    }
    if (attention.unassigned.length) notes.push(`${n(attention.unassigned.length, "lead no tiene", "leads no tienen")} agente asignado en GHL.`);
    if (appointmentsByPhase.paso) notes.push(`${n(appointmentsByPhase.paso, "cita ya pasó", "citas ya pasaron")} y nadie marcó en GHL si el lead asistió: márcala en GHL para que "Asistió" sea real.`);
  }

  return {
    from, to, generatedAt: new Date(now).toISOString(),
    total, agents, campaigns: campaignsOut, stages,
    appointments, appointmentsByPhase, appointmentsByOwner,
    sequence: z.array(seqRow).parse(seq.data ?? []),
    leads: rows, attention, summary, notes,
  };
}

export { PHASES as APPOINTMENT_PHASES };
