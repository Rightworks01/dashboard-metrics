import { fetchJson } from "@/lib/http";
import { supabaseAdmin, upsertRows, type Row } from "@/lib/supabase/admin";
import { graphUrl, metaAccountId, metaRetryable } from "./client";

type MetaCampaign = {
  id: string;
  name: string;
  status: string;
  effective_status?: string;
  objective?: string;
  daily_budget?: string; // en centavos de la moneda de la cuenta
};

type CampaignsPage = { data: MetaCampaign[]; paging?: { next?: string } };

export type CampaignStatus = "ACTIVE" | "PAUSED";

const FIELDS = "id,name,status,effective_status,objective,daily_budget";

function toRow(c: MetaCampaign, syncedAt: string): Row {
  return {
    id: c.id,
    name: c.name,
    status: c.status,
    effective_status: c.effective_status ?? null,
    objective: c.objective ?? null,
    daily_budget: c.daily_budget ? Number(c.daily_budget) / 100 : null,
    synced_at: syncedAt,
  };
}

/** Copia nombre y estado de las campañas de la cuenta a `meta_campaigns`. */
export async function syncMetaCampaigns(): Promise<{ campaigns: number }> {
  const syncedAt = new Date().toISOString();
  const rows: Row[] = [];
  let url: string | undefined = graphUrl(`act_${metaAccountId()}/campaigns`, { fields: FIELDS, limit: "200" });
  while (url) {
    const page: CampaignsPage = await fetchJson<CampaignsPage>(url, {}, "Meta campaigns", metaRetryable);
    rows.push(...page.data.map((c) => toRow(c, syncedAt)));
    url = page.paging?.next;
  }
  await upsertRows("meta_campaigns", rows, "id");
  return { campaigns: rows.length };
}

/**
 * Pausa o activa una campaña en Meta y guarda el estado nuevo. Requiere que el token tenga
 * `ads_management`. Solo acepta campañas ya sincronizadas desde META_AD_ACCOUNT_ID, para no
 * poder tocar campañas de otras cuentas a las que el token tenga acceso.
 */
export async function setCampaignStatus(campaignId: string, status: CampaignStatus): Promise<Row> {
  const { data: known, error } = await supabaseAdmin()
    .from("meta_campaigns")
    .select("id")
    .eq("id", campaignId)
    .maybeSingle();
  if (error) throw new Error(`select meta_campaigns: ${error.message}`);
  if (!known) throw new Error(`campaña ${campaignId} no pertenece a la cuenta sincronizada`);

  // Cambiar el estado es idempotente: reintentar ante errores transitorios es seguro
  await fetchJson<{ success: boolean }>(
    graphUrl(campaignId),
    { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ status }) },
    `Meta POST campaign status`,
    metaRetryable,
  );

  const fresh = await fetchJson<MetaCampaign>(graphUrl(campaignId, { fields: FIELDS }), {}, "Meta campaign", metaRetryable);
  const row = toRow(fresh, new Date().toISOString());
  await upsertRows("meta_campaigns", [row], "id");
  return row;
}
