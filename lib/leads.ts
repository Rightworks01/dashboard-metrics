import "server-only";
import { z } from "zod";
import { supabaseServer } from "@/lib/supabase/server";
import { compareAppointments } from "@/lib/appointments";
import { toStateCode } from "@/lib/us-states";
import { validTimeZone } from "@/lib/format";
import { fetchAndStorePhone } from "@/lib/ghl/contacts";
import { logError } from "@/lib/log";

export const LEAD_FILTERS = {
  todos: "Todos",
  respondio: "Respondieron",
  cita: "Con cita",
  ganado: "Ganados",
  sin_contacto: "Sin contacto humano",
} as const;
export type LeadFilter = keyof typeof LEAD_FILTERS;

export function parseLeadFilter(raw?: string): LeadFilter {
  return raw && raw in LEAD_FILTERS ? (raw as LeadFilter) : "todos";
}

const leadRow = z.object({
  id: z.string(),
  id_ghl: z.string(),
  name: z.string().nullable(),
  created_at: z.string(),
  state: z.string().nullable(),
  assigned_to: z.string().nullable(),
  agent_name: z.string().nullable(),
  ad_id: z.string().nullable(),
  adset_id: z.string().nullable(),
  campaign_id: z.string().nullable(),
  campaign_name: z.string().nullable(),
  stage: z.string().nullable(),
  opp_status: z.string().nullable(),
  has_cita: z.boolean(),
  appointment_at: z.string().nullable(),
  appointment_status: z.string().nullable(),
  responded: z.boolean(),
  first_human_at: z.string().nullable(),
  last_reply: z.string().nullable(),
  last_reply_at: z.string().nullable(),
  conversation_ghl: z.string().nullable(),
});

export type Lead = z.infer<typeof leadRow> & { state_code: string | null; contact_url: string; conversation_url: string | null };

// Enlaces a GHL. GHL_APP_URL permite usar el dominio white-label de la agencia.
function ghlLinks(contactId: string, conversationId: string | null) {
  const base = `${process.env.GHL_APP_URL ?? "https://app.gohighlevel.com"}/v2/location/${process.env.GHL_LOCATION_ID ?? ""}`;
  return {
    contact_url: `${base}/contacts/detail/${contactId}`,
    conversation_url: conversationId ? `${base}/conversations/conversations/${conversationId}` : null,
  };
}

export async function getLeads(opts: {
  from: string; to: string; campaigns: string[]; filter: LeadFilter; ad?: string; agent?: string; state?: string;
}): Promise<Lead[]> {
  const supabase = await supabaseServer();
  const { data, error } = await supabase.rpc("leads_list", {
    p_from: opts.from,
    p_to: opts.to,
    p_campaigns: opts.campaigns.length ? opts.campaigns : null,
    p_filter: opts.filter,
    p_ad: opts.ad ?? null,
    p_agent: opts.agent ?? null,
  });
  if (error) throw new Error(`leads_list: ${error.message}`);
  const leads = z.array(leadRow).parse(data ?? []).map((l) => ({
    ...l,
    state_code: l.state ? toStateCode(l.state) : null,
    ...ghlLinks(l.id_ghl, l.conversation_ghl),
  }));
  // El estado se normaliza aquí ("Texas", "TX", "Tejas"): filtrar después
  return opts.state ? leads.filter((l) => l.state_code === opts.state) : leads;
}

const LEAD_MATCH: Record<LeadFilter, (l: Lead) => boolean> = {
  todos: () => true,
  respondio: (l) => l.responded,
  cita: (l) => l.has_cita,
  ganado: (l) => l.opp_status === "won",
  sin_contacto: (l) => !l.first_human_at,
};

/** Misma regla que leads_list(p_filter): se filtra aquí para contar todas las pestañas con una sola consulta. */
export function filterLeads(leads: Lead[], filter: LeadFilter): Lead[] {
  return leads.filter(LEAD_MATCH[filter]);
}

export function countLeads(leads: Lead[]): Record<LeadFilter, number> {
  return Object.fromEntries(
    (Object.keys(LEAD_MATCH) as LeadFilter[]).map((f) => [f, leads.filter(LEAD_MATCH[f]).length]),
  ) as Record<LeadFilter, number>;
}

/** Tiempo hasta el primer contacto humano en ms (null = sin contacto). */
export const firstContactMs = (l: Lead): number | null =>
  l.first_human_at ? Date.parse(l.first_human_at) - Date.parse(l.created_at) : null;

export const LEAD_SORTS = ["entrada", "contacto", "cita"] as const;
export type LeadSort = (typeof LEAD_SORTS)[number];

/** Orden por defecto: en "Con cita", por cita (pendientes primero); en el resto, lo más reciente. */
export function defaultLeadSort(filter: LeadFilter): { sort: LeadSort; dir: "asc" | "desc" } {
  return filter === "cita" ? { sort: "cita", dir: "asc" } : { sort: "entrada", dir: "desc" };
}

export function parseLeadSort(sort: string | undefined, dir: string | undefined, filter: LeadFilter): { sort: LeadSort; dir: "asc" | "desc" } {
  const s = LEAD_SORTS.find((x) => x === sort);
  if (!s) return defaultLeadSort(filter);
  return { sort: s, dir: dir === "asc" || dir === "desc" ? dir : defaultLeadSort(filter).dir };
}

const SORT_VALUE: Record<LeadSort, (l: Lead) => number | null> = {
  entrada: (l) => Date.parse(l.created_at),
  contacto: firstContactMs,
  cita: (l) => (l.appointment_at ? Date.parse(l.appointment_at) : null),
};

/**
 * Ordena; los vacíos (sin contacto, sin cita) siempre al final. Por cita el orden es jerárquico:
 * "asc" = pendientes primero (la más próxima) y luego las que ya pasaron (la más reciente);
 * "desc" = al revés.
 */
