"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { logError } from "@base/conexiones/log";
import { supabaseServer } from "@base/conexiones/supabase/server";
import { embedCheck } from "@cuentas/embed/context";

const credentials = z.object({ email: z.email(), password: z.string().min(1), location: z.string().max(64) });

/** Login dentro del iframe de GHL: deja la sesión en la cookie particionada de /embed. */
export async function signInEmbed(formData: FormData): Promise<void> {
  const parsed = credentials.safeParse({
    email: formData.get("email"), password: formData.get("password"), location: formData.get("location") ?? "",
  });
  const loc = encodeURIComponent(String(formData.get("location") ?? ""));
  if (!parsed.success) redirect(`/embed/login?location=${loc}&error=invalid`);
  const check = await embedCheck(parsed.data.location);
  if (!check.ok) redirect(`/embed/login?location=${loc}`);

  const supabase = await supabaseServer();
  const { error } = await supabase.auth.signInWithPassword({ email: parsed.data.email, password: parsed.data.password });
  if (error) {
    logError("embed.signIn", error, { email: parsed.data.email });
    redirect(`/embed/login?location=${loc}&error=credentials`);
  }
  redirect(`/embed/publicar?location=${loc}`);
}
