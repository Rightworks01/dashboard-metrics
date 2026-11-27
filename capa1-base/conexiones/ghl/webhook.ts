import { after } from "next/server";
import { z } from "zod";
import { logError, logInfo } from "@base/conexiones/log";
import { fetchContact, upsertContacts, ensureContacts, refreshIfUnassigned, isMetaLead } from "@base/conexiones/ghl/contacts";
import { listConversationsForContact, syncConversation } from "@base/conexiones/ghl/conversations";
import { fetchOpportunity, upsertOpportunities } from "@base/conexiones/ghl/opportunities";
import { syncAppointment } from "@base/conexiones/ghl/appointments";
import type { GhlConversation } from "@base/conexiones/ghl/types";

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

// Lead de Meta sin agente: se vuelve a preguntar a GHL tras la respuesta (after), a los 20 s y a los 50 s
// (la ruta tiene maxDuration 60). Si sigue sin agente, la reconciliación diaria lo corrige.
// Solo leads de Meta: los importados nunca reciben agente por rotación y cada espera mantiene la función
// viva ~50 s (una importación de 4.000 contactos = decenas de horas de función en Vercel).
const ASSIGNMENT_RECHECKS_MS = [20_000, 30_000];
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function recheckAssignmentLater(ghlId: string) {
  after(async () => {
    for (const wait of ASSIGNMENT_RECHECKS_MS) {
      await sleep(wait);
      try {
        if (await refreshIfUnassigned(ghlId)) {
          logInfo("webhook.ghl.assigned_later", { contactId: ghlId });
          return;
        }
      } catch (error) {
        logError("webhook.ghl.assigned_later", error, { contactId: ghlId });
        return;
      }
    }
  });
}

export async function handleGhlEvent(event: GhlWebhookEvent): Promise<WebhookResult> {
  if (event.type.startsWith("Contact") && event.type !== "ContactDelete") {
    const contactId = event.id ?? event.contactId;
    if (!contactId) return { handled: false, detail: "evento de contacto sin id" };
    const contact = await fetchContact(contactId);
    await upsertContacts([contact]);
    const recheck = !contact.assignedTo && isMetaLead(contact);
    if (recheck) recheckAssignmentLater(contactId);
    return { handled: true, ...(recheck ? { detail: "sin agente todavía: se vuelve a revisar en segundos" } : {}) };
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
    // De paso, si el contacto quedó sin agente al crearse, se corrige ahora
    await refreshIfUnassigned(event.contactId).catch((error) => logError("webhook.ghl.refresh_assignment", error, { contactId: event.contactId }));
    return { handled: true };
  }

  // Borrados y demás eventos: se ignoran (la DB es histórica)
  return { handled: false, detail: `tipo ignorado: ${event.type}` };
}
