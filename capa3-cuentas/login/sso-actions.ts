"use server";

import { randomBytes } from "node:crypto";
import { redirect } from "next/navigation";
import { decryptGhlSso } from "@base/conexiones/ghl/sso";
import { logError, logInfo } from "@base/conexiones/log";
import { supabaseAdmin } from "@base/conexiones/supabase/admin";
import { supabaseServer } from "@base/conexiones/supabase/server";
import { findUserByEmail } from "@cuentas/access-admin";

/**
 * Entrada automática con el usuario de GHL (app privada de Marketplace). Regla, aplicada en CADA entrada:
 *   Admin en GHL → Administrador del dashboard.
 *   User en GHL  → Agente: solo sus leads asignados (agent_id = su ID de GHL); sin Campañas, Anuncios, Publicar,
 *                  inversión ni pausar/activar.
 * Excepción: a quien un admin nombró Administrador a mano en Accesos nunca se le quita el admin por su rol de GHL. El
 * admin que vino de GHL (admin_from_ghl) sí se recalcula: si en GHL pasa a User, entra como Agente. Solo usuarios con la subcuenta de Right Works activa (GHL_LOCATION_ID). La primera vez se crea su cuenta.
 */
export async function ssoSignIn(payload: string): Promise<{ error: string }> {
  const ssoKey = process.env.GHL_SSO_KEY;
  if (!ssoKey) return { error: "La entrada automática con GHL no está configurada." };
  let ghlUser;
  try {
    ghlUser = decryptGhlSso(payload, ssoKey);
  } catch (error) {
    logError("auth.sso.decrypt", error);
    return { error: "No se pudo validar tu usuario de GHL." };
  }
  if (ghlUser.activeLocation !== process.env.GHL_LOCATION_ID) {
    logInfo("auth.sso.wrong_location", { userId: ghlUser.userId, location: ghlUser.activeLocation ?? null });
    return { error: "Entra desde la subcuenta de Right Works en GHL." };
  }

  const email = ghlUser.email.toLowerCase();
  const isAdmin = ghlUser.role === "admin";
  try {
    const db = supabaseAdmin();
    let user = await findUserByEmail(email);
    if (!user) {
      // Contraseña aleatoria que nadie conoce: entra por GHL (o un admin le pone una en Accesos)
      const { data, error } = await db.auth.admin.createUser({ email, password: randomBytes(24).toString("base64url"), email_confirm: true });
      if (error || !data.user) throw error ?? new Error("createUser sin usuario");
      user = data.user;
    }
    const { data: current } = await db.from("team_members").select("is_admin, admin_from_ghl").eq("user_id", user.id).maybeSingle();
    const manualAdmin = !!current?.is_admin && !current.admin_from_ghl;
    const admin = isAdmin || manualAdmin;
    const { error: memberError } = await db.from("team_members").upsert({
      user_id: user.id,
      email,
      is_admin: admin,
      admin_from_ghl: admin && !manualAdmin,
      can_see_ads: admin,
      agent_id: admin ? null : ghlUser.userId,
    }, { onConflict: "user_id" });
    if (memberError) throw memberError;

    // Su nombre para el dashboard: los usuarios de agencia no salen en /users/ de la subcuenta (crm_users)
    const name = ghlUser.userName?.trim();
    if (name) {
      const { error: nameError } = await db.from("crm_users").upsert({ id: ghlUser.userId, name, synced_at: new Date().toISOString() }, { onConflict: "id" });
      if (nameError) logError("auth.sso.user_name", nameError, { ghlUserId: ghlUser.userId });
    }

    // Sesión sin contraseña: enlace mágico generado en el servidor (no se envía email) y canjeado aquí mismo
    const { data: link, error: linkError } = await db.auth.admin.generateLink({ type: "magiclink", email });
    if (linkError || !link.properties?.hashed_token) throw linkError ?? new Error("generateLink sin token");
    const { error: otpError } = await (await supabaseServer()).auth.verifyOtp({ type: "magiclink", token_hash: link.properties.hashed_token });
    if (otpError) throw otpError;
    logInfo("auth.sso.ok", { email, ghlUserId: ghlUser.userId, role: ghlUser.role, type: ghlUser.type ?? null, admin, manualAdmin });
  } catch (error) {
    logError("auth.sso", error, { email, ghlUserId: ghlUser.userId });
    return { error: "No se pudo iniciar sesión con tu usuario de GHL. Entra con email y contraseña." };
  }
  redirect("/");
}

/** Diagnóstico: /sso se abrió dentro de un iframe pero GHL no mandó el usuario (no es la página de la app). */
export async function ssoNoAnswer(): Promise<void> {
  logInfo("auth.sso.no_answer", {});
}
