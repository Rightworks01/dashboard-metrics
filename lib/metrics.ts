import "server-only";
import { z } from "zod";
import { agentScope } from "@/lib/auth";
import { logError } from "@/lib/log";
import { supabaseServer } from "@/lib/supabase/server";
import { toStateCode, US_STATES } from "@/lib/us-states";
import { viewerToday } from "@/lib/viewer-zone";

export type RollupGroup = "total" | "day" | "ad" | "campaign";

// PostgREST puede devolver numeric/bigint como string: coerce a number.
const num = z.coerce.number();
const ratio = z.coerce.number().nullable();

const rollupRow = z.object({
  key: z.string(),
  campaign_id: z.string().nullable(),
  spend: num,
  impressions: num,
  clicks: num,
  leads_reported: num,
  leads_ghl: num,
  leads_responded: num,
  opps_created: num,
  opps_appointment: num,
  opps_won: num,
  cpl_real: ratio,
  cpl_responded: ratio,
  cost_per_appointment: ratio,
  cost_per_won: ratio,
  response_rate: ratio,
  ctr: ratio,
});

export type RollupRow = z.infer<typeof rollupRow>;

/** IDs de campaña del filtro (?camp=1,2). Vacío = todas. */
export function parseCampaigns(raw?: string): string[] {
  return (raw ?? "").split(",").map((s) => s.trim()).filter((s) => /^\d+$/.test(s));
}

/**
 * Alcance de campañas de una página. Sin ?camp → las campañas ACTIVAS en Meta (el valor por defecto
 * en todo el dashboard); ?camp=todas → todas; ?camp=id1,id2 → esas.
 * `ids` vacío = sin filtro (todas). `param` = lo que hay que repetir en los enlaces para conservarlo.
 */
export type CampaignScope = { mode: "activas" | "todas" | "custom"; ids: string[]; param?: string };

const NO_CAMPAIGN = "0"; // ninguna campaña activa: filtro que no coincide con nada (no "todas")

export async function resolveCampaignScope(raw?: string): Promise<CampaignScope> {
  if (raw === "todas") return { mode: "todas", ids: [], param: "todas" };
  // "activas" explícito: igual que sin ?camp, para pantallas cuyo valor por defecto es otro (Campañas)
  const explicitActive = raw === "activas";
  const ids = explicitActive ? [] : parseCampaigns(raw);
  if (ids.length) return { mode: "custom", ids, param: ids.join(",") };
  try {
    const active = (await getCampaigns()).filter((c) => c.status === "ACTIVE").map((c) => c.id);
    return { mode: "activas", ids: active.length ? active : [NO_CAMPAIGN], ...(explicitActive ? { param: "activas" } : {}) };
  } catch (error) {
    // Sin catálogo no se sabe cuáles están activas: se muestra todo, y el selector lo dice
    logError("metrics.campaignScope", error);
    return { mode: "todas", ids: [], param: "todas" };
  }
}

/** "&camp=…" para enlaces que deben conservar el alcance actual ("" = el valor por defecto). */
export const campQuery = (scope: CampaignScope): string => (scope.param ? `&camp=${scope.param}` : "");

/**
 * Métricas agregadas en [from, to] (fechas UTC, inclusive) vía la función SQL metrics_rollup.
 * `campaigns` vacío = todas las campañas.
 */
export async function getRollup(from: string, to: string, group: RollupGroup, campaigns: string[] = []): Promise<RollupRow[]> {
  const supabase = await supabaseServer();
  const { data, error } = await supabase.rpc("metrics_rollup", {
    p_from: from, p_to: to, p_group: group, p_campaigns: campaigns.length ? campaigns : null,
  });
  if (error) throw new Error(`metrics_rollup(${group}): ${error.message}`);
  return z.array(rollupRow).parse(data ?? []);
}

const campaignRow = z.object({
  id: z.string(),
  name: z.string(),
  status: z.string(),
  effective_status: z.string().nullable(),
  objective: z.string().nullable(),
  daily_budget: ratio,
  start_time: z.string().nullable().optional(),
  created_time: z.string().nullable().optional(),
  first_spend_date: z.string().nullable().optional(),
  synced_at: z.string(),
});

