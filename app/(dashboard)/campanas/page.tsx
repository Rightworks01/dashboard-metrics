import { SyncCampaignsButton } from "@/app/_components/campaign-toggle";
import { mergeCampaigns, CampaignsTable } from "@/app/_components/campaigns-table";
import { Card, ErrorNote, NoAccessNote, PageHeader } from "@/app/_components/ui";
import { canControlCampaigns, canSeeAds } from "@/lib/auth";
import { logError } from "@/lib/log";
import { getCampaignOptions, getCampaigns, getRollup, resolveCampaignScope, resolveRange, type CampaignScope } from "@/lib/metrics";

export const dynamic = "force-dynamic";
export const metadata = { title: "Campañas · Right Works" };

type SearchParams = Promise<{ from?: string; to?: string; camp?: string }>;

export default async function CampanasPage({ searchParams }: { searchParams: SearchParams }) {
  if (!(await canSeeAds())) return <NoAccessNote what="Campañas" />;
  const params = await searchParams;
  const { from, to } = await resolveRange(params.from, params.to);
  // Esta pantalla es el catálogo: sin ?camp muestra TODAS las campañas de la cuenta (activas y
  // pausadas, con o sin gasto), no solo las activas como el resto del dashboard.
  const scope: CampaignScope = params.camp ? await resolveCampaignScope(params.camp) : { mode: "todas", ids: [], param: "todas" };
  const camps = scope.ids;

  const canControl = await canControlCampaigns();

  try {
    const [byCampaign, catalog, options] = await Promise.all([
      getRollup(from, to, "campaign", camps), getCampaigns(), getCampaignOptions(from, to),
    ]);
    const header = <PageHeader title="Campañas" from={from} to={to} path="/campanas" scope={scope} options={options} />;
    const merged = mergeCampaigns(catalog, byCampaign);
    const all = camps.length ? merged.filter((c) => camps.includes(c.id)) : merged;
    const active = all.filter((c) => c.catalog?.status === "ACTIVE").length;
    return (
      <>
        {header}
        <Card title={`Campañas de Meta · ${all.length}`} flush
          subtitle={canControl ? "Pausa o activa campañas directamente en Meta. Activar una campaña empieza a gastar." : "Solo lectura: tu usuario no puede pausar ni activar campañas."}
          aside={canControl ? <SyncCampaignsButton /> : null}>
          <CampaignsTable rows={all} canControl={canControl}
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
