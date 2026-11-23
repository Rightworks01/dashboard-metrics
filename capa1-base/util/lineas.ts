// Líneas de trabajo para separar las pestañas de Leads. SOLO segmentan Leads: el Resumen, Campañas, Anuncios y
// los reportes muestran todas las campañas, tengan línea o no.
// Línea de una campaña = la que fijó un admin (tabla campaign_lines) o, si no, la automática por palabras del
// nombre. Sin palabra clave = sin línea (sus leads solo salen en "Todos" y un admin ve el aviso para asignarla).
export type Linea = "vida" | "comercial" | "reclutamiento";

export const LINEAS: Record<Linea, { label: string; short: string; path: string }> = {
  vida: { label: "Leads Vida", short: "Vida", path: "/leads/vida" },
  comercial: { label: "Leads Comercial", short: "Comercial", path: "/leads/comercial" },
  reclutamiento: { label: "Leads Reclutamiento", short: "Reclutamiento", path: "/leads/reclutamiento" },
};
export const LINEA_ORDER: Linea[] = ["vida", "comercial", "reclutamiento"];

// Palabras completas (sin importar mayúsculas ni tildes). Reclutamiento primero: "Reclutamiento Vida" es reclutamiento.
const KEYWORDS: [Linea, string[]][] = [
  ["reclutamiento", ["reclutamiento", "reclutamientos"]],
  ["comercial", ["auto", "autos", "casa", "casas", "comercial"]],
  ["vida", ["vida", "iul", "life", "gastos finales"]],
];

const norm = (s: string) => ` ${s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()} `;

/** Línea automática por el nombre, y la palabra que la decidió. null = el nombre no dice la línea. */
export function autoLine(campaignName: string | null | undefined): { line: Linea; keyword: string } | null {
  if (!campaignName) return null;
  const n = norm(campaignName);
  for (const [line, words] of KEYWORDS) {
    const hit = words.find((w) => n.includes(` ${w} `));
    if (hit) return { line, keyword: hit };
  }
  return null;
}

export type LineaInfo = { line: Linea | null; source: "admin" | "auto" | null; keyword?: string };

/** Línea efectiva: la fijada por un admin manda sobre la automática. */
export function resolveLine(campaignName: string | null | undefined, fixed: Linea | null | undefined): LineaInfo {
  if (fixed) return { line: fixed, source: "admin" };
  const auto = autoLine(campaignName);
  return auto ? { line: auto.line, source: "auto", keyword: auto.keyword } : { line: null, source: null };
}

export function parseLinea(v: string | undefined): Linea | null {
  return v === "vida" || v === "comercial" || v === "reclutamiento" ? v : null;
}
