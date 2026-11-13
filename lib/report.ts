import "server-only";
import { z } from "zod";
import { campaignAgeDays, LEARNING_DAYS, MATURATION_DAYS } from "@/lib/campaign-age";
import { fmtDay, fmtInt, fmtMoney, fmtPct } from "@/lib/format";
import { getCampaigns, getRollup, previousRange, shiftDays, type Campaign, type RollupRow } from "@/lib/metrics";
import { supabaseServer } from "@/lib/supabase/server";

// ---------------------------------------------------------------------------------------------
// Parámetros del reporte (vienen del formulario por GET, así el reporte se puede volver a abrir)
// ---------------------------------------------------------------------------------------------

export const FUNDING = {
  empresa: "Solo Right Works",
  paquete: "Compra de un paquete de leads",
  cliente: "Un cliente o agente específico",
  compartida: "Compartida entre varias personas",
} as const;
export type Funding = keyof typeof FUNDING;

export type InvestorInput = { name: string; amount: number | null; agentId: string | null };

export type ReportParams = {
  funding: Funding;
  investors: InvestorInput[];
  valueMin: number | null;
  valueMax: number | null;
};

type RawParams = Record<string, string | string[] | undefined>;
const list = (v: string | string[] | undefined): string[] => (v === undefined ? [] : Array.isArray(v) ? v : [v]);
const money = (v: string | undefined): number | null => {
  if (!v) return null;
  const n = Number(v.replace(/[$,\s]/g, ""));
  return Number.isFinite(n) && n >= 0 ? n : null;
};

export function parseReportParams(p: RawParams): ReportParams {
  const funding = (Object.keys(FUNDING) as Funding[]).includes(p.fuente as Funding) ? (p.fuente as Funding) : "empresa";
  const names = list(p.inv);
  const amounts = list(p.monto);
  const agents = list(p.agente);
  let investors = names
    .map((name, i) => ({ name: name.trim().slice(0, 80), amount: money(amounts[i]), agentId: agents[i]?.trim() || null }))
    .filter((r) => r.name !== "" || r.amount !== null);
  if (funding !== "compartida") investors = investors.slice(0, 1);
  if (investors.length === 0) investors = [{ name: funding === "empresa" ? "Right Works" : "", amount: null, agentId: null }];
  investors = investors.map((r, i) => ({ ...r, name: r.name || (funding === "empresa" ? "Right Works" : `Inversionista ${i + 1}`) }));
  let valueMin = money(list(p.vmin)[0]);
  let valueMax = money(list(p.vmax)[0]);
  if (valueMin !== null && valueMax === null) valueMax = valueMin;
  if (valueMax !== null && valueMin === null) valueMin = valueMax;
  if (valueMin !== null && valueMax !== null && valueMin > valueMax) [valueMin, valueMax] = [valueMax, valueMin];
  return { funding, investors, valueMin, valueMax };
}

// ---------------------------------------------------------------------------------------------
// Datos
// ---------------------------------------------------------------------------------------------

const num = z.coerce.number();
const agentRow = z.object({
  agent_id: z.string(),
  agent_name: z.string().nullable(),
  leads: num,
  responded: num,
  contacted_5min: num,
  no_contact: num,
  no_contact_24h: num,
  citas: num,
  showed: num,
  won: num,
  won_value: num,
  won_without_value: num,
});
export type AgentRow = z.infer<typeof agentRow>;

const winRow = z.object({
  opportunity_id: z.string(),
  contact_id: z.string(),
  contact_name: z.string().nullable(),
  agent_id: z.string().nullable(),
  agent_name: z.string().nullable(),
  campaign_id: z.string().nullable(),
  campaign_name: z.string().nullable(),
  ad_id: z.string().nullable(),
  won_at: z.string().nullable(),
  value_ghl: z.coerce.number().nullable(),
  value_manual: z.coerce.number().nullable(),
});
export type WinRow = z.infer<typeof winRow> & { value: number | null; source: "manual" | "ghl" | null };

export type CrmUser = { id: string; name: string };

export async function getCrmUsers(): Promise<CrmUser[]> {
  const supabase = await supabaseServer();
  const { data, error } = await supabase.from("crm_users").select("id, name").order("name");
  if (error) throw new Error(`crm_users: ${error.message}`);
  return (data ?? []) as CrmUser[];
}

