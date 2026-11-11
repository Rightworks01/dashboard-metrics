import { supabaseAdmin, upsertRows } from "@/lib/supabase/admin";

// Capa agnóstica a la fuente: GHL hoy, WA Connector mañana. Nada de aquí sabe de GHL.

export type NormalizedMessage = {
  id_external: string;
  direction: "inbound" | "outbound";
  source_channel: string; // 'ghl' | 'wa_connector' ...
  body: string | null;
  sent_at: string; // ISO UTC
  template_id: string | null;
  kind: string; // sms | call | email | whatsapp ... (por mensaje, no por conversación)
  sender_user_id: string | null; // agente que lo envió; null = lead o automatización
  automated: boolean; // enviado por workflow / campaña / envío masivo
  origin: string | null; // origen crudo en la fuente
  call_status: string | null;
  call_duration_s: number | null;
  meta: Record<string, unknown> | null; // metadatos crudos (solo llamadas)
};

const CHANNEL_ALIASES: Record<string, string> = {
  facebook: "fb",
  fb: "fb",
  instagram: "ig",
  ig: "ig",
  whatsapp: "whatsapp",
  sms: "sms",
  email: "email",
  call: "call",
  live_chat: "live_chat",
  webchat: "live_chat",
};

// Acepta 'TYPE_WHATSAPP', 'WhatsApp', 'IG', etc.
export function normalizeChannel(raw: string | null | undefined): string {
  if (!raw) return "unknown";
  const key = raw.replace(/^TYPE_/i, "").toLowerCase();
  return CHANNEL_ALIASES[key] ?? key;
}

/**
 * Crea la conversación si no existe y devuelve su uuid. `externalId` es el ID en la fuente
 * (se guarda en la columna `id_ghl`). No toca conversaciones existentes.
 */
export async function ensureConversation(input: {
  externalId: string;
  contactId: string;
  channel: string;
  createdAt: string;
}): Promise<string> {
  const db = supabaseAdmin();
  const { error } = await db.from("conversations").upsert(
    {
      id_ghl: input.externalId,
      contact_id: input.contactId,
      channel: input.channel,
      created_at: input.createdAt,
    },
    { onConflict: "id_ghl", ignoreDuplicates: true },
  );
  if (error) throw new Error(`ensureConversation: ${error.message}`);

  const { data, error: selectError } = await db
    .from("conversations")
    .select("id")
    .eq("id_ghl", input.externalId)
    .single<{ id: string }>();
  if (selectError || !data) throw new Error(`ensureConversation select: ${selectError?.message}`);
  return data.id;
}

/** Guarda mensajes (idempotente) y recalcula first_message_at / responded en SQL. */
export async function recordMessages(conversationId: string, messages: NormalizedMessage[]): Promise<void> {
  if (messages.length === 0) return;
  const syncedAt = new Date().toISOString();
  await upsertRows(
    "messages",
    messages.map((m) => ({ ...m, conversation_id: conversationId, synced_at: syncedAt })),
    "source_channel,id_external",
  );

  const { error } = await supabaseAdmin().rpc("recompute_conversation_flags", {
    p_conversation_ids: [conversationId],
  });
  if (error) throw new Error(`recompute_conversation_flags: ${error.message}`);
}
