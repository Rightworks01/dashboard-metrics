import type { Lead } from "@base/datos/leads";

/** Tiempo hasta el primer contacto humano en ms (null = sin contacto). Puro: lo usa también la Capa 2. */
export const firstContactMs = (l: Pick<Lead, "first_human_at" | "created_at">): number | null =>
  l.first_human_at ? Date.parse(l.first_human_at) - Date.parse(l.created_at) : null;
