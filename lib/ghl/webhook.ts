import { z } from "zod";
import { fetchContact, upsertContacts, ensureContacts } from "./contacts";
import { listConversationsForContact, syncConversation } from "./conversations";
import { fetchOpportunity, upsertOpportunities } from "./opportunities";
import { syncAppointment } from "./appointments";
import type { GhlConversation } from "./types";

/**
 * El webhook solo necesita tipo + IDs: el detalle se vuelve a pedir a la API. Así sirve tanto
 * para webhooks de una app de Marketplace como para un "Custom Webhook" de un Workflow en el
 * que mandes, por ejemplo, {"type":"ContactCreate","id":"{{contact.id}}","locationId":"{{location.id}}"}.
 */
export const ghlWebhookSchema = z.looseObject({
  type: z.string().min(1),
  locationId: z.string().optional(),
  id: z.string().optional(),
  contactId: z.string().optional(),
  conversationId: z.string().optional(),
  messageType: z.string().optional(),
});

export type GhlWebhookEvent = z.infer<typeof ghlWebhookSchema>;

export type WebhookResult = { handled: boolean; detail?: string };

export async function handleGhlEvent(event: GhlWebhookEvent): Promise<WebhookResult> {
  if (event.type.startsWith("Contact") && event.type !== "ContactDelete") {
    const contactId = event.id ?? event.contactId;
    if (!contactId) return { handled: false, detail: "evento de contacto sin id" };
    await upsertContacts([await fetchContact(contactId)]);
    return { handled: true };
  }

  if (event.type.startsWith("Opportunity") && event.type !== "OpportunityDelete") {
    if (!event.id) return { handled: false, detail: "evento de oportunidad sin id" };
    await upsertOpportunities([await fetchOpportunity(event.id)]);
    return { handled: true };
  }

  if (event.type === "AppointmentCreate" || event.type === "AppointmentUpdate") {
    if (!event.id) return { handled: false, detail: "evento de cita sin id" };
    await syncAppointment(event.id);
    return { handled: true };
  }

  if (event.type === "InboundMessage" || event.type === "OutboundMessage") {
    if (!event.contactId) return { handled: false, detail: "mensaje sin contactId" };
    const contactUuid = (await ensureContacts([event.contactId])).get(event.contactId);
    if (!contactUuid) throw new Error(`no se pudo cargar el contacto ${event.contactId}`);

    const conversations: GhlConversation[] = event.conversationId
      ? [{ id: event.conversationId, contactId: event.contactId, lastMessageType: event.messageType }]
      : await listConversationsForContact(event.contactId);
    for (const conversation of conversations) await syncConversation(conversation, contactUuid);
    return { handled: true };
  }

  // Borrados y demás eventos: se ignoran (la DB es histórica)
  return { handled: false, detail: `tipo ignorado: ${event.type}` };
}
