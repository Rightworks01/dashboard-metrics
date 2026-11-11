import { upsertRows, type Row } from "@/lib/supabase/admin";
import { logError } from "@/lib/log";
import { ghlGet, ghlLocationId } from "./client";
import { ensureContacts } from "./contacts";
import type { GhlOpportunity, GhlPipeline } from "./types";

const PAGE_LIMIT = 100;
const MAX_PAGES = 100;

let stageNames: Map<string, string> | null = null;

// Guardamos el nombre de la etapa ("Cita agendada"), no su ID, para que el dashboard sea legible.
async function loadStageNames(): Promise<Map<string, string>> {
  if (!stageNames) {
    const res = await ghlGet<{ pipelines: GhlPipeline[] }>("/opportunities/pipelines", {
      locationId: ghlLocationId(),
    });
    stageNames = new Map(res.pipelines.flatMap((p) => p.stages.map((s) => [s.id, s.name] as const)));
  }
  return stageNames;
}

export async function fetchOpportunity(id: string): Promise<GhlOpportunity> {
  const res = await ghlGet<{ opportunity: GhlOpportunity }>(`/opportunities/${id}`);
  return res.opportunity;
}

export async function listOpportunities(): Promise<GhlOpportunity[]> {
  const opportunities: GhlOpportunity[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const res = await ghlGet<{ opportunities: GhlOpportunity[] }>("/opportunities/search", {
      location_id: ghlLocationId(),
      limit: PAGE_LIMIT,
      page,
    });
    opportunities.push(...res.opportunities);
    if (res.opportunities.length < PAGE_LIMIT) break;
  }
  return opportunities;
}

export async function upsertOpportunities(opportunities: GhlOpportunity[]): Promise<number> {
  if (opportunities.length === 0) return 0;

  const contactGhlId = (o: GhlOpportunity) => o.contactId ?? o.contact?.id;
  const contacts = await ensureContacts(
    opportunities.map(contactGhlId).filter((id): id is string => !!id),
  );
  const stages = await loadStageNames();
  const syncedAt = new Date().toISOString();

  const rows: Row[] = [];
  for (const o of opportunities) {
    const ghlContactId = contactGhlId(o);
    const contactId = ghlContactId ? contacts.get(ghlContactId) : undefined;
    if (!contactId) {
      logError("ghl.upsertOpportunities", "oportunidad sin contacto", { opportunityId: o.id, ghlContactId });
      continue;
    }
    rows.push({
      id_ghl: o.id,
      contact_id: contactId,
      pipeline_stage: o.pipelineStageId ? (stages.get(o.pipelineStageId) ?? o.pipelineStageId) : null,
      value: o.monetaryValue ?? 0,
      // GHL solo expone el último cambio de etapa, que es cuando entró a la etapa actual
      stage_entered_at: o.lastStageChangeAt ?? o.createdAt ?? null,
      stage_changed_at: o.lastStageChangeAt ?? null,
      status: o.status ?? "open",
      created_at: o.createdAt ?? syncedAt,
      synced_at: syncedAt,
    });
  }
  await upsertRows("opportunities", rows, "id_ghl");
  return rows.length;
}