async function rpcRows<T>(fn: string, schema: z.ZodType<T>, from: string, to: string, camps: string[]): Promise<T[]> {
  const supabase = await supabaseServer();
  const { data, error } = await supabase.rpc(fn, { p_from: from, p_to: to, p_campaigns: camps.length ? camps : null });
  if (error) throw new Error(`${fn}: ${error.message}`);
  return z.array(schema).parse(data ?? []);
}

// ---------------------------------------------------------------------------------------------
// Cálculo
// ---------------------------------------------------------------------------------------------

export type Scenario = { low: number; mid: number; high: number };
export type Recovery = { real: number; unknownWins: number; wins: number; scenario: Scenario | null };

function recovery(real: number, wins: number, unknownWins: number, p: ReportParams): Recovery {
  const scenario = p.valueMin !== null && p.valueMax !== null
    ? {
        low: real + unknownWins * p.valueMin,
        mid: real + unknownWins * ((p.valueMin + p.valueMax) / 2),
        high: real + unknownWins * p.valueMax,
      }
    : null;
  return { real, wins, unknownWins, scenario };
}

export type InvestorResult = InvestorInput & {
  invested: number;
  share: number;
  breakEvenPerWin: number | null;
  proportional: Recovery;          // su % de todo lo recuperado
  byCloser: Recovery;              // lo que cerraron los leads de su agente (o de los agentes sin inversionista)
  closerLabel: string;
};

export type Report = {
  from: string;
  to: string;
  params: ReportParams;
  total: RollupRow | null;
  previous: RollupRow | null;
  campaigns: { id: string; name: string; row: RollupRow; catalog: Campaign | null }[];
  ads: RollupRow[];
  agents: AgentRow[];
  wins: WinRow[];
  investment: number;
  metaSpend: number;
  declaredDiffers: boolean;
  totals: { leads: number; responded: number; contacted5: number; noContact24: number; citas: number; showed: number; wins: number };
  recovery: Recovery;
  breakEvenPerWin: number | null;
  investors: InvestorResult[];
  summary: string;
  bullets: { tone: "good" | "warn" | "info"; text: string }[];
};

