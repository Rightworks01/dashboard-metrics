import { NextResponse } from "next/server";
import { isAuthorizedCron } from "@/lib/cron-auth";
import { logError, logInfo } from "@/lib/log";
import { syncMetaCampaigns } from "@/lib/meta/campaigns";
import { syncMetaAds } from "@/lib/meta/sync";
import { refreshMetrics } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// ?days=30 para un backfill manual
export async function GET(req: Request) {
  if (!isAuthorizedCron(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const days = Math.min(Number(new URL(req.url).searchParams.get("days")) || 3, 90);
  try {
    const [result, campaigns] = await Promise.all([syncMetaAds(days), syncMetaCampaigns()]);
    // La vista se refresca aquí: es el job más frecuente (30 min en Pro, diario en Hobby)
    await refreshMetrics();
    logInfo("cron.sync-meta-ads", { ...result, ...campaigns });
    return NextResponse.json({ ok: true, ...result, ...campaigns });
  } catch (error) {
    logError("cron.sync-meta-ads", error, { days });
    return NextResponse.json({ error: "sync-meta-ads falló" }, { status: 500 });
  }
}
