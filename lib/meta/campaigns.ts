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
  start_time?: string;
  created_time?: string;
};

type CampaignsPage = { data: MetaCampaign[]; paging?: { next?: string } };

export type CampaignStatus = "ACTIVE" | "PAUSED";

const FIELDS = "id,name,status,effective_status,objective,daily_budget,start_time,created_time";

function toRow(c: MetaCampaign, syncedAt: string): Row {
  return {
    id: c.id,
    name: c.name,
    status: c.status,
    effective_status: c.effective_status ?? null,
    objective: c.objective ?? null,
    daily_budget: c.daily_budget ? Number(c.daily_budget) / 100 : null,
    start_time: c.start_time ?? null,
    created_time: c.created_time ?? null,
    synced_at: syncedAt,
  };
}

/**
 * Zona horaria de la cuenta publicitaria (Meta reporta los días en esa zona). Se guarda en
 * sync_state.meta_account_timezone y la usa `local_day()` en SQL para agrupar los leads por el mismo día.
 */
async function syncAccountTimezone(): Promise<string | null> {
  const acct = await fetchJson<{ timezone_name?: string }>(
    graphUrl(`act_${metaAccountId()}`, { fields: "timezone_name" }), {}, "Meta ad account", metaRetryable,
  );
  const tz = acct.timezone_name ?? null;
  if (!tz) return null;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz }); // valida que sea una zona IANA
  } catch {
    return null;
  }
  const { error } = await supabaseAdmin()
    .from("sync_state")
    .upsert({ key: "meta_account_timezone", value: tz, updated_at: new Date().toISOString() });
  if (error) throw new Error(`sync_state meta_account_timezone: ${error.message}`);
  return tz;
}

/** Copia nombre y estado de las campañas de la cuenta a `meta_campaigns` (y la zona horaria de la cuenta). */
export async function syncMetaCampaigns(): Promise<{ campaigns: number; timezone: string | null }> {
  const syncedAt = new Date().toISOString();
  const rows: Row[] = [];
  let url: string | undefined = graphUrl(`act_${metaAccountId()}/campaigns`, { fields: FIELDS, limit: "200" });
  while (url) {
    const page: CampaignsPage = await fetchJson<CampaignsPage>(url, {}, "Meta campaigns", metaRetryable);
    rows.push(...page.data.map((c) => toRow(c, syncedAt)));
    url = page.paging?.next;
  }
  await upsertRows("meta_campaigns", rows, "id");
  const timezone = await syncAccountTimezone();
  return { campaigns: rows.length, timezone };
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
