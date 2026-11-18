import { puede } from "@cuentas/roles";
import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { myAccess } from "@cuentas/auth";
import { logError } from "@base/conexiones/log";
import { CREATIVES_BUCKET } from "@base/conexiones/meta/publish";
import { supabaseAdmin } from "@base/conexiones/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const body = z.object({
  name: z.string().min(1).max(200),
  type: z.enum(["image/jpeg", "image/png", "video/mp4", "video/quicktime"]),
});

/** URL firmada para que el navegador suba un creativo directo a Supabase Storage (Vercel no acepta archivos grandes). */
export async function POST(req: Request) {
  const access = await myAccess().catch(() => null);
  if (!puede(access, "publicar")) return NextResponse.json({ error: "no autorizado" }, { status: 401 });
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Solo JPG, PNG, MP4 o MOV." }, { status: 400 });
  const safe = parsed.data.name.normalize("NFD").replace(/[^\w.-]+/g, "_").slice(-80);
  const path = `${randomUUID()}/${safe}`;
  const { data, error } = await supabaseAdmin().storage.from(CREATIVES_BUCKET).createSignedUploadUrl(path);
  if (error || !data) {
    logError("meta.publish.upload", error);
    return NextResponse.json({ error: "No se pudo preparar la subida." }, { status: 500 });
  }
  return NextResponse.json({ path: data.path, token: data.token });
}
