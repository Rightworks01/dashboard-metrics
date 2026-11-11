import { ensureConversation, normalizeChannel, recordMessages, type NormalizedMessage } from "@/lib/conversations";
import { ghlGet, ghlLocationId } from "./client";
import type { GhlConversation, GhlMessage } from "./types";

const PAGE_LIMIT = 100;
const MAX_PAGES = 50;

// Orígenes de GHL que son automatizaciones (no un agente escribiendo)
const AUTOMATED_SOURCES = new Set(["workflow", "bulk_actions", "campaign"]);

const num = (v: unknown): number | null => {
  const n = typeof v === "string" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) ? Math.round(n) : null;
};

// Adaptador GHL → formato agnóstico de lib/conversations.
function toNormalized(m: GhlMessage): NormalizedMessage | null {
  if (m.direction !== "inbound" && m.direction !== "outbound") return null;
  if (m.messageType?.startsWith("TYPE_ACTIVITY")) return null; // eventos internos, no mensajes
  const kind = normalizeChannel(m.messageType);
  const isCall = kind === "call";
  // Los workflows pueden enviar "como" el agente asignado (con userId): manda el origen.
  const automated =
    m.direction === "outbound" && (AUTOMATED_SOURCES.has(m.source ?? "") || !m.userId);
  const call = isCall && m.meta && typeof m.meta.call === "object" && m.meta.call !== null
    ? (m.meta.call as Record<string, unknown>)
    : null;
  return {
    id_external: m.id,
    direction: m.direction,
    source_channel: "ghl",
    body: m.body ?? null,
    sent_at: new Date(m.dateAdded).toISOString(),
    template_id: null,
    kind,
    sender_user_id: m.direction === "outbound" ? (m.userId ?? null) : null,
    automated,
    origin: m.source ?? null,
    call_status: isCall ? (typeof call?.status === "string" ? call.status : (m.status ?? null)) : null,
    call_duration_s: isCall ? num(call?.duration) : null,
    meta: isCall ? (m.meta ?? null) : null,
  };
}

async function fetchMessages(conversationId: string): Promise<GhlMessage[]> {
  const messages: GhlMessage[] = [];
  let lastMessageId: string | undefined;
  for (let page = 0; page < MAX_PAGES; page++) {
    const res = await ghlGet<{ messages: { messages: GhlMessage[]; lastMessageId?: string; nextPage?: boolean } }>(
      `/conversations/${conversationId}/messages`,
      { limit: PAGE_LIMIT, lastMessageId },
    );
    messages.push(...res.messages.messages);
    if (!res.messages.nextPage || !res.messages.lastMessageId) break;
    lastMessageId = res.messages.lastMessageId;
  }
  return messages;
}

/** Conversaciones con mensajes posteriores a `sinceMs`, de la más reciente a la más antigua. */
export async function listConversationsSince(sinceMs: number): Promise<GhlConversation[]> {
  const conversations: GhlConversation[] = [];
  let startAfterDate: number | undefined;
  for (let page = 0; page < MAX_PAGES; page++) {
    const res = await ghlGet<{ conversations: GhlConversation[] }>("/conversations/search", {
      locationId: ghlLocationId(),
      limit: PAGE_LIMIT,
      sortBy: "last_message_date",
      sort: "desc",
      startAfterDate,
    });
    const recent = res.conversations.filter((c) => (c.lastMessageDate ?? 0) >= sinceMs);
    conversations.push(...recent);
    const last = res.conversations.at(-1);
    if (res.conversations.length < PAGE_LIMIT || recent.length < res.conversations.length || !last?.lastMessageDate) {
      break;
    }
    startAfterDate = last.lastMessageDate;
  }
  return conversations;
}

/** Una página de conversaciones (100), de la más reciente a la más antigua, antes de `beforeMs`. */
export async function listConversationsPage(beforeMs: number | undefined): Promise<GhlConversation[]> {
  const res = await ghlGet<{ conversations: GhlConversation[] }>("/conversations/search", {
    locationId: ghlLocationId(),
    limit: PAGE_LIMIT,
    sortBy: "last_message_date",
    sort: "desc",
    startAfterDate: beforeMs,
  });
  return res.conversations;
}

export async function listConversationsForContact(contactId: string): Promise<GhlConversation[]> {
  const res = await ghlGet<{ conversations: GhlConversation[] }>("/conversations/search", {
    locationId: ghlLocationId(),
    contactId,
  });
  return res.conversations;
}

/** Re-sincroniza todos los mensajes de una conversación. Idempotente. */
export async function syncConversation(conversation: GhlConversation, contactUuid: string): Promise<number> {
  const messages = (await fetchMessages(conversation.id))
    .map(toNormalized)
    .filter((m): m is NormalizedMessage => m !== null);

  const conversationId = await ensureConversation({
    externalId: conversation.id,
    contactId: contactUuid,
    channel: normalizeChannel(conversation.lastMessageType),
    createdAt: new Date(conversation.dateAdded ?? Date.now()).toISOString(),
  });
  await recordMessages(conversationId, messages);
  return messages.length;
}
