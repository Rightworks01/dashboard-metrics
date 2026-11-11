import { upsertRows } from "@/lib/supabase/admin";
import { ghlGet, ghlLocationId } from "./client";
import type { GhlUser } from "./types";

/** Copia id + nombre de los usuarios (agentes) de la subcuenta a `crm_users`. */
export async function syncUsers(): Promise<number> {
  const res = await ghlGet<{ users: GhlUser[] }>("/users/", { locationId: ghlLocationId() });
  const syncedAt = new Date().toISOString();
  const rows = res.users
    .map((u) => ({ id: u.id, name: (u.name || [u.firstName, u.lastName].filter(Boolean).join(" ")).trim(), synced_at: syncedAt }))
    .filter((u) => u.name);
  await upsertRows("crm_users", rows, "id");
  return rows.length;
}
