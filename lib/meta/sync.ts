import { fetchJson } from "@/lib/http";
import { upsertRows, type Row } from "@/lib/supabase/admin";
import { graphUrl, metaAccountId, metaRetryable } from "./client";

type MetaAction = { action_type: string; value: string };

type InsightRow = {
  ad_id: string;
  adset_id?: string;
  campaign_id?: string;
  date_start: string;
  spend?: string;
  impressions?: string;
  clicks?: string;
  actions?: MetaAction[];
  video_thruplay_watched_actions?: MetaAction[];
};

type InsightsPage = { data: InsightRow[]; paging?: { next?: string } };

const FIELDS = [
  "ad_id",
  "adset_id",
  "campaign_id",
  "spend",
  "impressions",
  "clicks",
  "actions",
  "video_thruplay_watched_actions",
].join(",");

const actionValue = (actions: MetaAction[] | undefined, type: string): number =>
  Number(actions?.find((a) => a.action_type === type)?.value ?? 0);

const ymd = (date: Date): string => date.toISOString().slice(0, 10);

function toRow(r: InsightRow, syncedAt: string): Row {
  return {
    ad_id: r.ad_id,
    date: r.date_start, // en la zona horaria de la cuenta publicitaria
    campaign_id: r.campaign_id ?? null,
    adset_id: r.adset_id ?? null,
    spend: Number(r.spend ?? 0),
    impressions: Number(r.impressions ?? 0),
    clicks: Number(r.clicks ?? 0),
    leads_reported: actionValue(r.actions, "lead"),
    video_3s: actionValue(r.actions, "video_view"),
    video_thruplay: actionValue(r.video_thruplay_watched_actions, "video_view"),
    synced_at: syncedAt,
  };
}

/** Re-descarga los últimos `days` días por anuncio y día (Meta corrige cifras con retraso). */
export async function syncMetaAds(days: number) {
  const until = new Date();
  const since = new Date(until.getTime() - days * 86_400_000);

  const syncedAt = new Date().toISOString();
  const rows: Row[] = [];
  let url: string | undefined = graphUrl(`act_${metaAccountId()}/insights`, {
    level: "ad",
    time_increment: "1",
    fields: FIELDS,
    time_range: JSON.stringify({ since: ymd(since), until: ymd(until) }),
    limit: "500",
  });
  while (url) {
    const page: InsightsPage = await fetchJson<InsightsPage>(url, {}, "Meta insights", metaRetryable);
    rows.push(...page.data.map((r) => toRow(r, syncedAt)));
    url = page.paging?.next;
  }

  await upsertRows("meta_ads_daily", rows, "ad_id,date");
  return { rows: rows.length, since: ymd(since), until: ymd(until) };
}
