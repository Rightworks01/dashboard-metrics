import Link from "next/link";
import { Card, ErrorNote, Kpi, NoAccessNote, PageHeader } from "@/app/_components/ui";
import { agentScope } from "@/lib/auth";
import { fmtInt, fmtPct } from "@/lib/format";
import { getLeads } from "@/lib/leads";
import { logError } from "@/lib/log";
import { getCampaignOptions, getCampaigns, getRollup, campQuery, resolveCampaignScope, resolveRange } from "@/lib/metrics";

export const dynamic = "force-dynamic";
export const metadata = { title: "Calidad de datos · Right Works" };

type SearchParams = Promise<{ from?: string; to?: string; camp?: string }>;

const DAY = 86_400_000;
const ratio = (a: number, b: number) => (b > 0 ? a / b : null);

export default async function CalidadPage({ searchParams }: { searchParams: SearchParams }) {
  if (await agentScope()) return <NoAccessNote what="Calidad de datos" />;
  const params = await searchParams;
  const { from, to } = await resolveRange(params.from, params.to);
  const scope = await resolveCampaignScope(params.camp);
  const camps = scope.ids;
  const qs = `from=${from}&to=${to}${campQuery(scope)}`;

  try {
    const [leads, ads, catalog, options] = await Promise.all([
      getLeads({ from, to, campaigns: camps, filter: "todos" }),
      getRollup(from, to, "ad", camps),
      getCampaigns(),
      getCampaignOptions(from, to),
    ]);
    const now = Date.now();
    const noState = leads.filter((l) => !l.state_code);
    const noAgent = leads.filter((l) => !l.assigned_to);
    const stale = leads.filter((l) => !l.first_human_at && now - Date.parse(l.created_at) > DAY);
    const metaLeads = ads.reduce((s, a) => s + a.leads_reported, 0);
    const ghlLeads = ads.reduce((s, a) => s + a.leads_ghl, 0);
    const campaignName = new Map(catalog.map((c) => [c.id, c.name]));

    // Leads sin estado reconocible, por campaña (p. ej. un formulario que guarda el estado en otro campo)
    const byCampaign = new Map<string, { name: string; leads: number; noState: number }>();
    for (const l of leads) {
      const key = l.campaign_id ?? "";
      const row = byCampaign.get(key) ?? { name: l.campaign_name ?? (key ? `Campaña ${key}` : "Sin campaña"), leads: 0, noState: 0 };
      row.leads++;
      if (!l.state_code) row.noState++;
      byCampaign.set(key, row);
    }
    const campaignsWithGaps = [...byCampaign.values()].filter((c) => c.noState > 0).sort((a, b) => b.noState - a.noState);
    const adGaps = ads
      .map((a) => ({ ...a, gap: a.leads_reported - a.leads_ghl }))
      .filter((a) => a.leads_reported > 0 || a.leads_ghl > 0)
      .sort((a, b) => b.gap - a.gap);

    return (
      <div className="space-y-5">
        <PageHeader title="Calidad de datos" from={from} to={to} path="/calidad" scope={scope} options={options}
          description="Fugas que distorsionan las métricas" />

        <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Kpi label="Leads Meta → GHL" value={fmtPct(ratio(ghlLeads, metaLeads))}
            hint={`${fmtInt(ghlLeads)} de ${fmtInt(metaLeads)} que reporta Meta`} accent />
          <Kpi label="Sin contacto humano > 24 h" value={fmtInt(stale.length)} hint="Lead pagado sin atender"
            href={`/leads?${qs}&etapa=sin_contacto`} />
          <Kpi label="Sin estado reconocible" value={fmtInt(noState.length)} hint={`${fmtPct(ratio(noState.length, leads.length))} de los leads`} />
          <Kpi label="Sin agente asignado" value={fmtInt(noAgent.length)} hint={`${fmtPct(ratio(noAgent.length, leads.length))} de los leads`} />
        </section>

        <section className="grid gap-5 xl:grid-cols-2">
          <Card title="Meta reporta vs. llegan a GHL, por anuncio" flush
            subtitle="Diferencia = leads que Meta cobra como lead y no aparecen en GHL con ese anuncio (o llegan sin atribución).">
            {adGaps.length === 0 ? <p className="px-5 pb-5 text-sm text-ink-3">Sin anuncios con leads en este rango.</p> : (
              <div className="relative overflow-x-auto">
                <table className="w-full text-right text-sm tabular-nums">
                  <thead className="border-y border-line bg-surface-2/60 text-xs text-ink-3">
                    <tr>
                      <th className="px-5 py-2.5 text-left font-medium">Anuncio</th>
                      <th className="px-3 py-2.5 font-medium">Meta</th>
                      <th className="px-3 py-2.5 font-medium">GHL</th>
                      <th className="px-5 py-2.5 font-medium">Diferencia</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {adGaps.map((a) => (
                      <tr key={a.key}>
                        <td className="px-5 py-2.5 text-left">
                          <span className="font-mono text-xs text-ink">{a.key}</span>
                          <span className="block max-w-64 truncate text-xs text-ink-3">{campaignName.get(a.campaign_id ?? "") ?? ""}</span>
                        </td>
                        <td className="px-3 py-2.5">{fmtInt(a.leads_reported)}</td>
                        <td className="px-3 py-2.5">
                          {a.leads_ghl > 0
                            ? <Link href={`/leads?${qs}&anuncio=${a.key}`} className="text-accent hover:underline">{fmtInt(a.leads_ghl)}</Link>
                            : "0"}
                        </td>
                        <td className={`px-5 py-2.5 font-medium ${a.gap > 0 ? "text-critical" : "text-ink-2"}`}>
                          {a.gap > 0 ? `−${fmtInt(a.gap)}` : a.gap < 0 ? `+${fmtInt(-a.gap)}` : "0"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="border-t border-line px-5 py-2 text-xs text-ink-3">
                  Más en GHL que en Meta (+) suele ser Meta corrigiendo cifras o leads atribuidos a un día distinto.
                </p>
              </div>
            )}
          </Card>

          <Card title="Leads sin estado, por campaña" flush
            subtitle="Si una campaña tiene casi todos sus leads sin estado, el formulario guarda el estado en un campo que no se está leyendo.">
            {campaignsWithGaps.length === 0 ? <p className="px-5 pb-5 text-sm text-ink-3">Todos los leads tienen estado.</p> : (
              <div className="relative overflow-x-auto">
                <table className="w-full text-right text-sm tabular-nums">
                  <thead className="border-y border-line bg-surface-2/60 text-xs text-ink-3">
                    <tr>
                      <th className="px-5 py-2.5 text-left font-medium">Campaña</th>
                      <th className="px-3 py-2.5 font-medium">Leads</th>
                      <th className="px-5 py-2.5 font-medium">Sin estado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {campaignsWithGaps.map((c) => (
                      <tr key={c.name}>
                        <td className="max-w-72 truncate px-5 py-2.5 text-left text-ink" title={c.name}>{c.name}</td>
                        <td className="px-3 py-2.5">{fmtInt(c.leads)}</td>
                        <td className="px-5 py-2.5 font-medium text-critical">
                          {fmtInt(c.noState)} <span className="text-xs font-normal text-ink-3">{fmtPct(ratio(c.noState, c.leads))}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </section>
      </div>
    );
  } catch (error) {
    logError("dashboard.calidad", error, { from, to, camps });
    return (
      <>
        <PageHeader title="Calidad de datos" from={from} to={to} path="/calidad" scope={scope} />
        <ErrorNote scope="dashboard.calidad" what="los datos de calidad" />
      </>
    );
  }
}
