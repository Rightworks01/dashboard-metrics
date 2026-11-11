import { ghlDateToIso } from "@/lib/format";
import { logError } from "@/lib/log";
import { upsertRows, type Row } from "@/lib/supabase/admin";
import { ghlGet, ghlLocationId } from "./client";
import { ensureContacts } from "./contacts";
import type { GhlCalendar, GhlCalendarEvent } from "./types";

const DAY = 86_400_000;

// GHL devuelve fechas como ISO, epoch ms o ISO sin zona en UTC: ver ghlDateToIso.
const toIso = ghlDateToIso;

async function upsertEvents(events: GhlCalendarEvent[]): Promise<number> {
  if (events.length === 0) return 0;
  const contacts = await ensureContacts(events.map((e) => e.contactId).filter((id): id is string => !!id));
  const syncedAt = new Date().toISOString();
  const rows: Row[] = events.map((e) => {
    return {
      id_ghl: e.id,
      contact_id: e.contactId ? (contacts.get(e.contactId) ?? null) : null,
      calendar_id: e.calendarId ?? null,
      title: e.title ?? null,
      start_time: toIso(e.startTime),
      end_time: toIso(e.endTime),
      status: e.appointmentStatus?.toLowerCase() ?? null,
      assigned_user_id: e.assignedUserId ?? null,
      created_at: toIso(e.dateAdded),
      synced_at: syncedAt,
    };
  });
  await upsertRows("appointments", rows, "id_ghl");
  return rows.length;
}

/** Citas de todos los calendarios en [hoy - pastDays, hoy + 60 días]. */
export async function syncAppointments(pastDays: number): Promise<number> {
  const { calendars } = await ghlGet<{ calendars: GhlCalendar[] }>("/calendars/", { locationId: ghlLocationId() });
  const now = Date.now();
  let total = 0;
  for (const calendar of calendars) {
    try {
      const { events } = await ghlGet<{ events: GhlCalendarEvent[] }>("/calendars/events", {
        locationId: ghlLocationId(),
        calendarId: calendar.id,
        startTime: now - pastDays * DAY,
        endTime: now + 60 * DAY,
      });
      total += await upsertEvents(events ?? []);
    } catch (error) {
      logError("ghl.appointments.calendar", error, { calendarId: calendar.id });
    }
  }
  return total;
}

/** Una cita por ID (webhooks AppointmentCreate/Update). */
export async function syncAppointment(id: string): Promise<void> {
  const res = await ghlGet<{ appointment?: GhlCalendarEvent; event?: GhlCalendarEvent }>(`/calendars/events/appointments/${id}`);
  const event = res.appointment ?? res.event;
  if (event) await upsertEvents([event]);
}
