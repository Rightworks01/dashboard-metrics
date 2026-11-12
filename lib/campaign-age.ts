// Campañas con poco tiempo encendidas: menos de LEARNING_DAYS días desde su inicio en Meta (fase de
// aprendizaje: CPL variable; y sus leads aún no maduraron, así que costo por cita y por ganado salen
// inflados). Solo por tiempo, no por volumen de leads.
export const LEARNING_DAYS = 7;
// Días que un lead suele tardar en agendar: los leads más recientes que esto aún pueden sumar citas.
export const MATURATION_DAYS = 7;

// first_spend_date = primer día con datos en meta_ads_daily: respaldo si Meta aún no dio start_time.
type WithStart = { start_time?: string | null; created_time?: string | null; first_spend_date?: string | null };

/** Días completos desde el inicio de la campaña (0 = arrancó hoy); null si no se sabe. */
export function campaignAgeDays(c: WithStart | null | undefined, now = Date.now()): number | null {
  const start = c?.start_time ?? c?.created_time ?? (c?.first_spend_date ? `${c.first_spend_date}T00:00:00Z` : null);
  if (!start) return null;
  const t = Date.parse(start);
  if (Number.isNaN(t)) return null;
  return Math.max(0, Math.floor((now - t) / 86_400_000));
}

export function isNewCampaign(c: WithStart | null | undefined, now = Date.now()): boolean {
  const age = campaignAgeDays(c, now);
  return age !== null && age < LEARNING_DAYS;
}

export function fmtAge(days: number): string {
  return days === 0 ? "hoy" : `${days} ${days === 1 ? "día" : "días"}`;
}
