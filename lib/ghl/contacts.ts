import { supabaseAdmin, upsertRows, type Row } from "@/lib/supabase/admin";
import { validTimeZone } from "@/lib/format";
import { logError, logInfo } from "@/lib/log";
import { ghlGet, ghlLocationId, ghlPost } from "./client";
import type { GhlContact, GhlCustomField } from "./types";

const PAGE_LIMIT = 100;
const MAX_PAGES = 100;

export async function fetchContact(id: string): Promise<GhlContact> {
  const res = await ghlGet<{ contact: GhlContact }>(`/contacts/${id}`);
  return res.contact;
}

/** Contactos actualizados desde `sinceIso`; con `null`, todos los de la subcuenta. */
export async function searchContactsUpdatedSince(sinceIso: string | null): Promise<GhlContact[]> {
  const contacts: GhlContact[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const res = await ghlPost<{ contacts: GhlContact[] }>("/contacts/search", {
      locationId: ghlLocationId(),
      page,
      pageLimit: PAGE_LIMIT,
      filters: sinceIso ? [{ field: "dateUpdated", operator: "range", value: { gte: sinceIso } }] : [],
      sort: [{ field: "dateUpdated", direction: "desc" }],
    });
    contacts.push(...res.contacts);
    if (res.contacts.length < PAGE_LIMIT) break;
  }
  return contacts;
}

/**
 * IDs de Meta del primer toque. VERIFICAR con un contacto real: depende de cómo llegue el
 * lead (formulario instantáneo, click-to-WhatsApp, landing con UTMs). El fallback a
 * utmContent solo vale si los anuncios usan utm_content={{ad.id}}.
 */
function metaAttribution(contact: GhlContact): Row {
  const source = contact.attributionSource ?? {};
  const str = (key: string): string | null => {
    const value = source[key];
    return typeof value === "string" && value !== "" ? value : null;
  };
  return {
    meta_ad_id: str("adId") ?? str("utmContent"),
    meta_campaign_id: str("campaignId") ?? str("utmCampaignId"),
    meta_adset_id: str("adSetId") ?? str("adGroupId"),
  };
}

// Custom fields de estado. Right Works lo guarda en {{contact.estado}}; "states" y "state" quedan como
// respaldo. GHL manda los custom fields como [{ id, value }]: los IDs salen de
// GHL_STATE_CUSTOM_FIELD_ID (uno o varios, separados por coma) o se buscan por nombre
// (requiere el scope locations/customFields.readonly en el Private Integration Token).
const STATE_FIELD_NAMES = ["estado", "states", "state"]; // orden = prioridad

let stateFieldIds: Promise<string[]> | null = null;

export function resolveStateFieldIds(): Promise<string[]> {
  const fromEnv = process.env.GHL_STATE_CUSTOM_FIELD_ID;
  if (fromEnv) return Promise.resolve(fromEnv.split(",").map((s) => s.trim()).filter(Boolean));
  stateFieldIds ??= ghlGet<{ customFields: GhlCustomField[] }>(`/locations/${ghlLocationId()}/customFields`, { model: "contact" })
    .then(async (res) => {
      // Diagnóstico: catálogo de custom fields de contacto (solo id/nombre/clave, sin valores)
      await saveDiag("ghl_contact_custom_fields", res.customFields.map((f) => ({ id: f.id, name: f.name, key: f.fieldKey })));
      // Coincide por nombre visible o por clave ({{contact.estado}}), la primera que esté en la lista
      const key = (f: GhlCustomField) =>
        [f.name?.trim().toLowerCase(), f.fieldKey?.trim().toLowerCase().replace(/^contact\./, "")]
          .find((k): k is string => !!k && STATE_FIELD_NAMES.includes(k)) ?? "";
      const fields = res.customFields
        .filter((f) => key(f) !== "")
        .sort((a, b) => STATE_FIELD_NAMES.indexOf(key(a)) - STATE_FIELD_NAMES.indexOf(key(b)));
      if (fields.length === 0) logError("ghl.stateField", "no hay custom fields 'Estado' ni 'States'");
      else logInfo("ghl.stateField", { fields: fields.map((f) => ({ id: f.id, name: f.name })) });
      return fields.map((f) => f.id);
    })
    .catch((error: unknown) => {
      logError("ghl.stateField", error);
      stateFieldIds = null; // reintentar en la próxima invocación
      return [];
    });
  return stateFieldIds;
}

async function saveDiag(key: string, value: unknown): Promise<void> {
  const { error } = await supabaseAdmin()
    .from("sync_state")
    .upsert({ key, value: JSON.stringify(value), updated_at: new Date().toISOString() });
  if (error) logError("ghl.diag", error, { key });
}

// Diagnóstico: en los contactos que quedan sin estado, qué custom fields sí traen valor (solo IDs)
const unresolvedFieldTally = new Map<string, number>();

export async function saveStateDiagnostics(): Promise<void> {
  if (unresolvedFieldTally.size === 0) return;
  const top = [...unresolvedFieldTally.entries()].sort((a, b) => b[1] - a[1]).slice(0, 40);
  await saveDiag("diag_unresolved_state_fields", Object.fromEntries(top));
}

const fieldText = (raw: unknown): string | null => {
  const v = Array.isArray(raw) ? raw[0] : raw;
  return typeof v === "string" && v.trim() !== "" ? v.trim() : null;
};

