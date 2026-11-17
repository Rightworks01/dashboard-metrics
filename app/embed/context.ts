import "server-only";
import { headers } from "next/headers";
import { checkEmbed, type EmbedCheck } from "@/lib/embed";

/** Medidas 1 y 3 (iframe del CRM + subcuenta) para las páginas de /embed. */
export async function embedCheck(location: string | undefined): Promise<EmbedCheck> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  const proto = h.get("x-forwarded-proto") ?? "https";
  return checkEmbed(h, location, `${proto}://${host}`);
}