export type Campaign = z.infer<typeof campaignRow>;

/** Catálogo de campañas (nombre + estado en Meta), sincronizado por sync-meta-ads. */
export async function getCampaigns(): Promise<Campaign[]> {
  const supabase = await supabaseServer();
  const [{ data, error }, { data: days, error: daysError }] = await Promise.all([
    supabase.from("meta_campaigns").select("*").order("name"),
    // Primer día con datos por campaña: respaldo de la fecha de inicio si Meta aún no la dio
    supabase.from("meta_ads_daily").select("campaign_id, date").order("date").limit(10000),
  ]);
  if (error) throw new Error(`meta_campaigns: ${error.message}`);
  if (daysError) throw new Error(`meta_ads_daily: ${daysError.message}`);
  const firstDay = new Map<string, string>();
  for (const d of (days ?? []) as { campaign_id: string | null; date: string }[]) {
    if (d.campaign_id && !firstDay.has(d.campaign_id)) firstDay.set(d.campaign_id, d.date);
  }
  return z.array(campaignRow).parse((data ?? []).map((c) => ({ ...c, first_spend_date: firstDay.get(c.id) ?? null })));
}

export type CampaignOption = { id: string; name: string; spend: number; active: boolean };

/** Opciones del filtro: campañas activas o con gasto en el rango, por inversión. */
export async function getCampaignOptions(from: string, to: string): Promise<CampaignOption[]> {
  // Limitado a un agente: metrics_rollup (inversión de todo) no está disponible; solo las activas.
  if (await agentScope()) {
    return (await getCampaigns()).filter((c) => c.status === "ACTIVE").map((c) => ({ id: c.id, name: c.name, spend: 0, active: true }));
  }
  const [byCampaign, catalog] = await Promise.all([getRollup(from, to, "campaign"), getCampaigns()]);
  const spend = new Map(byCampaign.map((r) => [r.key, r.spend]));
  const options = new Map<string, CampaignOption>();
  for (const c of catalog) {
    const s = spend.get(c.id) ?? 0;
    if (c.status === "ACTIVE" || s > 0) options.set(c.id, { id: c.id, name: c.name, spend: s, active: c.status === "ACTIVE" });
  }
  for (const [id, s] of spend) {
    if (id && !options.has(id)) options.set(id, { id, name: `Campaña ${id}`, spend: s, active: false });
  }
  return [...options.values()].sort((a, b) => b.spend - a.spend || Number(b.active) - Number(a.active));
}

const stateRow = z.object({
  state: z.string(),
  leads: num,
  responded: num,
  appointments: num,
  won: num,
});

export type StateMetrics = { code: string; name: string; leads: number; responded: number; appointments: number; won: number };

/**
 * Leads atribuidos a Meta por estado de EE. UU. Normaliza lo que venga de GHL ("tx", "Texas")
 * y junta en `unmatched` los vacíos o no reconocibles.
 */
