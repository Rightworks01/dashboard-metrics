// Solo los campos que usamos de la API v2 de GHL.

export type GhlContact = {
  id: string;
  dateAdded?: string;
  contactName?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  assignedTo?: string | null;
  tags?: string[];
  type?: string | null;
  state?: string | null;
  country?: string | null;
  /** Teléfono, normalmente E.164 ("+13055551234"). */
  phone?: string | null;
  /** Zona horaria del contacto ({{contact.timezone}}), IANA: "America/Chicago". */
  timezone?: string | null;
  customFields?: { id: string; value?: unknown }[] | null;
  attributionSource?: Record<string, unknown> | null;
};

export type GhlCustomField = { id: string; name?: string; fieldKey?: string };

export type GhlOpportunity = {
  id: string;
  contactId?: string;
  contact?: { id: string };
  pipelineStageId?: string;
  monetaryValue?: number | null;
  status?: string;
  createdAt?: string;
  lastStageChangeAt?: string | null;
};

export type GhlPipeline = {
  id: string;
  name: string;
  stages: { id: string; name: string }[];
};

export type GhlConversation = {
  id: string;
  contactId: string;
  lastMessageDate?: number; // epoch ms
  lastMessageType?: string;
  dateAdded?: number; // epoch ms
};

export type GhlMessage = {
  id: string;
  direction?: string;
  body?: string;
  dateAdded: string;
  messageType?: string;
  userId?: string | null;
  source?: string | null; // workflow | bulk_actions | campaign | api | app
  status?: string | null;
  meta?: Record<string, unknown> | null;
};

export type GhlUser = { id: string; name?: string; firstName?: string; lastName?: string };

export type GhlCalendar = { id: string; name?: string };

// Formato no verificado contra la documentación oficial: se lee de forma defensiva.
export type GhlCalendarEvent = {
  id: string;
  calendarId?: string;
  contactId?: string | null;
  title?: string | null;
  startTime?: string | number | null;
  endTime?: string | number | null;
  appointmentStatus?: string | null;
  assignedUserId?: string | null;
  dateAdded?: string | number | null;
};
