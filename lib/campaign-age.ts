// Métricas de campaña poco representativas:
// - menos de LEARNING_DAYS días desde que arrancó en Meta (fase de aprendizaje: CPL variable; y sus
//   leads aún no maduraron, así que costo por cita y por ganado salen inflados), o
// - menos de MIN_LEADS leads en el rango (con pocos leads, uno más o menos mueve mucho los costos).
export const LEARNING_DAYS = 7;
export const MIN_LEADS = 30;
// Días que un lead suele tardar en agendar: los leads más recientes que esto aún pueden sumar citas.
export const MATURATION_DAYS = 7;

type WithStart = { start_time?: string | null; created_time?: string | null };

/** Días completos desde el inicio de la campaña (0 = arrancó hoy); null si Meta no da la fecha. */
export function campaignAgeDays(c: WithStart | null | undefined, now = Date.now()): number | null {
  const start = c?.start_time ?? c?.created_time;
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

/** Por qué las cifras de una campaña son orientativas (null = ya son representativas). */
export function campaignCaveat(
  c: WithStart | null | undefined,
  leads: number,
  now = Date.now(),
): { age: number | null; newCampaign: boolean; fewLeads: boolean } | null {
  const age = campaignAgeDays(c, now);
  const newCampaign = age !== null && age < LEARNING_DAYS;
  const fewLeads = leads < MIN_LEADS;
  return newCampaign || fewLeads ? { age, newCampaign, fewLeads } : null;
}
