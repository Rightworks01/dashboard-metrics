import { NextResponse } from "next/server";
import { z } from "zod";
import { campaignControlUser } from "@/lib/auth";
import { logError, logInfo } from "@/lib/log";
import { setCampaignStatus } from "@/lib/meta/campaigns";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const body = z.object({
  campaign_id: z.string().regex(/^\d+$/),
  status: z.enum(["ACTIVE", "PAUSED"]),
});

// Pausa o activa una campaña de Meta. Lo llama el dashboard con la sesión del usuario.
export async function POST(req: Request) {
  const user = await campaignControlUser();
  if (!user) return NextResponse.json({ error: "no autorizado" }, { status: 401 });

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const parsed = body.safeParse(payload);
  if (!parsed.success) return NextResponse.json({ error: "payload inválido" }, { status: 400 });

  const { campaign_id, status } = parsed.data;
  try {
    const campaign = await setCampaignStatus(campaign_id, status);
    logInfo("meta.campaign.status", { campaign_id, status, user: user.email });
    return NextResponse.json({ ok: true, campaign });
  } catch (error) {
    logError("meta.campaign.status", error, { campaign_id, status, user: user.email });
    return NextResponse.json({ error: "Meta rechazó el cambio. Revisa que el token tenga ads_management." }, { status: 502 });
  }
}
