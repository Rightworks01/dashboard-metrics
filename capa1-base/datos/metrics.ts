import "server-only";
import { z } from "zod";
import { logError } from "@base/conexiones/log";
import { supabaseServer } from "@base/conexiones/supabase/server";
import { toStateCode, US_STATES } from "@base/util/us-states";
import { viewerToday } from "@base/util/viewer-zone";
import type { CampaignScope } from "@base/util/rangos";

// Puros (sin base de datos), en util/ para que la Capa 2 también los use; se re-exportan por comodidad.
export type { CampaignScope } from "@base/util/rangos";
export { campQuery, previousRange, rangePresets, shiftDays } from "@base/util/rangos";

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
}).transform((r) => ({ ...r, cpc: r.clicks > 0 ? r.spend / r.clicks : null })); // costo por clic (Meta)

export type RollupRow = z.infer<typeof rollupRow>;

/** IDs de campaña del filtro (?camp=1,2). Vacío = todas. */
export function parseCampaigns(raw?: string): string[] {
  return (raw ?? "").split(",").map((s) => s.trim()).filter((s) => /^\d+$/.test(s));
}

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

/**
 * Opciones del filtro: campañas activas o con gasto en el rango, por inversión.
 * `agentId` = agente al que está limitada la cuenta que mira (Capa 3, `agentScope()`), o null si ve todo.
 */
export async function getCampaignOptions(from: string, to: string, agentId: string | null): Promise<CampaignOption[]> {
  // Limitado a un agente: metrics_rollup (inversión de todo) no está disponible; solo las activas.
  if (agentId) {
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

export const SORTABLE_COLUMNS = [
  "spend", "ctr", "cpc", "leads_reported", "leads_ghl", "cpl_real", "response_rate",
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
