import "server-only";
import { cookies } from "next/headers";
import { validTimeZone } from "@/lib/format";

// Zona horaria de quien mira, en el servidor. El navegador la deja en la cookie `cb-tz`
// (app/_components/viewer-zone-sync.tsx); sin cookie (primera carga), Los Ángeles (Pacífico), la zona
// principal del negocio. Sirve para que "hoy" y los atajos de rango sean el día local de quien mira.
export const ZONE_COOKIE = "cb-tz";
const FALLBACK = "America/Los_Angeles";

export async function viewerZone(): Promise<string> {
  return validTimeZone((await cookies()).get(ZONE_COOKIE)?.value) ?? FALLBACK;
}

/** Fecha de hoy (YYYY-MM-DD) en la zona de quien mira. */
export async function viewerToday(): Promise<string> {
  // en-CA formatea como YYYY-MM-DD
  return new Intl.DateTimeFormat("en-CA", { timeZone: await viewerZone() }).format(new Date());
}
