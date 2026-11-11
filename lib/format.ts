// Moneda de la cuenta publicitaria de Meta. Cambiar aquí si la cuenta no factura en USD.
export const CURRENCY = "USD";

/** La zona IANA si el entorno la reconoce; si no, null. */
export function validTimeZone(tz: string | null | undefined): string | null {
  const t = tz?.trim();
  if (!t) return null;
  try { new Intl.DateTimeFormat("en-US", { timeZone: t }); return t; } catch { return null; }
}

/**
 * Convierte una fecha de GHL a ISO UTC. GHL manda ISO con zona, epoch ms o (en citas) ISO **sin zona
 * en UTC** ("2026-11-03T15:30:00" = 10:30 a.m. EST): sin zona se toma como UTC, no como hora local
 * del servidor.
 */
export function ghlDateToIso(v: string | number | null | undefined): string | null {
  if (v == null || v === "") return null;
  const raw = typeof v === "number" || /^\d+$/.test(v) ? Number(v)
    : /[zZ]|[+-]\d{2}:?\d{2}$/.test(v.trim()) ? v.trim()
    : `${v.trim().replace(" ", "T")}Z`;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

const money = new Intl.NumberFormat("es-US", { style: "currency", currency: CURRENCY, maximumFractionDigits: 2 });
const integer = new Intl.NumberFormat("es-US", { maximumFractionDigits: 0 });
const percent = new Intl.NumberFormat("es-US", { style: "percent", maximumFractionDigits: 1 });
// Las fechas de las métricas son días UTC (sin hora): formatear en UTC para no correr el día.
const shortDay = new Intl.DateTimeFormat("es-US", { day: "numeric", month: "short", timeZone: "UTC" });

export const fmtMoney = (v: number | null): string => (v == null ? "—" : money.format(v));
export const fmtInt = (v: number | null): string => (v == null ? "—" : integer.format(v));
export const fmtPct = (v: number | null): string => (v == null ? "—" : percent.format(v));
export const fmtDay = (iso: string): string => shortDay.format(new Date(`${iso}T00:00:00Z`));

/** Cambio relativo frente al período anterior; null si no hay base para comparar. */
export function pctChange(current: number | null | undefined, previous: number | null | undefined): number | null {
  if (current == null || previous == null || previous === 0) return null;
  return (current - previous) / previous;
}

const signedPct = new Intl.NumberFormat("es-US", { style: "percent", maximumFractionDigits: 0, signDisplay: "exceptZero" });
export const fmtSignedPct = (v: number): string => signedPct.format(v);

/** Duración legible: "45 s", "12 min", "3 h 20 min", "2 d". */
export function fmtDuration(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s} s`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  if (h < 48) return m % 60 ? `${h} h ${m % 60} min` : `${h} h`;
  return `${Math.round(h / 24)} d`;
}

// Partículas que van en minúscula dentro de un nombre ("María de la Cruz")
const NAME_PARTICLES = new Set(["de", "del", "la", "las", "los", "y", "da", "do", "dos", "das", "van", "von"]);

/**
 * Mayúscula inicial solo para mostrar (en GHL no se toca). Respeta las palabras que ya vienen con
 * mayúsculas mezcladas ("McDonald") y los nombres compuestos con guion o apóstrofo.
 */
export function titleCase(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .map((word, i) => {
      const mixed = word !== word.toLowerCase() && word !== word.toUpperCase();
      if (mixed) return word;
      const lower = word.toLowerCase();
      if (i > 0 && NAME_PARTICLES.has(lower)) return lower;
      return lower.replace(/(^|[-'’])(\p{L})/gu, (_, sep: string, ch: string) => sep + ch.toUpperCase());
    })
    .join(" ");
}

/** Teléfono para mostrar: +1 (305) 555-1234 si es de EE. UU./Canadá en E.164; si no, tal cual. */
export function fmtPhone(phone: string): string {
  const d = phone.replace(/\D/g, "");
  const us = d.length === 11 && d.startsWith("1") ? d.slice(1) : d.length === 10 && !phone.startsWith("+") ? d : null;
  return us ? `+1 (${us.slice(0, 3)}) ${us.slice(3, 6)}-${us.slice(6)}` : phone;
}
