"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { logError } from "@/lib/log";
import { supabaseServer } from "@/lib/supabase/server";

const credentials = z.object({
  email: z.email(),
  password: z.string().min(1),
});

export async function signIn(formData: FormData): Promise<void> {
  const parsed = credentials.safeParse({ email: formData.get("email"), password: formData.get("password") });
  if (!parsed.success) redirect("/login?error=invalid");

  const supabase = await supabaseServer();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) {
    logError("auth.signIn", error, { email: parsed.data.email });
    redirect("/login?error=credentials");
  }
  redirect("/");
}

export async function signOut(): Promise<void> {
  const supabase = await supabaseServer();
  const { error } = await supabase.auth.signOut();
  if (error) logError("auth.signOut", error);
  redirect("/login");
}
