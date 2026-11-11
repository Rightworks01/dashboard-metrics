import "server-only";
import { z } from "zod";
import { getLeads, type Lead } from "@/lib/leads";
import { agentScope } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";

const FIVE_MIN = 5 * 60_000;
const DAY = 86_400_000;

export type AgentStats = {
  agent_id: string | null;
  agent_name: string;
  leads: number;
  contacted: number;
  median_first_ms: number | null;
  under_5min: number;
  no_contact: number; // sin contacto humano
  no_contact_24h: number; // sin contacto humano y con más de 24 h desde que entró
  responded: number;
};

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

/** Velocidad del primer contacto humano por agente asignado (+ fila "total" con agent_id null). */
export function agentStats(leads: Lead[], now = Date.now()): { total: AgentStats; agents: AgentStats[] } {
  const groups = new Map<string, Lead[]>();
  for (const l of leads) {
    const key = l.assigned_to ?? "";
    groups.set(key, [...(groups.get(key) ?? []), l]);
  }
  const build = (id: string | null, name: string, rows: Lead[]): AgentStats => {
    const delays = rows.filter((l) => l.first_human_at).map((l) => Date.parse(l.first_human_at!) - Date.parse(l.created_at));
    const noContact = rows.filter((l) => !l.first_human_at);
    return {
      agent_id: id,
      agent_name: name,
      leads: rows.length,
      contacted: delays.length,
      median_first_ms: median(delays),
      under_5min: delays.filter((d) => d <= FIVE_MIN).length,
      no_contact: noContact.length,
      no_contact_24h: noContact.filter((l) => now - Date.parse(l.created_at) > DAY).length,
      responded: rows.filter((l) => l.responded).length,
    };
  };
  const agents = [...groups.entries()]
    .map(([id, rows]) => build(id || null, id ? (rows[0].agent_name ?? id) : "Sin asignar", rows))
    .sort((a, b) => b.leads - a.leads);
  return { total: build(null, "Total", leads), agents };
}

const seqRow = z.object({
  template: z.string(),
  kind: z.string().nullable(),
  leads_sent: z.coerce.number(),
  leads_replied: z.coerce.number(),
  reply_rate: z.coerce.number().nullable(),
});
export type SequenceStat = z.infer<typeof seqRow>;

const callRow = z.object({
  agent_id: z.string().nullable(),
  outbound: z.coerce.number(),
  answered: z.coerce.number(),
  not_answered: z.coerce.number(),
  avg_answered_s: z.coerce.number().nullable(),
  missed_inbound: z.coerce.number(),
  missed_returned: z.coerce.number(),
  median_return_s: z.coerce.number().nullable(),
});
export type CallStat = z.infer<typeof callRow> & { agent_name: string };

export async function getResponseData(from: string, to: string, campaigns: string[]) {
  const supabase = await supabaseServer();
  // Limitado a un agente: la RLS ya deja solo sus leads; las llamadas de otros agentes a esos leads no se muestran.
  const scope = await agentScope();
  const args = { p_from: from, p_to: to, p_campaigns: campaigns.length ? campaigns : null };
  const [leads, seq, calls, users] = await Promise.all([
    getLeads({ from, to, campaigns, filter: "todos" }),
    supabase.rpc("sequence_reply_stats", args),
    supabase.rpc("call_stats", args),
    supabase.from("crm_users").select("id, name"),
  ]);
  if (seq.error) throw new Error(`sequence_reply_stats: ${seq.error.message}`);
  if (calls.error) throw new Error(`call_stats: ${calls.error.message}`);
  if (users.error) throw new Error(`crm_users: ${users.error.message}`);
  const names = new Map((users.data ?? []).map((u: { id: string; name: string }) => [u.id, u.name]));
  return {
    ...agentStats(leads),
    sequence: z.array(seqRow).parse(seq.data ?? []),
    calls: z.array(callRow).parse(calls.data ?? [])
      .map((c) => ({ ...c, agent_name: c.agent_id ? (names.get(c.agent_id) ?? `Usuario ${c.agent_id}`) : "Sin asignar" }))
      .filter((c) => c.outbound + c.missed_inbound > 0 && (!scope || c.agent_id === scope))
      .sort((a, b) => b.outbound - a.outbound),
  };
}
