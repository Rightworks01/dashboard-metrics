import { NextResponse } from "next/server";
import { myAccess } from "@/lib/auth";
import { logError, logInfo } from "@/lib/log";
import { createLeadForm, leadFormSchema, metaErrorMessage } from "@/lib/meta/publish";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Crea un formulario instantáneo en la página (solo admins). */
export async function POST(req: Request) {
  const access = await myAccess().catch(() => null);
  if (!access?.isAdmin) return NextResponse.json({ error: "no autorizado" }, { status: 401 });
  const parsed = leadFormSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return NextResponse.json({ error: `Revisa el campo ${issue?.path.join(".")}: ${issue?.message}` }, { status: 400 });
  }
  try {
    const form = await createLeadForm(parsed.data);
    logInfo("meta.leadform", { user: access.email, formId: form.id, pageId: parsed.data.pageId });
    return NextResponse.json({ ok: true, form });
  } catch (error) {
    logError("meta.leadform", error, { user: access.email, pageId: parsed.data.pageId });
    return NextResponse.json({ error: `Meta rechazó el formulario. ${metaErrorMessage(error)}` }, { status: 502 });
  }
}