/** Estado del contacto: el primer custom field de estado con valor ("Estado", "States"…); si no, el estándar `state`. */
function contactState(contact: GhlContact, fieldIds: string[]): string | null {
  for (const id of fieldIds) {
    const value = fieldText(contact.customFields?.find((f) => f.id === id)?.value);
    if (value) return value;
  }
  const standard = contact.state?.trim() || null;
  if (!standard) {
    for (const f of contact.customFields ?? []) {
      if (fieldText(f.value)) unresolvedFieldTally.set(f.id, (unresolvedFieldTally.get(f.id) ?? 0) + 1);
    }
  }
  return standard;
}

function contactName(c: GhlContact): string | null {
  const full = c.contactName?.trim() || [c.firstName, c.lastName].filter(Boolean).join(" ").trim();
  return full || null;
}

type ContactRef = { id: string; id_ghl: string; meta_ad_id: string | null };

async function selectContacts(ghlIds: string[]): Promise<ContactRef[]> {
  const out: ContactRef[] = [];
  // lotes pequeños: `.in()` va en la URL
  for (let i = 0; i < ghlIds.length; i += 150) {
    const { data, error } = await supabaseAdmin()
      .from("contacts")
      .select("id, id_ghl, meta_ad_id")
      .in("id_ghl", ghlIds.slice(i, i + 150))
      .returns<ContactRef[]>();
    if (error) throw new Error(`select contacts: ${error.message}`);
    out.push(...(data ?? []));
  }
  return out;
}

/** Upsert de contactos. Devuelve id_ghl → uuid. */
export async function upsertContacts(contacts: GhlContact[]): Promise<Map<string, string>> {
  if (contacts.length === 0) return new Map();

  // Atribución first-touch: si ya hay meta_ad_id guardado, no se vuelve a escribir.
  const existing = await selectContacts(contacts.map((c) => c.id));
  const attributed = new Set(existing.filter((c) => c.meta_ad_id).map((c) => c.id_ghl));
  const syncedAt = new Date().toISOString();
  const stateFields = await resolveStateFieldIds();

  const keepAttribution: Row[] = [];
  const withAttribution: Row[] = [];
  for (const c of contacts) {
    const base: Row = {
      id_ghl: c.id,
      created_at: c.dateAdded ?? syncedAt,
      assigned_to: c.assignedTo ?? null,
      name: contactName(c),
      tags: c.tags ?? [],
      status: c.type ?? null,
      state: contactState(c, stateFields),
      // Sin el ID del campo "Estado" (falta scope) no se marca: el próximo reconcile vuelve a barrer
      geo_synced_at: stateFields.length ? syncedAt : null,
      country: c.country?.trim() || null,
      timezone: validTimeZone(c.timezone),
      phone: c.phone?.trim() || null,
      synced_at: syncedAt,
    };
    if (attributed.has(c.id)) keepAttribution.push(base);
    else withAttribution.push({ ...base, ...metaAttribution(c) });
  }
  // Dos llamadas separadas para que cada lote tenga las mismas columnas (ver upsertRows)
  await upsertRows("contacts", keepAttribution, "id_ghl");
  await upsertRows("contacts", withAttribution, "id_ghl");

  const saved = await selectContacts(contacts.map((c) => c.id));
  return new Map(saved.map((c) => [c.id_ghl, c.id]));
}

/**
 * Teléfono de un contacto ya guardado sin él: lo pide a GHL y lo guarda. null si GHL no tiene.
 * Solo para el panel del lead (el llamador ya comprobó con la RLS que el usuario puede ver al contacto).
 */
export async function fetchAndStorePhone(contactUuid: string, ghlId: string): Promise<string | null> {
  const phone = (await fetchContact(ghlId)).phone?.trim() || null;
  if (phone) {
    const { error } = await supabaseAdmin().from("contacts").update({ phone }).eq("id", contactUuid);
    if (error) logError("ghl.fetchAndStorePhone", error, { contactUuid });
  }
  return phone;
}

/** Devuelve id_ghl → uuid; trae de GHL los contactos que aún no estén en la DB. */
export async function ensureContacts(ghlIds: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(ghlIds)];
  const map = new Map((await selectContacts(unique)).map((c) => [c.id_ghl, c.id]));

  const missing = unique.filter((id) => !map.has(id));
  const fetched: GhlContact[] = [];
  for (const id of missing) {
    try {
      fetched.push(await fetchContact(id));
    } catch (error) {
      logError("ghl.ensureContacts", error, { contactId: id });
    }
  }
  for (const [ghlId, uuid] of await upsertContacts(fetched)) map.set(ghlId, uuid);
  return map;
}

/** true si hay contactos que aún no pasaron por la sincronización de estado. */
export async function hasContactsWithoutGeo(): Promise<boolean> {
  const { count, error } = await supabaseAdmin()
    .from("contacts")
    .select("id", { count: "exact", head: true })
    .is("geo_synced_at", null);
  if (error) throw new Error(`count contacts sin geo: ${error.message}`);
  return (count ?? 0) > 0;
}

/** Tras un barrido completo: los que no volvieron de GHL (borrados) no deben forzar otro barrido. */
export async function markGeoSynced(): Promise<void> {
  if ((await resolveStateFieldIds()).length === 0) return;
  const { error } = await supabaseAdmin()
    .from("contacts")
    .update({ geo_synced_at: new Date().toISOString() })
    .is("geo_synced_at", null);
  if (error) throw new Error(`marcar geo_synced_at: ${error.message}`);
}