export function sortLeads(leads: Lead[], sort: LeadSort, dir: "asc" | "desc"): Lead[] {
  const value = SORT_VALUE[sort];
  const sign = dir === "asc" ? 1 : -1;
  const now = Date.now();
  return [...leads].sort((a, b) => {
    if (sort === "cita") {
      if (!a.appointment_at) return b.appointment_at ? 1 : 0;
      if (!b.appointment_at) return -1;
      return sign * compareAppointments(
        { start: a.appointment_at, status: a.appointment_status },
        { start: b.appointment_at, status: b.appointment_status },
        now,
      );
    }
    const va = value(a);
    const vb = value(b);
    if (va == null) return vb == null ? 0 : 1;
    if (vb == null) return -1;
    return (va - vb) * sign;
  });
}

const timelineRow = z.object({
  at: z.string(),
  type: z.enum(["message", "appointment"]),
  direction: z.string().nullable(),
  kind: z.string().nullable(),
  automated: z.boolean(),
  sender: z.string().nullable(),
  body: z.string().nullable(),
  call_status: z.string().nullable(),
  call_duration_s: z.number().nullable(),
  appt_start: z.string().nullable(),
  appt_status: z.string().nullable(),
  appt_title: z.string().nullable(),
});
export type TimelineEvent = z.infer<typeof timelineRow>;

/** Mensajes, llamadas y citas de un lead, del más antiguo al más reciente (últimos 300 mensajes). */
export async function getLeadTimeline(contactId: string): Promise<TimelineEvent[]> {
  const supabase = await supabaseServer();
  const { data, error } = await supabase.rpc("lead_timeline", { p_contact: contactId });
  if (error) throw new Error(`lead_timeline: ${error.message}`);
  return z.array(timelineRow).parse(data ?? []).sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
}

/**
 * Zona horaria ({{contact.timezone}} de GHL; null si no tiene o no es válida) y teléfono del contacto.
 * Se lee con la sesión del usuario (RLS); si el teléfono aún no está guardado, se pide a GHL.
 */
export async function getContactInfo(contactId: string): Promise<{ timeZone: string | null; phone: string | null }> {
  const supabase = await supabaseServer();
  const { data, error } = await supabase.from("contacts").select("timezone, phone, id_ghl").eq("id", contactId).maybeSingle();
  if (error) throw new Error(`contacts.info: ${error.message}`);
  const row = data as { timezone: string | null; phone: string | null; id_ghl: string } | null;
  let phone = row?.phone ?? null;
  if (row && !phone) {
    try {
      phone = await fetchAndStorePhone(contactId, row.id_ghl);
    } catch (e) {
      logError("leads.contactPhone", e, { contactId }); // sin teléfono no se rompe el panel
    }
  }
  return { timeZone: validTimeZone(row?.timezone), phone };
}

const upcomingRow = z.object({
  start_time: z.string(),
  status: z.string().nullable(),
  assigned_user_id: z.string().nullable(),
  contact: z.object({
    id: z.string(),
    name: z.string().nullable(),
    created_at: z.string(),
    state: z.string().nullable(),
    assigned_to: z.string().nullable(),
    meta_campaign_id: z.string().nullable(),
  }),
});

export type UpcomingAppointment = {
  start: string; status: string | null; contactId: string; name: string | null; leadCreatedAt: string;
  stateCode: string | null; agentId: string | null; agentName: string | null;
};

/**
 * Próximas citas (aún no llega la hora) de leads atribuidos a Meta, sin importar cuándo entró el lead:
 * la pestaña "Con cita" cuenta por cohorte del rango y dejaría fuera citas futuras de leads anteriores.
 * `campaigns` = alcance de campañas (vacío = todas); `agent` = ID de GHL o "sin".
 */
export async function getUpcomingAppointments(opts: { campaigns: string[]; agent?: string; limit?: number }): Promise<UpcomingAppointment[]> {
  const supabase = await supabaseServer();
  let q = supabase
    .from("appointments")
    .select("start_time, status, assigned_user_id, contact:contacts!inner(id, name, created_at, state, assigned_to, meta_campaign_id)")
    .gt("start_time", new Date().toISOString())
    .not("status", "in", "(cancelled,invalid)")
    .not("contact.meta_ad_id", "is", null)
    .order("start_time", { ascending: true })
    .limit(opts.limit ?? 50);
  if (opts.campaigns.length) q = q.in("contact.meta_campaign_id", opts.campaigns);
  const { data, error } = await q;
  if (error) throw new Error(`upcoming appointments: ${error.message}`);
  const rows = z.array(upcomingRow).parse(data ?? []);

  const agentIds = [...new Set(rows.map((r) => r.assigned_user_id ?? r.contact.assigned_to).filter((x): x is string => !!x))];
  const names = new Map<string, string>();
  if (agentIds.length) {
    const { data: users, error: usersError } = await supabase.from("crm_users").select("id, name").in("id", agentIds);
    if (usersError) throw new Error(`crm_users: ${usersError.message}`);
    for (const u of (users ?? []) as { id: string; name: string | null }[]) if (u.name) names.set(u.id, u.name);
  }

  return rows
    .map((r) => {
      const agentId = r.assigned_user_id ?? r.contact.assigned_to;
      return {
        start: r.start_time, status: r.status, contactId: r.contact.id, name: r.contact.name,
        leadCreatedAt: r.contact.created_at, stateCode: r.contact.state ? toStateCode(r.contact.state) : null,
        agentId, agentName: agentId ? (names.get(agentId) ?? null) : null,
      };
    })
    .filter((a) => !opts.agent || (opts.agent === "sin" ? !a.agentId : a.agentId === opts.agent));
}
