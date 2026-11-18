// Estado de una cita para mostrar. En GHL todas las citas se autoconfirman, así que "confirmada" no
// dice nada: lo que importa es si ya pasó y, si pasó, si se marcó asistencia.
export type AppointmentPhase = "pendiente" | "asistio" | "no_asistio" | "cancelada" | "paso";

export function appointmentPhase(startIso: string | null, status: string | null, now = Date.now()): AppointmentPhase {
  if (status === "cancelled" || status === "invalid") return "cancelada";
  if (status === "showed") return "asistio";
  if (status === "noshow") return "no_asistio";
  if (startIso && Date.parse(startIso) > now) return "pendiente";
  return "paso"; // ya pasó y nadie marcó asistencia en GHL
}

export const APPOINTMENT_PHASE_LABEL: Record<AppointmentPhase, string> = {
  pendiente: "Pendiente: aún no llega la hora",
  asistio: "Asistió",
  no_asistio: "No asistió",
  cancelada: "Cancelada",
  paso: "Ya pasó (sin marcar asistencia en GHL)",
};

/**
 * Orden jerárquico de citas: primero las pendientes (la más próxima arriba) y después las que ya
 * pasaron o se cerraron (la más reciente arriba). `now` fijo para que todo el orden sea coherente.
 */
export function compareAppointments(
  a: { start: string | null; status: string | null },
  b: { start: string | null; status: string | null },
  now = Date.now(),
): number {
  const group = (x: typeof a) => (appointmentPhase(x.start, x.status, now) === "pendiente" ? 0 : 1);
  const ga = group(a);
  const gb = group(b);
  if (ga !== gb) return ga - gb;
  const ta = a.start ? Date.parse(a.start) : 0;
  const tb = b.start ? Date.parse(b.start) : 0;
  return ga === 0 ? ta - tb : tb - ta;
}
