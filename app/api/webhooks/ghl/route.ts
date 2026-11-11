import { NextResponse } from "next/server";
import { safeEqual } from "@/lib/cron-auth";
import { ghlLocationId } from "@/lib/ghl/client";
import { ghlWebhookSchema, handleGhlEvent } from "@/lib/ghl/webhook";
import { logError, logInfo } from "@/lib/log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// El secreto va en el header `x-webhook-secret` (Workflows) o en `?token=` (apps de Marketplace,
// que no permiten headers propios).
function isAuthorized(req: Request): boolean {
  const secret = process.env.GHL_WEBHOOK_SECRET;
  if (!secret) return false;
  const provided = req.headers.get("x-webhook-secret") ?? new URL(req.url).searchParams.get("token");
  return !!provided && safeEqual(provided, secret);
}

export async function POST(req: Request) {
  if (!isAuthorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const parsed = ghlWebhookSchema.safeParse(payload);
  if (!parsed.success) {
    logError("webhook.ghl.validation", parsed.error, { issues: parsed.error.issues });
    return NextResponse.json({ error: "payload inválido" }, { status: 400 });
  }
  const event = parsed.data;

  if (event.locationId && event.locationId !== ghlLocationId()) {
    return NextResponse.json({ error: "locationId desconocido" }, { status: 403 });
  }

  try {
    const result = await handleGhlEvent(event);
    logInfo("webhook.ghl", { type: event.type, id: event.id ?? event.contactId, ...result });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    // 500 para que GHL reintente; la reconciliación diaria cubre si se agotan los reintentos
    logError("webhook.ghl", error, { type: event.type, id: event.id ?? event.contactId });
    return NextResponse.json({ error: "error procesando el evento" }, { status: 500 });
  }
}
