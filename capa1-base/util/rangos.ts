// Rangos de fechas y alcance de campañas: funciones puras (sin base de datos ni sesión).
// Las usa la Capa 1 (métricas) y la Capa 2 (atajos del encabezado, enlaces).

/**
 * Alcance de campañas de una página. Sin ?camp → las campañas ACTIVAS en Meta (el valor por defecto
 * en todo el dashboard); ?camp=todas → todas; ?camp=id1,id2 → esas.
 * `ids` vacío = sin filtro (todas). `param` = lo que hay que repetir en los enlaces para conservarlo.
 */
export type CampaignScope = { mode: "activas" | "todas" | "custom"; ids: string[]; param?: string };

/** "&camp=…" para enlaces que deben conservar el alcance actual ("" = el valor por defecto). */
export const campQuery = (scope: CampaignScope): string => (scope.param ? `&camp=${scope.param}` : "");

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

const lastDayOfMonth = (y: number, m: number): number => new Date(Date.UTC(y, m + 1, 0)).getUTCDate();

export function shiftDays(iso: string, days: number): string {
  return isoDay(new Date(Date.parse(`${iso}T00:00:00Z`) + days * 86_400_000));
}


/**
 * Período con el que se compara. Un rango que empieza el día 1 y no sale del mes (p. ej. "Este mes"
 * o "Mes pasado") se compara con los mismos días del mes anterior: 1–3 nov ↔ 1–3 oct. Cualquier otro
 * rango, con el período inmediatamente anterior de la misma duración.
 */
export function previousRange(from: string, to: string): { from: string; to: string } {
  if (from.endsWith("-01") && from.slice(0, 7) === to.slice(0, 7)) {
    const [y, m] = from.split("-").map(Number); // m = 1..12
    const py = m === 1 ? y - 1 : y;
    const pm = m === 1 ? 11 : m - 2; // 0..11
    const day = Math.min(Number(to.slice(8, 10)), lastDayOfMonth(py, pm));
    const mm = String(pm + 1).padStart(2, "0");
    return { from: `${py}-${mm}-01`, to: `${py}-${mm}-${String(day).padStart(2, "0")}` };
  }
  const days = Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1;
  return { from: shiftDays(from, -days), to: shiftDays(from, -1) };
}

/** Atajos de rango: "Este mes", "Mes pasado" y los últimos N días (hasta hoy). */
export function rangePresets(today: string) {
  const [y, m] = today.split("-").map(Number);
  const py = m === 1 ? y - 1 : y;
  const pm = m === 1 ? 12 : m - 1;
  const prevMonth = `${py}-${String(pm).padStart(2, "0")}`;
  return [
    { label: "Este mes", from: `${today.slice(0, 7)}-01`, to: today },
    { label: "Mes pasado", from: `${prevMonth}-01`, to: `${prevMonth}-${String(lastDayOfMonth(py, pm - 1)).padStart(2, "0")}` },
    ...[7, 30, 90].map((n) => ({ label: `${n}d`, from: shiftDays(today, -(n - 1)), to: today })),
  ];
}
