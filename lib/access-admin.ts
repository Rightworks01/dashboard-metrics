import "server-only";
import { randomBytes } from "node:crypto";
import type { User } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { supabaseServer } from "@/lib/supabase/server";

// Datos de la consola de accesos (/accesos). Usa la service role (cuentas de Supabase Auth y la
// tabla team_members de todos): solo se llama después de comprobar que quien pide es administrador.

export type Member = {
  userId: string;
  email: string;
  agentId: string | null;
  agentName: string | null;
  isAdmin: boolean;
  canSeeAds: boolean;
  lastSignIn: string | null;
};
export type Account = { userId: string; email: string; createdAt: string };
export type Agent = { id: string; name: string };

type MemberRow = { user_id: string; email: string | null; agent_id: string | null; is_admin: boolean; can_see_ads: boolean };

async function listAuthUsers(): Promise<User[]> {
  const users: User[] = [];
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await supabaseAdmin().auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(`auth.listUsers: ${error.message}`);
    users.push(...data.users);
    if (data.users.length < 200) break;
  }
  return users;
}

/** Agentes de GHL (para elegir a quién se limita un miembro), por nombre. */
export async function listAgents(): Promise<Agent[]> {
  const supabase = await supabaseServer();
  const { data, error } = await supabase.from("crm_users").select("id, name").order("name");
  if (error) throw new Error(`crm_users: ${error.message}`);
  return (data ?? []) as Agent[];
}

/** Miembros del equipo y cuentas de Auth que todavía no tienen acceso. */
export async function listAccess(agents: Agent[]): Promise<{ members: Member[]; withoutAccess: Account[] }> {
  const [users, rows] = await Promise.all([
    listAuthUsers(),
    supabaseAdmin().from("team_members").select("user_id, email, agent_id, is_admin, can_see_ads").order("added_at"),
  ]);
  if (rows.error) throw new Error(`team_members: ${rows.error.message}`);
  const byId = new Map(users.map((u) => [u.id, u]));
  const names = new Map(agents.map((a) => [a.id, a.name]));
  const memberRows = (rows.data ?? []) as MemberRow[];
  const memberIds = new Set(memberRows.map((r) => r.user_id));
  return {
    members: memberRows.map((r) => ({
      userId: r.user_id,
      email: byId.get(r.user_id)?.email ?? r.email ?? "(sin email)",
      agentId: r.agent_id,
      agentName: r.agent_id ? (names.get(r.agent_id) ?? `Agente ${r.agent_id}`) : null,
      isAdmin: r.is_admin,
      canSeeAds: r.can_see_ads && !r.agent_id,
      lastSignIn: byId.get(r.user_id)?.last_sign_in_at ?? null,
    })),
    withoutAccess: users
      .filter((u) => !memberIds.has(u.id))
      .map((u) => ({ userId: u.id, email: u.email ?? "(sin email)", createdAt: u.created_at })),
  };
}

export async function findUserByEmail(email: string): Promise<User | null> {
  const target = email.toLowerCase();
  return (await listAuthUsers()).find((u) => u.email?.toLowerCase() === target) ?? null;
}

/** Contraseña temporal legible (sin caracteres que se confundan al dictarla). */
export function generatePassword(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const bytes = randomBytes(14);
  return `Cb-${Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("")}`;
}
