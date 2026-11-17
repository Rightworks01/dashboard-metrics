// Campañas con poco tiempo encendidas: menos de LEARNING_DAYS días desde su inicio en Meta (fase de
// aprendizaje: CPL variable; y sus leads aún no maduraron, así que costo por cita y por ganado salen
// inflados). Solo por tiempo, no por volumen de leads.
export const LEARNING_DAYS = 7;
// Días que un lead suele tardar en agendar: los leads más recientes que esto aún pueden sumar citas.
export const MATURATION_DAYS = 7;

// first_spend_date = primer día con datos en meta_ads_daily: respaldo si Meta aún no dio start_time.
type WithStart = { start_time?: string | null; created_time?: string | null; first_spend_date?: string | null };

// Los días se cuentan en el calendario de la zona principal del negocio (Pacífico), como los cuenta una
// persona: el día en que arrancó es el día 1. Con LEARNING_DAYS = 7, el aviso se ve los días 1 a 6 y
// desaparece el día 7.
const AGE_ZONE = "America/Los_Angeles";
const ymdIn = (t: number) => new Intl.DateTimeFormat("en-CA", { timeZone: AGE_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(t);

/** Día de campaña (1 = arrancó hoy, 2 = ayer…) en el calendario de AGE_ZONE; null si no se sabe. */
export function campaignAgeDays(c: WithStart | null | undefined, now = Date.now()): number | null {
  let startDay: string | null = null;
  const ts = c?.start_time ?? c?.created_time;
  if (ts) {
    const t = Date.parse(ts);
    if (!Number.isNaN(t)) startDay = ymdIn(t);
  }
  startDay ??= c?.first_spend_date ?? null;
  if (!startDay) return null;
  const diff = Math.round((Date.parse(`${ymdIn(now)}T00:00:00Z`) - Date.parse(`${startDay}T00:00:00Z`)) / 86_400_000);
  return Math.max(1, diff + 1);
}

export function isNewCampaign(c: WithStart | null | undefined, now = Date.now()): boolean {
  const age = campaignAgeDays(c, now);
  return age !== null && age < LEARNING_DAYS;
}

/** "día 3 de 7" */
export function fmtAge(day: number): string {
  return `día ${day} de ${LEARNING_DAYS}`;
}
