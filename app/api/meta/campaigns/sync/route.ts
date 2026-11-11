import { NextResponse } from "next/server";
import { campaignControlUser } from "@/lib/auth";
import { logError, logInfo } from "@/lib/log";
import { syncMetaCampaigns } from "@/lib/meta/campaigns";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Refresco manual de nombres/estados: en Hobby el cron solo corre una vez al día.
export async function POST() {
  const user = await campaignControlUser();
  if (!user) return NextResponse.json({ error: "no autorizado" }, { status: 401 });
  try {
    const result = await syncMetaCampaigns();
    logInfo("meta.campaigns.sync", { ...result, user: user.email });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    logError("meta.campaigns.sync", error, { user: user.email });
    return NextResponse.json({ error: "no se pudieron leer las campañas de Meta" }, { status: 502 });
  }
}
