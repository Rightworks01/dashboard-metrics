import { logError } from "@/lib/log";
import { ensureContacts, hasContactsWithoutGeo, markGeoSynced, saveStateDiagnostics, searchContactsUpdatedSince, upsertContacts } from "./contacts";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { syncAppointments } from "./appointments";
import { listConversationsPage, listConversationsSince, syncConversation } from "./conversations";
import { syncUsers } from "./users";
import { listOpportunities, upsertOpportunities } from "./opportunities";

/**
 * Reconciliación: corrige lo que los webhooks no trajeron (caídas, reintentos agotados).
 * Contactos y conversaciones: ventana de `hours`. Oportunidades: todas (el volumen es bajo).
 */
const BACKFILL_DAYS = 90;
// Conversaciones en paralelo durante la carga histórica (GHL permite ~100 peticiones / 10 s)
const BACKFILL_CONCURRENCY = 4;
// reconcile-ghl tiene maxDuration 300 s: la carga histórica para con margen y sigue en la próxima corrida
const TIME_BUDGET_MS = 230_000;

async function getState(key: string): Promise<string | null> {
  const { data, error } = await supabaseAdmin().from("sync_state").select("value").eq("key", key).maybeSingle<{ value: string | null }>();
  if (error) throw new Error(`sync_state ${key}: ${error.message}`);
  return data?.value ?? null;
}

async function setState(key: string, value: string): Promise<void> {
  const { error } = await supabaseAdmin().from("sync_state").upsert({ key, value, updated_at: new Date().toISOString() });
  if (error) throw new Error(`sync_state ${key}: ${error.message}`);
}

/**
 * Carga histórica de conversaciones (últimos BACKFILL_DAYS días) por lotes: avanza desde la más
 * reciente hacia atrás guardando un cursor en sync_state. Cada corrida de reconcile sigue donde quedó.
 */
async function backfillConversations(deadline: number): Promise<{ done: boolean; processed: number }> {
  if ((await getState("conv_backfill_done")) === "1") return { done: true, processed: 0 };
  const floor = Date.now() - BACKFILL_DAYS * 86_400_000;
  let cursor = Number(await getState("conv_backfill_cursor")) || undefined;
  let processed = 0;

  while (Date.now() < deadline) {
    const page = await listConversationsPage(cursor);
    const inRange = page.filter((c) => (c.lastMessageDate ?? 0) >= floor);
    const contactIds = await ensureContacts(inRange.map((c) => c.contactId));
    // Lotes de BACKFILL_CONCURRENCY en paralelo; el cursor avanza al terminar cada lote completo
    for (let i = 0; i < inRange.length && Date.now() < deadline; i += BACKFILL_CONCURRENCY) {
      const batch = inRange.slice(i, i + BACKFILL_CONCURRENCY);
      await Promise.all(batch.map(async (conversation) => {
        const contactUuid = contactIds.get(conversation.contactId);
        try {
          if (contactUuid) await syncConversation(conversation, contactUuid);
        } catch (error) {
          logError("ghl.backfill.conversation", error, { conversationId: conversation.id });
        }
      }));
      cursor = batch.at(-1)?.lastMessageDate ?? cursor;
      processed += batch.length;
    }
    if (cursor) await setState("conv_backfill_cursor", String(cursor));
    const finished = page.length < 100 || inRange.length < page.length;
    if (finished && Date.now() < deadline) {
      await setState("conv_backfill_done", "1");
      return { done: true, processed };
    }
  }
  return { done: false, processed };
}

export async function reconcileGhl(hours: number) {
  const deadline = Date.now() + TIME_BUDGET_MS;
  const sinceMs = Date.now() - hours * 3_600_000;

  // Barrido completo de contactos: en la primera corrida de una instalación nueva (la base está vacía,
  // así que no hay "pendientes") y cuando hay contactos que aún no pasaron por la sync de estado.
  // Después vuelve a la ventana normal.
  const initialSweep = (await getState("contacts_initial_sweep_done")) !== "1";
  const fullSweep = initialSweep || (await hasContactsWithoutGeo());
  const contacts = await searchContactsUpdatedSince(fullSweep ? null : new Date(sinceMs).toISOString());
  await upsertContacts(contacts);
  if (fullSweep) await markGeoSynced();
  if (initialSweep) await setState("contacts_initial_sweep_done", "1");
  await saveStateDiagnostics();

  const opportunities = await upsertOpportunities(await listOpportunities());

  const conversations = await listConversationsSince(sinceMs);
  const contactIds = await ensureContacts(conversations.map((c) => c.contactId));
  let messages = 0;
  let failedConversations = 0;
  for (const conversation of conversations) {
    const contactUuid = contactIds.get(conversation.contactId);
    if (!contactUuid) {
      failedConversations++;
      continue;
    }
    try {
      messages += await syncConversation(conversation, contactUuid);
    } catch (error) {
      failedConversations++;
      logError("ghl.reconcile.conversation", error, { conversationId: conversation.id });
    }
  }

  // Agentes y citas: si fallan (p. ej. falta un scope) no deben tumbar el resto
  let users = 0;
  let appointments = 0;
  try {
    users = await syncUsers();
  } catch (error) {
    logError("ghl.reconcile.users", error);
  }
  try {
    appointments = await syncAppointments(BACKFILL_DAYS);
  } catch (error) {
    logError("ghl.reconcile.appointments", error);
  }

  const backfill = await backfillConversations(deadline);

  return {
    contacts: contacts.length,
    users,
    appointments,
    backfill,
    fullSweep,
    opportunities,
    conversations: conversations.length,
    messages,
    failedConversations,
  };
}
