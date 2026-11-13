import { NextResponse } from "next/server";
import { myAccess } from "@/lib/auth";
import { reconcileGhl } from "@/lib/ghl/reconcile";
import { logError, logInfo } from "@/lib/log";
import { syncMetaCampaigns } from "@/lib/meta/campaigns";
import { syncMetaAds } from "@/lib/meta/sync";
import { refreshMetrics } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Botones "Sincronizar GHL / Meta" del menú (solo admins): lo mismo que los crons, a pedido, con la
// sesión de Supabase en vez de CRON_SECRET. Ventanas de un run normal: 26 h en GHL, 3 días en Meta.
export async function POST(req: Request) {
  const access = await myAccess().catch(() => null);
  if (!access?.isAdmin) return NextResponse.json({ error: "no autorizado" }, { status: 401 });

  const job = new URL(req.url).searchParams.get("job");
  if (job !== "ghl" && job !== "meta") return NextResponse.json({ error: "job inválido" }, { status: 400 });

  try {
    if (job === "ghl") {
      const r = await reconcileGhl(26);
      await refreshMetrics();
      logInfo("sync.manual.ghl", { user: access.email, ...r });
      return NextResponse.json({
        ok: true,
        summary: `${r.contacts} contactos · ${r.opportunities} oportunidades · ${r.messages} mensajes · ${r.appointments} citas`,
      });
    }
    const [ads, campaigns] = await Promise.all([syncMetaAds(3), syncMetaCampaigns()]);
    await refreshMetrics();
    logInfo("sync.manual.meta", { user: access.email, ...ads, ...campaigns });
    return NextResponse.json({ ok: true, summary: `${campaigns.campaigns} campañas · ${ads.rows} filas de anuncios (${ads.since} → ${ads.until})` });
  } catch (error) {
    logError(`sync.manual.${job}`, error, { user: access.email });
    return NextResponse.json({ error: `falló la sincronización de ${job === "ghl" ? "GHL" : "Meta"}` }, { status: 500 });
  }
}
