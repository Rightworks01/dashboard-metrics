import { NextResponse } from "next/server";
import { myAccess } from "@/lib/auth";
import { logError, logInfo } from "@/lib/log";
import { syncMetaCampaigns } from "@/lib/meta/campaigns";
import { getPublishOptions, metaErrorMessage, publishCampaign, publishSchema, removeCreatives } from "@/lib/meta/publish";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

async function admin() {
  const access = await myAccess().catch(() => null);
  return access?.isAdmin ? access : null;
}

/** Páginas (con Instagram y formularios), estados de EE. UU. e idiomas para el asistente. */
export async function GET() {
  if (!(await admin())) return NextResponse.json({ error: "no autorizado" }, { status: 401 });
  try {
    return NextResponse.json(await getPublishOptions());
  } catch (error) {
    logError("meta.publish.options", error);
    return NextResponse.json({ error: metaErrorMessage(error) }, { status: 502 });
  }
}

/** Crea campaña + conjunto + anuncios EN PAUSA. */
export async function POST(req: Request) {
  const access = await admin();
  if (!access) return NextResponse.json({ error: "no autorizado" }, { status: 401 });
  const started = Date.now();
  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const parsed = publishSchema.safeParse(payload);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return NextResponse.json({ error: `Revisa el campo ${issue?.path.join(".")}: ${issue?.message}` }, { status: 400 });
  }
  try {
    const result = await publishCampaign(parsed.data, started + 280_000);
    logInfo("meta.publish", { user: access.email, campaignId: result.campaignId, ads: result.adIds.length });
    await removeCreatives(parsed.data.ads.map((a) => a.media.path));
    await syncMetaCampaigns().catch((e) => logError("meta.publish.sync", e));
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    logError("meta.publish", error, { user: access.email, campaign: parsed.data.campaign.name });
    return NextResponse.json({ error: `Meta rechazó la publicación. ${metaErrorMessage(error)}` }, { status: 502 });
  }
}
