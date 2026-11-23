import { accesoA, puede } from "@cuentas/roles";
import { myAccess } from "@cuentas/auth";
import { setCampaignLine } from "@cuentas/acciones";
import { LineSelect } from "@base/acciones/line-select";
import { getFixedLines } from "@base/datos/campaign-lines";
import { resolveLine } from "@base/util/lineas";
import { UnlinedCampaignsNote } from "@visual/componentes/unlined-note";
import { CampaignToggle, SyncCampaignsButton } from "@base/acciones/campaign-toggle";
import { mergeCampaigns, CampaignsTable, NewCampaignsNote } from "@visual/componentes/campaigns-table";
import { Card, ErrorNote, NoAccessNote, PageHeader } from "@visual/componentes/ui";
import { canControlCampaigns, canSeeAds, agentScope } from "@cuentas/auth";
import { logError } from "@base/conexiones/log";
import { getCampaignOptions, getCampaigns, getRollup, resolveCampaignScope, resolveRange, type CampaignScope } from "@base/datos/metrics";

export const dynamic = "force-dynamic";
export const metadata = { title: "Campañas · Right Works" };

type SearchParams = Promise<{ from?: string; to?: string; camp?: string }>;

export default async function CampanasPage({ searchParams }: { searchParams: SearchParams }) {
  const scopeAgent = await agentScope(); // Capa 3: null = la cuenta ve todo
  if (!(await accesoA("campanas"))) return <NoAccessNote what="Campañas" />;
  const params = await searchParams;
  const { from, to } = await resolveRange(params.from, params.to);
  // Esta pantalla es el catálogo: sin ?camp muestra TODAS las campañas de la cuenta (activas y
  // pausadas, con o sin gasto), no solo las activas como el resto del dashboard.
  const scope: CampaignScope = params.camp ? await resolveCampaignScope(params.camp) : { mode: "todas", ids: [], param: "todas" };
  const camps = scope.ids;

  const canControl = await canControlCampaigns();
  // Solo admins: columna "Línea" (separa las pestañas de Leads; no oculta nada en el resto del dashboard)
  const isLineAdmin = puede(await myAccess().catch(() => null), "lineas");

  try {
    const [byCampaign, catalog, options, fixedLines] = await Promise.all([
      getRollup(from, to, "campaign", camps), getCampaigns(), getCampaignOptions(from, to, scopeAgent),
      isLineAdmin ? getFixedLines() : Promise.resolve(new Map()),
    ]);
    const lineOf = (id: string, name: string) => resolveLine(name, fixedLines.get(id));
    const unlinedActive = isLineAdmin ? catalog.filter((c) => c.status === "ACTIVE" && !lineOf(c.id, c.name).line).map((c) => c.name) : [];
    const header = <PageHeader title="Campañas" from={from} to={to} path="/campanas" scope={scope} options={options} />;
    const merged = mergeCampaigns(catalog, byCampaign);
    const all = camps.length ? merged.filter((c) => camps.includes(c.id)) : merged;
    const active = all.filter((c) => c.catalog?.status === "ACTIVE").length;
    return (
      <>
        {header}
        {unlinedActive.length > 0 && <div className="mb-5"><UnlinedCampaignsNote names={unlinedActive} where="tabla" /></div>}
        <NewCampaignsNote rows={all} className="mb-5" />
        <Card title={`Campañas de Meta · ${all.length}`} flush
          subtitle={canControl ? "Pausa o activa campañas directamente en Meta. Activar una campaña empieza a gastar." : "Solo lectura: tu usuario no puede pausar ni activar campañas."}
          aside={canControl ? <SyncCampaignsButton /> : null}>
          <CampaignsTable rows={all}
            lineCell={isLineAdmin ? (c) => <LineSelect campaignId={c.id} campaignName={c.name} info={lineOf(c.id, c.name)} assign={setCampaignLine} /> : undefined}
            toggle={(c) => <CampaignToggle {...c} disabled={!canControl} />}
            leadsHref={(id, etapa) => `/leads?from=${from}&to=${to}&camp=${id}${etapa ? `&etapa=${etapa}` : ""}`} />
          <p className="border-t border-line px-5 py-3 text-xs text-ink-3">
            {all.length} campañas · {active} {active === 1 ? "activa" : "activas"}. Primero las activas, luego por gasto en el rango.
          </p>
        </Card>
      </>
    );
  } catch (error) {
    logError("dashboard.campanas", error, { from, to, camps });
    return <><PageHeader title="Campañas" from={from} to={to} path="/campanas" scope={scope} /><ErrorNote scope="dashboard.campanas" what="las campañas" /></>;
  }
}
