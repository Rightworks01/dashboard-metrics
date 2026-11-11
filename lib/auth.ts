import "server-only";
import { cache } from "react";
import { logError } from "@/lib/log";
import { supabaseServer } from "@/lib/supabase/server";

/**
 * Permisos de quien mira, de su fila en `team_members` (la política own_row solo le deja leer la suya).
 * null = sin sesión o no es del equipo. Se administran en /accesos.
 *   agentId    = ID de usuario de GHL: solo ve los leads de ese agente (la RLS ya lo aplica en la base)
 *   canSeeAds  = Campañas y Anuncios (nunca para quien está limitado a un agente)
 *   isAdmin    = gestiona los accesos de los demás
 */
export type Access = { userId: string; email: string; agentId: string | null; isAdmin: boolean; canSeeAds: boolean };

export const myAccess = cache(async (): Promise<Access | null> => {
  const supabase = await supabaseServer();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return null;
  const { data, error } = await supabase
    .from("team_members")
    .select("agent_id, is_admin, can_see_ads")
    .eq("user_id", auth.user.id)
    .maybeSingle();
  if (error) {
    logError("auth.myAccess", error);
    throw error; // ante la duda no se muestra nada: la página cae en su ErrorNote
  }
  if (!data) return null;
  const row = data as { agent_id: string | null; is_admin: boolean; can_see_ads: boolean };
  const agentId = row.agent_id || null;
  return {
    userId: auth.user.id,
    email: auth.user.email ?? "",
    agentId,
    isAdmin: row.is_admin,
    canSeeAds: row.can_see_ads && !agentId,
  };
});

/** Agente de GHL al que está limitado quien mira, o null si ve todo. */
export async function agentScope(): Promise<string | null> {
  return (await myAccess())?.agentId ?? null;
}

/** Ve Campañas y Anuncios (y sus API). */
export async function canSeeAds(): Promise<boolean> {
  return (await myAccess())?.canSeeAds ?? false;
}

function emailList(value: string | undefined): string[] {
  return (value ?? "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
}

/**
 * Puede pausar/activar campañas: ve Campañas y, si META_CONTROL_EMAILS (opcional) tiene valor, está en
 * esa lista.
 */
export async function canControlCampaigns(): Promise<boolean> {
  const access = await myAccess();
  if (!access?.canSeeAds) return false;
  const allowed = emailList(process.env.META_CONTROL_EMAILS);
  return allowed.length === 0 || allowed.includes(access.email.toLowerCase());
}

/**
 * Usuario con sesión, del equipo y que puede controlar campañas, o null. Las rutas /api quedan fuera
 * de proxy.ts, así que cada ruta que actúe en nombre del usuario debe llamar a esto.
 */
export async function campaignControlUser(): Promise<{ id: string; email: string } | null> {
  try {
    const access = await myAccess();
    if (!access || !(await canControlCampaigns())) return null;
    return { id: access.userId, email: access.email };
  } catch (error) {
    logError("auth.campaignControlUser", error);
    return null;
  }
}
