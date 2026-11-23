import { accesoA } from "@cuentas/roles";
import { agentScope } from "@cuentas/auth";
import { PrintButton } from "@base/acciones/report-actions";
import { logError } from "@base/conexiones/log";
import { buildFollowupReport, type FollowupReport } from "@base/datos/followup";
import { getCampaignOptions, resolveCampaignScope, resolveRange } from "@base/datos/metrics";
import { FollowupReportView } from "@visual/componentes/followup-report";
import { ReportTabs } from "@visual/componentes/report-tabs";
import { ErrorNote, NoAccessNote, PageHeader } from "@visual/componentes/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Reporte de seguimiento · Right Works" };

type SearchParams = Promise<{ from?: string; to?: string; camp?: string }>;

export default async function SeguimientoPage({ searchParams }: { searchParams: SearchParams }) {
  if (!(await accesoA("reportes"))) return <NoAccessNote what="Reportes" />;
  const scopeAgent = await agentScope(); // Capa 3: null = la cuenta ve todo
  const params = await searchParams;
  const { from, to } = await resolveRange(params.from, params.to);
  const scope = await resolveCampaignScope(params.camp);
  const query = new URLSearchParams({ from, to, ...(scope.param ? { camp: scope.param } : {}) }).toString();
  const header = (options?: Awaited<ReturnType<typeof getCampaignOptions>>) => (
    <div className="space-y-4 print:hidden">
      <PageHeader title="Reportes" description="elige período y campañas arriba" from={from} to={to} path="/reportes/seguimiento" scope={scope} options={options} />
      <ReportTabs active="seguimiento" query={query} />
    </div>
  );

  let report: FollowupReport;
  let options: Awaited<ReturnType<typeof getCampaignOptions>>;
  try {
    [report, options] = await Promise.all([buildFollowupReport(from, to, scope.ids), getCampaignOptions(from, to, scopeAgent)]);
  } catch (error) {
    logError("dashboard.reportes.seguimiento", error, { from, to });
    return <>{header()}<ErrorNote scope="dashboard.reportes.seguimiento" what="el reporte de seguimiento" /></>;
  }

  const campaignsLabel = scope.mode === "todas" ? "todas las campañas" : scope.mode === "activas" ? "campañas activas" : `${scope.ids.length} campañas elegidas`;
  return (
    <div className="space-y-5">
      {header(options)}
      <FollowupReportView report={report} campaignsLabel={campaignsLabel}
        leadHref={(id) => `/leads?${query}&lead=${id}`}
        leadsHref={(etapa) => `/leads?${query}${etapa ? `&etapa=${etapa}` : ""}`}
        respuestaHref={(section) => `/respuesta?${query}${section ? `#${section}` : ""}`}
        actions={<>
          <a href={`/reportes/seguimiento/csv?${query}`} className="inline-flex items-center rounded-lg border border-line px-3 py-1.5 text-sm font-medium text-ink-2 hover:bg-surface-2">Excel / CSV</a>
          <PrintButton />
        </>} />
    </div>
  );
}
