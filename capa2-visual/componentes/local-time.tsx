"use client";

// Fechas con hora en la zona horaria de quien mira. La DB guarda UTC.
// Por defecto ("Automática"), la del dispositivo desde donde entra. En el selector del menú se puede
// elegir otra, pero solo vale para esa pestaña (sessionStorage): al volver a entrar, otra vez la del
// dispositivo. Si el navegador dice UTC (computadora mal configurada o navegador que oculta la zona por
// privacidad), se usa Los Ángeles (Pacífico), la zona principal del negocio, para no mostrar horas 4–5 h corridas.
import { useEffect, useState, useSyncExternalStore } from "react";

const FALLBACK = "America/Los_Angeles";
const KEY = "cb-tz-session"; // zona elegida a mano, solo en esta pestaña
const OLD_KEY = "cb-tz"; // antigua elección permanente (localStorage): se borra para que no se imponga
const listeners = new Set<() => void>();

function validZone(tz: string | null | undefined): string | null {
  if (!tz) return null;
  try { new Intl.DateTimeFormat("en-US", { timeZone: tz }); return tz; } catch { return null; }
}

export function browserZone(): string | null {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone ?? null; } catch { return null; }
}

function isUtc(tz: string | null): boolean {
  return !tz || /^(Etc\/)?(UTC|GMT|UCT|Universal|Zulu)$/i.test(tz);
}

/** Zona con la que se muestran las horas en este dispositivo. */
export function deviceZone(): string {
  const b = browserZone();
  return isUtc(b) ? FALLBACK : b!;
}

export function clearOldZoneChoice() {
  try { localStorage.removeItem(OLD_KEY); } catch { /* sin storage */ }
}

/** Zona elegida a mano en esta pestaña; null = automática. */
export function savedZone(): string | null {
  try { return validZone(sessionStorage.getItem(KEY)); } catch { return null; }
}

/** Zona con la que se ven las horas: la elegida en esta pestaña o la del dispositivo. */
export function effectiveZone(): string {
  return savedZone() ?? deviceZone();
}

export function setViewerZone(tz: string | null) {
  try { if (tz) sessionStorage.setItem(KEY, tz); else sessionStorage.removeItem(KEY); } catch { /* sin storage */ }
  listeners.forEach((l) => l());
}

/** Zona con la que se muestran las horas; en el servidor (sin navegador), Los Ángeles. */
export function useViewerZone(): string {
  return useSyncExternalStore(
    (cb) => { listeners.add(cb); return () => { listeners.delete(cb); }; },
    effectiveZone,
    () => FALLBACK,
  );
}

export function LocalTime({ iso, withTime = true, timeZone, showZone }: {
  iso: string; withTime?: boolean; timeZone?: string; showZone?: boolean;
}) {
  const viewer = useViewerZone();
  const text = new Date(iso).toLocaleString("es-US", {
    day: "numeric", month: "short", ...(withTime ? { hour: "numeric", minute: "2-digit" } : {}),
    timeZone: timeZone ?? viewer,
    ...(withTime && (timeZone || showZone) ? { timeZoneName: "short" } : {}),
  });
  return <time dateTime={iso} suppressHydrationWarning>{text}</time>;
}

/** Hora actual en la zona del lead, para saber si es buen momento de escribirle. Se actualiza cada minuto. */
export function ZoneClock({ timeZone }: { timeZone: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);
  const text = new Date(now).toLocaleTimeString("es-US", { timeZone, hour: "numeric", minute: "2-digit", timeZoneName: "short" });
  return <span suppressHydrationWarning>{text}</span>;
}
