// Campañas "nuevas": menos de LEARNING_DAYS días desde que arrancaron en Meta. En ese período Meta
// está en fase de aprendizaje (costos variables) y los leads todavía no tuvieron tiempo de agendar o
// cerrar, así que el costo por cita y por ganado se ven inflados.
export const LEARNING_DAYS = 7;

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
