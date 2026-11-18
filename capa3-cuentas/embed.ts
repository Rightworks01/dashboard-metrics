// Pestaña "Publicar" incrustada en GHL como Custom Menu Link (iframe), SOLO en la subcuenta de Right Works.
// Cuatro medidas:
//   1. La petición tiene que venir de un iframe (Sec-Fetch-Dest) cuyo padre esté en ALLOWED_PARENT_ORIGINS
//      (Referer); si se abre el enlace directo en una pestaña → "Esta página solo se puede abrir desde el CRM".
//   2. frame-ancestors (next.config.ts) solo deja que esos dominios la incrusten.
//   3. ?location={{location.id}} (lo rellena GHL en el enlace del menú) tiene que ser GHL_LOCATION_ID.
//   4. Sesión de un ADMIN del dashboard. Dentro del iframe la cookie es de terceros: se usa una cookie aparte
//      (`sb-rw-embed`), SameSite=None, Secure y Partitioned (CHIPS), solo para las rutas /embed.

export { EMBED_COOKIE, EMBED_HEADER } from "@base/conexiones/supabase/sesion";

export function allowedParentOrigins(): string[] {
  return (process.env.ALLOWED_PARENT_ORIGINS ?? "https://app.rightworksinsurance.com,https://app.gohighlevel.com")
    .split(",").map((o) => o.trim().replace(/\/$/, "")).filter(Boolean);
}

export type EmbedCheck = { ok: true; location: string } | { ok: false; reason: "outside" | "location" };

/**
 * ¿Se puede servir esta petición de /embed? Navegación del iframe (Sec-Fetch-Dest: iframe) con Referer del
 * CRM o del propio dashboard (login → publicar), o una petición interna de la página ya cargada
 * (same-origin, Sec-Fetch-Dest: empty). Sec-Fetch-* los pone el navegador: una pestaña no puede fingirlos.
 */
export function checkEmbed(h: Headers, location: string | undefined, selfOrigin: string): EmbedCheck {
  const dest = h.get("sec-fetch-dest");
  const site = h.get("sec-fetch-site");
  const referer = h.get("referer");
  let refOrigin: string | null = null;
  try {
    refOrigin = referer ? new URL(referer).origin : null;
  } catch {
    refOrigin = null;
  }
  const fromParent = dest === "iframe" && (refOrigin === null || refOrigin === selfOrigin || allowedParentOrigins().includes(refOrigin));
  const internal = dest === "empty" && site === "same-origin";
  if (!fromParent && !internal) return { ok: false, reason: "outside" };
  const expected = process.env.GHL_LOCATION_ID;
  if (!expected || location !== expected) return { ok: false, reason: "location" };
  return { ok: true, location };
}