export async function getLeadsByState(
  from: string,
  to: string,
  campaigns: string[] = [],
): Promise<{ states: StateMetrics[]; unmatched: number; unmatchedSamples: string[] }> {
  const supabase = await supabaseServer();
  const { data, error } = await supabase.rpc("leads_by_state", {
    p_from: from, p_to: to, p_campaigns: campaigns.length ? campaigns : null,
  });
  if (error) throw new Error(`leads_by_state: ${error.message}`);

  const byCode = new Map<string, StateMetrics>();
  let unmatched = 0;
  const unmatchedSamples: string[] = [];
  for (const r of z.array(stateRow).parse(data ?? [])) {
    const code = r.state ? toStateCode(r.state) : null;
    if (!code) {
      unmatched += r.leads;
      if (r.state && unmatchedSamples.length < 5) unmatchedSamples.push(r.state);
      continue;
    }
    const acc = byCode.get(code) ?? { code, name: US_STATES[code], leads: 0, responded: 0, appointments: 0, won: 0 };
    acc.leads += r.leads;
    acc.responded += r.responded;
    acc.appointments += r.appointments;
    acc.won += r.won;
    byCode.set(code, acc);
  }
  return { states: [...byCode.values()].sort((a, b) => b.leads - a.leads), unmatched, unmatchedSamples };
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Rango por defecto: el mes en curso (día 1 → hoy, con "hoy" en la zona de quien mira). Invierte
 * from/to si vienen al revés.
 */
export async function resolveRange(from?: string, to?: string): Promise<{ from: string; to: string }> {
  const defaultTo = await viewerToday();
  const defaultFrom = `${defaultTo.slice(0, 7)}-01`;
  const f = from && DATE_RE.test(from) ? from : defaultFrom;
  const t = to && DATE_RE.test(to) ? to : defaultTo;
  return f <= t ? { from: f, to: t } : { from: t, to: f };
}

export function shiftDays(iso: string, days: number): string {
  return isoDay(new Date(Date.parse(`${iso}T00:00:00Z`) + days * 86_400_000));
}

const lastDayOfMonth = (y: number, m: number): number => new Date(Date.UTC(y, m + 1, 0)).getUTCDate();

/**
 * Período con el que se compara. Un rango que empieza el día 1 y no sale del mes (p. ej. "Este mes"
 * o "Mes pasado") se compara con los mismos días del mes anterior: 1–3 nov ↔ 1–3 oct. Cualquier otro
 * rango, con el período inmediatamente anterior de la misma duración.
 */
export function previousRange(from: string, to: string): { from: string; to: string } {
  if (from.endsWith("-01") && from.slice(0, 7) === to.slice(0, 7)) {
    const [y, m] = from.split("-").map(Number); // m = 1..12
    const py = m === 1 ? y - 1 : y;
    const pm = m === 1 ? 11 : m - 2; // 0..11
    const day = Math.min(Number(to.slice(8, 10)), lastDayOfMonth(py, pm));
    const mm = String(pm + 1).padStart(2, "0");
    return { from: `${py}-${mm}-01`, to: `${py}-${mm}-${String(day).padStart(2, "0")}` };
  }
  const days = Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1;
  return { from: shiftDays(from, -days), to: shiftDays(from, -1) };
}

/** Atajos de rango: "Este mes", "Mes pasado" y los últimos N días (hasta hoy). */
export function rangePresets(today: string) {
  const [y, m] = today.split("-").map(Number);
  const py = m === 1 ? y - 1 : y;
  const pm = m === 1 ? 12 : m - 1;
  const prevMonth = `${py}-${String(pm).padStart(2, "0")}`;
  return [
    { label: "Este mes", from: `${today.slice(0, 7)}-01`, to: today },
    { label: "Mes pasado", from: `${prevMonth}-01`, to: `${prevMonth}-${String(lastDayOfMonth(py, pm - 1)).padStart(2, "0")}` },
    ...[7, 30, 90].map((n) => ({ label: `${n}d`, from: shiftDays(today, -(n - 1)), to: today })),
  ];
}

export const SORTABLE_COLUMNS = [
  "spend", "ctr", "leads_reported", "leads_ghl", "cpl_real", "response_rate",
  "opps_appointment", "cost_per_appointment", "opps_won", "cost_per_won",
] as const;
export type SortColumn = (typeof SORTABLE_COLUMNS)[number];

export function parseSort(sort?: string, dir?: string): { sort: SortColumn; dir: "asc" | "desc" } {
  const s = SORTABLE_COLUMNS.find((c) => c === sort) ?? "spend";
  return { sort: s, dir: dir === "asc" ? "asc" : "desc" };
}

/** Ordena filas; los null (sin datos) siempre al final. */
export function sortRows(rows: RollupRow[], sort: SortColumn, dir: "asc" | "desc"): RollupRow[] {
  const sign = dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const va = a[sort];
    const vb = b[sort];
    if (va == null) return vb == null ? 0 : 1;
    if (vb == null) return -1;
    return (va - vb) * sign;
  });
}