export async function buildReport(from: string, to: string, camps: string[], params: ReportParams): Promise<Report> {
  const prev = previousRange(from, to);
  const [totalRows, prevRows, campaignRows, ads, agents, rawWins, catalog] = await Promise.all([
    getRollup(from, to, "total", camps),
    getRollup(prev.from, prev.to, "total", camps),
    getRollup(from, to, "campaign", camps),
    getRollup(from, to, "ad", camps),
    rpcRows("report_agents", agentRow, from, to, camps),
    rpcRows("report_wins", winRow, from, to, camps),
    getCampaigns(),
  ]);
  const total = totalRows[0] ?? null;
  const byId = new Map(catalog.map((c) => [c.id, c]));
  const campaigns = campaignRows
    .filter((r) => r.spend > 0 || r.leads_ghl > 0)
    .map((row) => ({ id: row.key, name: byId.get(row.key)?.name ?? `Campaña ${row.key}`, row, catalog: byId.get(row.key) ?? null }));

  const wins: WinRow[] = rawWins.map((w) => {
    const value = w.value_manual ?? w.value_ghl;
    return { ...w, value, source: w.value_manual !== null ? "manual" : w.value_ghl !== null ? "ghl" : null };
  });

  const metaSpend = total?.spend ?? 0;
  const declared = params.investors.reduce((s, i) => s + (i.amount ?? 0), 0);
  const investment = params.funding === "compartida" || params.investors[0]?.amount !== null ? declared || metaSpend : metaSpend;
  const declaredDiffers = declared > 0 && Math.abs(declared - metaSpend) > 0.5;

  const sum = (k: keyof AgentRow) => agents.reduce((s, a) => s + Number(a[k] ?? 0), 0);
  const totals = {
    leads: sum("leads"), responded: sum("responded"), contacted5: sum("contacted_5min"), noContact24: sum("no_contact_24h"),
    citas: sum("citas"), showed: sum("showed"), wins: sum("won"),
  };
  const realTotal = sum("won_value");
  const unknownTotal = sum("won_without_value");
  const rec = recovery(realTotal, totals.wins, unknownTotal, params);
  const breakEvenPerWin = totals.wins > 0 ? investment / totals.wins : null;

  // Inversionistas: % por monto (si nadie puso monto, partes iguales)
  const amounts = params.investors.map((i) => (params.funding === "compartida" ? i.amount ?? 0 : investment));
  const amountSum = amounts.reduce((s, a) => s + a, 0);
  const linked = new Set(params.investors.map((i) => i.agentId).filter((a): a is string => !!a));
  const unlinked = params.investors.filter((i) => !i.agentId);
  const unlinkedAmount = unlinked.reduce((s, i) => s + (params.funding === "compartida" ? i.amount ?? 0 : investment), 0);
  const restAgents = agents.filter((a) => !linked.has(a.agent_id));
  const rest = { won: restAgents.reduce((s, a) => s + a.won, 0), val: restAgents.reduce((s, a) => s + a.won_value, 0), unk: restAgents.reduce((s, a) => s + a.won_without_value, 0) };

  const investors: InvestorResult[] = params.investors.map((inv, i) => {
    const invested = amounts[i];
    const share = amountSum > 0 ? invested / amountSum : 1 / params.investors.length;
    const scale = (r: Recovery, f: number): Recovery => ({
      real: r.real * f, wins: r.wins * f, unknownWins: r.unknownWins * f,
      scenario: r.scenario ? { low: r.scenario.low * f, mid: r.scenario.mid * f, high: r.scenario.high * f } : null,
    });
    let byCloser: Recovery;
    let closerLabel: string;
    if (inv.agentId) {
      const a = agents.find((x) => x.agent_id === inv.agentId);
      byCloser = recovery(a?.won_value ?? 0, a?.won ?? 0, a?.won_without_value ?? 0, params);
      closerLabel = `Leads de ${a?.agent_name ?? "su agente"}`;
    } else {
      const f = unlinkedAmount > 0 ? (params.funding === "compartida" ? inv.amount ?? 0 : investment) / unlinkedAmount : 1 / Math.max(unlinked.length, 1);
      byCloser = scale(recovery(rest.val, rest.won, rest.unk, params), f);
      closerLabel = linked.size ? "Leads de los demás agentes" : "Todos los leads";
    }
    return { ...inv, invested, share, breakEvenPerWin: totals.wins > 0 ? invested / totals.wins : null, proportional: scale(rec, share), byCloser, closerLabel };
  });

  const report: Report = {
    from, to, params, total, previous: prevRows[0] ?? null, campaigns, ads, agents, wins,
    investment, metaSpend, declaredDiffers, totals, recovery: rec, breakEvenPerWin, investors, summary: "", bullets: [],
  };
  report.summary = summaryText(report);
  report.bullets = bullets(report, byId);
  return report;
}

// ---------------------------------------------------------------------------------------------
// Texto
// ---------------------------------------------------------------------------------------------

export function recoveredText(r: Recovery): string {
  if (r.wins === 0) return "aún sin ganados";
  if (r.unknownWins === 0) return fmtMoney(r.real);
  if (r.scenario) return `${fmtMoney(r.scenario.low)} – ${fmtMoney(r.scenario.high)} (estimado)`;
  return r.real > 0 ? `${fmtMoney(r.real)} + ${fmtInt(Math.round(r.unknownWins * 10) / 10)} sin valor` : "sin valor cargado";
}

