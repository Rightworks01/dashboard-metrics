import { TopStates } from "@/app/_components/top-states";
import { UsMap } from "@/app/_components/us-map";
import { Card, ErrorNote, PageHeader } from "@/app/_components/ui";
import { fmtInt } from "@/lib/format";
import { logError } from "@/lib/log";
import { getCampaignOptions, getLeadsByState, campQuery, resolveCampaignScope, resolveRange } from "@/lib/metrics";

export const dynamic = "force-dynamic";
export const metadata = { title: "Audiencia · Right Works" };

type SearchParams = Promise<{ from?: string; to?: string; camp?: string }>;

export default async function AudienciaPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const { from, to } = await resolveRange(params.from, params.to);
  const scope = await resolveCampaignScope(params.camp);
  const camps = scope.ids;

  try {
    const [geo, options] = await Promise.all([getLeadsByState(from, to, camps), getCampaignOptions(from, to)]);
    const header = <PageHeader title="Audiencia" from={from} to={to} path="/audiencia" scope={scope} options={options} />;
    return (
      <div className="space-y-5">
        {header}
        <section className="grid gap-5 xl:grid-cols-5">
          <Card title="Leads por estado" className="xl:col-span-3"
            subtitle="Leads atribuidos a Meta según el campo «Estado» del contacto en GHL (o «state» si está vacío).">
            <UsMap states={geo.states} />
            {geo.unmatched > 0 && (
              <p className="mt-2 text-xs text-ink-3">
                {fmtInt(geo.unmatched)} leads sin estado reconocible
                {geo.unmatchedSamples.length > 0 && ` (p. ej. ${geo.unmatchedSamples.join(", ")})`}.
              </p>
            )}
          </Card>
          <Card title="Por estado" flush className="xl:col-span-2" subtitle="Pulsa un estado para ver sus leads.">
            <TopStates states={geo.states}
              leadsHref={(code) => `/leads?from=${from}&to=${to}${campQuery(scope)}&estado=${code}`} />
          </Card>
        </section>
        <p className="text-xs text-ink-3">Próximamente: edad, género y plataforma (desgloses de Meta, solo con métricas de Meta).</p>
      </div>
    );
  } catch (error) {
    logError("dashboard.audiencia", error, { from, to, camps });
    return <><PageHeader title="Audiencia" from={from} to={to} path="/audiencia" scope={scope} /><ErrorNote scope="dashboard.audiencia" what="los datos de audiencia" /></>;
  }
}
