import { NextResponse } from "next/server";
import { isAuthorizedCron } from "@/lib/cron-auth";
import { logError, logInfo } from "@/lib/log";
import { syncMetaCampaigns } from "@/lib/meta/campaigns";
import { syncMetaAds } from "@/lib/meta/sync";
import { refreshMetrics, supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const INITIAL_FLAG = "meta_initial_backfill_done";

// Instalación nueva: la primera corrida trae 90 días en vez de 3 (sin tener que pasar ?days a mano).
async function initialBackfillPending(): Promise<boolean> {
  const { data, error } = await supabaseAdmin().from("sync_state").select("value").eq("key", INITIAL_FLAG).maybeSingle();
  if (error) throw new Error(`sync_state ${INITIAL_FLAG}: ${error.message}`);
  return data?.value !== "1";
}

// ?days=30 para un backfill manual
export async function GET(req: Request) {
  if (!isAuthorizedCron(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let days = Math.min(Number(new URL(req.url).searchParams.get("days")) || 3, 90);
  try {
    const initial = await initialBackfillPending();
    if (initial) days = 90;
    const [result, campaigns] = await Promise.all([syncMetaAds(days), syncMetaCampaigns()]);
    // La vista se refresca aquí: es el job más frecuente (30 min en Pro, diario en Hobby)
    await refreshMetrics();
    if (initial) {
      const { error } = await supabaseAdmin()
        .from("sync_state")
        .upsert({ key: INITIAL_FLAG, value: "1", updated_at: new Date().toISOString() });
      if (error) throw new Error(`sync_state ${INITIAL_FLAG}: ${error.message}`);
    }
    logInfo("cron.sync-meta-ads", { ...result, ...campaigns });
    return NextResponse.json({ ok: true, ...result, ...campaigns });
  } catch (error) {
    logError("cron.sync-meta-ads", error, { days });
    return NextResponse.json({ error: "sync-meta-ads falló" }, { status: 500 });
  }
}
