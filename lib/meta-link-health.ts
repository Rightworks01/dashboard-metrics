import "server-only";
import { supabaseServer } from "@/lib/supabase/server";
import { logError } from "@/lib/log";

// ¿Se cortó la conexión Facebook → GHL? GHL no expone su estado por API, así que se infiere de los
// datos: en los últimos días COMPLETOS (UTC; ambos crons ya los cubren) Meta reporta leads de
// formulario pero casi ninguno llega a GHL con atribución de Meta. Un lead suelto de diferencia
// (envío duplicado que GHL une en un contacto, lead de prueba) no dispara el aviso.
const WINDOW_DAYS = 2;
const MIN_META_LEADS = 3;   // con menos, no hay señal suficiente
const MIN_RATIO = 0.5;      // GHL recibió menos de la mitad de lo que reporta Meta

export type MetaLinkHealth = { broken: boolean; metaLeads: number; ghlLeads: number; from: string; to: string };

const ymd = (d: Date) => d.toISOString().slice(0, 10);

export async function metaLinkHealth(now = new Date()): Promise<MetaLinkHealth | null> {
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const from = ymd(new Date(today.getTime() - WINDOW_DAYS * 86_400_000));
  const to = ymd(new Date(today.getTime() - 86_400_000));
  try {
    const supabase = await supabaseServer();
    const [meta, ghl] = await Promise.all([
      supabase.from("meta_ads_daily").select("leads_reported").gte("date", from).lte("date", to),
      supabase.from("contacts").select("id", { count: "exact", head: true })
        .not("meta_ad_id", "is", null)
        .gte("created_at", `${from}T00:00:00Z`).lt("created_at", `${ymd(today)}T00:00:00Z`),
    ]);
    if (meta.error) throw new Error(`meta_ads_daily: ${meta.error.message}`);
    if (ghl.error) throw new Error(`contacts: ${ghl.error.message}`);
    const metaLeads = (meta.data ?? []).reduce((sum, r) => sum + Number(r.leads_reported ?? 0), 0);
    const ghlLeads = ghl.count ?? 0;
    const broken = metaLeads >= MIN_META_LEADS && ghlLeads < metaLeads * MIN_RATIO;
    return { broken, metaLeads, ghlLeads, from, to };
  } catch (error) {
    logError("meta-link-health", error, { from, to });
    return null;
  }
}

/** Página de Integraciones de la subcuenta en GHL (ahí se reconecta Facebook). */
export function ghlIntegrationsUrl(): string {
  return `${process.env.GHL_APP_URL ?? "https://app.gohighlevel.com"}/v2/location/${process.env.GHL_LOCATION_ID ?? ""}/settings/lc-integrations`;
}
