"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { findUserByEmail, generatePassword, listAgents } from "@/lib/access-admin";
import { myAccess, type Access } from "@/lib/auth";
import { logError, logInfo } from "@/lib/log";
import { supabaseAdmin } from "@/lib/supabase/admin";

export type ActionState = { ok?: string; error?: string; password?: string };

// Cada acción vuelve a comprobar que quien llama es administrador: una Server Action es un endpoint
// público aunque el botón solo se muestre en /accesos.
async function requireAdmin(): Promise<Access> {
  const access = await myAccess();
  if (!access?.isAdmin) throw new Error("solo administradores");
  return access;
}

const LEVEL_ALL = "all";

/** "all" = ve todo; si no, debe ser un agente de GHL existente. */
async function parseLevel(raw: FormDataEntryValue | null): Promise<string | null> {
  const level = String(raw ?? LEVEL_ALL);
  if (level === LEVEL_ALL) return null;
  const agents = await listAgents();
  if (!agents.some((a) => a.id === level)) throw new Error("agente no válido");
  return level;
}

const checked = (raw: FormDataEntryValue | null) => raw === "on";

function fail(scope: string, error: unknown, message: string): ActionState {
  logError(scope, error);
  return { error: error instanceof Error && error.message === "solo administradores" ? "Solo un administrador puede hacer esto." : message };
}

const addSchema = z.object({
  email: z.email().transform((e) => e.trim().toLowerCase()),
  password: z.union([z.literal(""), z.string().min(8, "La contraseña debe tener al menos 8 caracteres.")]),
});

/** Da acceso a un email. Si no tiene cuenta, la crea (con la contraseña escrita o una generada). */
export async function addMember(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const admin = await requireAdmin();
    const parsed = addSchema.safeParse({ email: form.get("email"), password: form.get("password") ?? "" });
    if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos no válidos." };
    const { email } = parsed.data;
    const agentId = await parseLevel(form.get("level"));

    let user = await findUserByEmail(email);
    let password: string | undefined;
    if (!user) {
      password = parsed.data.password || generatePassword();
      const { data, error } = await supabaseAdmin().auth.admin.createUser({ email, password, email_confirm: true });
      if (error || !data.user) throw error ?? new Error("createUser sin usuario");
      user = data.user;
    } else if (parsed.data.password) {
      const { error } = await supabaseAdmin().auth.admin.updateUserById(user.id, { password: parsed.data.password });
      if (error) throw error;
      password = parsed.data.password;
    }

    const { error } = await supabaseAdmin().from("team_members").upsert({
      user_id: user.id,
      email,
      agent_id: agentId,
      can_see_ads: !agentId && checked(form.get("ads")),
      is_admin: checked(form.get("admin")),
    }, { onConflict: "user_id" });
    if (error) throw error;

    logInfo("accesos.add", { by: admin.email, email, agentId, created: !!password });
    revalidatePath("/accesos");
    return { ok: `${email} ya tiene acceso.`, password };
  } catch (error) {
    return fail("accesos.add", error, "No se pudo dar el acceso. Revisa los logs de Vercel (accesos.add).");
  }
}

const userIdSchema = z.uuid();

/** Cambia el nivel, el acceso a anuncios y el rol de administrador de un miembro. */
export async function updateMember(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const admin = await requireAdmin();
    const userId = userIdSchema.parse(form.get("userId"));
    const agentId = await parseLevel(form.get("level"));
    const isAdmin = checked(form.get("admin"));
    if (userId === admin.userId && !isAdmin) return { error: "No puedes quitarte a ti mismo el rol de administrador." };

    const { error } = await supabaseAdmin().from("team_members")
      .update({ agent_id: agentId, can_see_ads: !agentId && checked(form.get("ads")), is_admin: isAdmin })
      .eq("user_id", userId);
    if (error) throw error;

    logInfo("accesos.update", { by: admin.email, userId, agentId, isAdmin });
    revalidatePath("/accesos");
    return { ok: "Guardado." };
  } catch (error) {
    return fail("accesos.update", error, "No se pudo guardar. Revisa los logs de Vercel (accesos.update).");
  }
}

/** Quita el acceso al dashboard (la cuenta de Supabase Auth se conserva). */
export async function removeMember(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const admin = await requireAdmin();
    const userId = userIdSchema.parse(form.get("userId"));
    if (userId === admin.userId) return { error: "No puedes quitarte el acceso a ti mismo." };

    const { error } = await supabaseAdmin().from("team_members").delete().eq("user_id", userId);
    if (error) throw error;

    logInfo("accesos.remove", { by: admin.email, userId });
    revalidatePath("/accesos");
    return { ok: "Acceso quitado." };
  } catch (error) {
    return fail("accesos.remove", error, "No se pudo quitar el acceso. Revisa los logs de Vercel (accesos.remove).");
  }
}

/** Pone una contraseña nueva generada y la devuelve una sola vez. */
export async function resetPassword(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const admin = await requireAdmin();
    const userId = userIdSchema.parse(form.get("userId"));
    const password = generatePassword();
    const { error } = await supabaseAdmin().auth.admin.updateUserById(userId, { password });
    if (error) throw error;

    logInfo("accesos.resetPassword", { by: admin.email, userId });
    return { ok: "Contraseña nueva:", password };
  } catch (error) {
    return fail("accesos.resetPassword", error, "No se pudo cambiar la contraseña. Revisa los logs de Vercel (accesos.resetPassword).");
  }
}
