"use client";

// Client Component: "ya pasó / pendiente" se decide con el reloj del navegador de quien mira y se
// actualiza cada minuto (una página abierta pasa de ⏳ a ✓ sola cuando llega la hora).
import { useEffect, useState } from "react";
import { APPOINTMENT_PHASE_LABEL, appointmentPhase } from "@/lib/appointments";

function useNow(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);
  return now;
}

// Íconos SVG 24×24 por fase; el texto va en tooltip y para lectores de pantalla
const ICON: Record<ReturnType<typeof appointmentPhase>, { d: string; cls: string }> = {
  // reloj de arena
  pendiente: { d: "M6 2v6h.01L6 8.01 10 12l-4 4 .01.01H6V22h12v-5.99h-.01L18 16l-4-4 4-3.99-.01-.01H18V2zm10 14.5V20H8v-3.5l4-4zm-4-5-4-4V4h8v3.5z", cls: "text-warning-ink" },
  // doble check
  asistio: { d: "M18 7l-1.41-1.41-6.34 6.34 1.41 1.41zm4.24-1.41L11.66 16.17 7.48 12l-1.41 1.41L11.66 19l12-12zM.41 13.41 6 19l1.41-1.41L1.83 12z", cls: "text-good-ink" },
  no_asistio: { d: "M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z", cls: "text-critical" },
  cancelada: { d: "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20M4 12a8 8 0 0 1 12.9-6.3L5.7 16.9A7.9 7.9 0 0 1 4 12m8 8a7.9 7.9 0 0 1-4.9-1.7L18.3 7.1A8 8 0 0 1 12 20", cls: "text-ink-3" },
  // check simple
  paso: { d: "M9 16.17 4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z", cls: "text-good-ink" },
};

export function AppointmentIcon({ start, status }: { start: string | null; status: string | null }) {
  const phase = appointmentPhase(start, status, useNow());
  const icon = ICON[phase];
  const label = APPOINTMENT_PHASE_LABEL[phase];
  return (
    <span title={label} className={`inline-flex shrink-0 ${icon.cls}`} suppressHydrationWarning>
      <svg viewBox="0 0 24 24" aria-hidden="true" className="size-4 fill-current"><path d={icon.d} /></svg>
      <span className="sr-only">{label}</span>
    </span>
  );
}

/** Etiqueta con texto (para el panel del lead), mismos colores. */
export function AppointmentBadge({ start, status }: { start: string | null; status: string | null }) {
  const phase = appointmentPhase(start, status, useNow());
  const tone = phase === "pendiente" ? "bg-warning-soft text-warning-ink"
    : phase === "asistio" || phase === "paso" ? "bg-good-soft text-good-ink"
    : phase === "no_asistio" ? "bg-critical-soft text-critical"
    : "bg-surface-2 text-ink-2";
  const short = { pendiente: "Pendiente", asistio: "Asistió", no_asistio: "No asistió", cancelada: "Cancelada", paso: "Ya pasó" }[phase];
  return (
    <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium ${tone}`} title={APPOINTMENT_PHASE_LABEL[phase]}>
      <AppointmentIcon start={start} status={status} />
      {short}
    </span>
  );
}