function summaryText(r: Report): string {
  const t = r.total;
  const leads = t?.leads_ghl ?? 0;
  const parts: string[] = [];
  parts.push(`Del ${fmtDay(r.from)} al ${fmtDay(r.to)} se invirtieron ${fmtMoney(r.investment)}${r.campaigns.length ? ` en ${r.campaigns.length} ${r.campaigns.length === 1 ? "campaña" : "campañas"}` : ""}.`);
  if (leads === 0) {
    parts.push("Todavía no llegaron leads de Meta en este período.");
    return parts.join(" ");
  }
  parts.push(`Llegaron ${fmtInt(leads)} leads reales (CPL ${fmtMoney(t?.cpl_real ?? null)}); ${fmtInt(r.totals.responded)} respondieron (${fmtPct(leads ? r.totals.responded / leads : null)}) y ${fmtInt(r.totals.citas)} agendaron cita${r.totals.citas ? ` (${fmtMoney(t?.cost_per_appointment ?? null)} por cita)` : ""}.`);
  if (r.totals.wins === 0) {
    parts.push(`Aún no hay ganados: el primero tendría que dejar al menos ${fmtMoney(r.investment)} para recuperar la inversión.`);
  } else {
    parts.push(`Hubo ${fmtInt(r.totals.wins)} ${r.totals.wins === 1 ? "ganado" : "ganados"}: cada uno tiene que dejar al menos ${fmtMoney(r.breakEvenPerWin)} para recuperar la inversión.`);
    if (r.recovery.unknownWins === 0) {
      parts.push(`Se recuperaron ${fmtMoney(r.recovery.real)} (${fmtPct(r.investment ? r.recovery.real / r.investment : null)} de lo invertido).`);
    } else if (r.recovery.scenario) {
      parts.push(`Con el rango estimado, lo recuperado estaría entre ${fmtMoney(r.recovery.scenario.low)} y ${fmtMoney(r.recovery.scenario.high)}.`);
    } else if (r.recovery.real > 0) {
      parts.push(`Hay ${fmtMoney(r.recovery.real)} recuperados con valor real cargado; ${fmtInt(r.recovery.unknownWins)} ganados todavía no tienen valor.`);
    }
  }
  return parts.join(" ");
}

function bullets(r: Report, byId: Map<string, Campaign>) {
  const out: Report["bullets"] = [];
  const withCita = r.ads.filter((a) => a.opps_appointment > 0 && a.cost_per_appointment !== null);
  if (withCita.length > 1) {
    const best = withCita.reduce((a, b) => ((a.cost_per_appointment ?? Infinity) <= (b.cost_per_appointment ?? Infinity) ? a : b));
    out.push({ tone: "good", text: `Mejor anuncio por costo por cita: ${best.key} (${fmtMoney(best.cost_per_appointment)} por cita, ${fmtInt(best.opps_appointment)} citas).` });
  }
  if (r.agents.length > 1) {
    const ranked = r.agents.filter((a) => a.leads >= 3).map((a) => ({ a, rate: a.citas / a.leads }));
    if (ranked.length > 1) {
      const top = ranked.reduce((x, y) => (x.rate >= y.rate ? x : y));
      out.push({ tone: "good", text: `${top.a.agent_name ?? "Sin agente"} convierte más leads en cita: ${fmtPct(top.rate)}.` });
    }
  }
  if (r.totals.noContact24 > 0) {
    out.push({ tone: "warn", text: `${fmtInt(r.totals.noContact24)} ${r.totals.noContact24 === 1 ? "lead lleva" : "leads llevan"} más de 24 h sin contacto de un agente.` });
  }
  const reported = r.total?.leads_reported ?? 0;
  const real = r.total?.leads_ghl ?? 0;
  if (reported - real >= 2) {
    out.push({ tone: "warn", text: `Meta reporta ${fmtInt(reported)} leads y a GHL llegaron ${fmtInt(real)}: revisa la conexión de Facebook en GHL o envíos duplicados.` });
  }
  const young = r.campaigns.filter((c) => {
    const age = campaignAgeDays(byId.get(c.id) ?? null);
    return age !== null && age < LEARNING_DAYS;
  });
  if (young.length) {
    out.push({ tone: "info", text: `${young.length === 1 ? "Una campaña lleva" : `${young.length} campañas llevan`} menos de ${LEARNING_DAYS} días encendida: su CPL es variable y el costo por cita y por ganado sale inflado.` });
  }
  if (r.to >= shiftDays(new Date().toISOString().slice(0, 10), -(MATURATION_DAYS - 1))) {
    out.push({ tone: "info", text: `Los leads de los últimos ${MATURATION_DAYS} días todavía pueden agendar o cerrar: las citas y ganados de este período se irán sumando.` });
  }
  if (r.declaredDiffers) {
    out.push({ tone: "info", text: `La inversión declarada (${fmtMoney(r.investment)}) no coincide con el gasto en Meta del período (${fmtMoney(r.metaSpend)}). Los cálculos usan la declarada.` });
  }
  return out;
}
