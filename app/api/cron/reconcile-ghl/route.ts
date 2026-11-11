import { NextResponse } from "next/server";
import { isAuthorizedCron } from "@/lib/cron-auth";
import { reconcileGhl } from "@/lib/ghl/reconcile";
import { logError, logInfo } from "@/lib/log";
import { refreshMetrics } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Ventana de 26 h por defecto (solapa con la corrida anterior). ?hours=720 para un backfill.
export async function GET(req: Request) {
  if (!isAuthorizedCron(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const hours = Math.min(Number(new URL(req.url).searchParams.get("hours")) || 26, 24 * 90);
  try {
    const result = await reconcileGhl(hours);
    await refreshMetrics();
    logInfo("cron.reconcile-ghl", { hours, ...result });
    return NextResponse.json({ ok: true, hours, ...result });
  } catch (error) {
    logError("cron.reconcile-ghl", error, { hours });
    return NextResponse.json({ error: "reconcile-ghl falló" }, { status: 500 });
  }
}
