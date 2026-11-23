// Líneas de negocio para separar los leads: las campañas con "reclutamiento" en el nombre son de
// Reclutamiento; todas las demás (y los leads sin campaña conocida) son de Insurance.
export type Linea = "insurance" | "reclutamiento";

export const LINEAS: Record<Linea, { label: string; path: string }> = {
  insurance: { label: "Leads Insurance", path: "/leads/insurance" },
  reclutamiento: { label: "Leads Reclutamiento", path: "/leads/reclutamiento" },
};

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Línea de una campaña por su nombre (sin importar mayúsculas ni tildes). */
export function campaignLine(campaignName: string | null | undefined): Linea {
  return campaignName && norm(campaignName).includes("reclutamiento") ? "reclutamiento" : "insurance";
}

export function parseLinea(v: string | undefined): Linea | null {
  return v === "insurance" || v === "reclutamiento" ? v : null;
}
