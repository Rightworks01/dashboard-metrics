import { AdsTable } from "@/app/_components/ads-table";
import { Card, ErrorNote, NoAccessNote, PageHeader } from "@/app/_components/ui";
import { canSeeAds } from "@/lib/auth";
import { fmtInt, fmtMoney } from "@/lib/format";
import { logError } from "@/lib/log";
import { getCampaignOptions, getCampaigns, getRollup, campQuery, resolveCampaignScope, parseSort, resolveRange, sortRows } from "@/lib/metrics";

export const dynamic = "force-dynamic";
export const metadata = { title: "Anuncios · Right Works" };

type SearchParams = Promise<{ from?: string; to?: string; sort?: string; dir?: string; camp?: string }>;

export default async function AnunciosPage({ searchParams }: { searchParams: SearchParams }) {
  if (!(await canSeeAds())) return <NoAccessNote what="Anuncios" />;
  const params = await searchParams;
  const { from, to } = await resolveRange(params.from, params.to);
  const { sort, dir } = parseSort(params.sort, params.dir);
  const scope = await resolveCampaignScope(params.camp);
  const camps = scope.ids;
  const campQs = campQuery(scope);

  try {
    const [ads, totals, catalog, options] = await Promise.all([
      getRollup(from, to, "ad", camps), getRollup(from, to, "total", camps), getCampaigns(), getCampaignOptions(from, to),
    ]);
    const header = <PageHeader title="Anuncios" from={from} to={to} path="/anuncios" scope={scope} options={options} />;
    const total = totals[0] ?? null;
    return (
      <>
        {header}
        <Card flush title={`${fmtInt(ads.length)} anuncios con gasto · ${fmtMoney(total?.spend ?? 0)}`}
          subtitle="Pulsa un encabezado para ordenar. Las columnas de GHL muestran lo que pasó de verdad con los leads.">
          <AdsTable rows={sortRows(ads, sort, dir)} total={total} sort={sort} dir={dir}
            sortHref={(key, d) => `/anuncios?from=${from}&to=${to}${campQs}&sort=${key}&dir=${d}`}
            campaignName={new Map(catalog.map((c) => [c.id, c.name]))}
            leadsHref={(id, etapa) => `/leads?from=${from}&to=${to}${campQs}&anuncio=${id}${etapa ? `&etapa=${etapa}` : ""}`} />
        </Card>
        <p className="mt-3 text-xs text-ink-3">Próximamente: nombre del anuncio y del conjunto, estado y miniatura del creativo.</p>
      </>
    );
  } catch (error) {
    logError("dashboard.anuncios", error, { from, to, camps });
    return <><PageHeader title="Anuncios" from={from} to={to} path="/anuncios" scope={scope} /><ErrorNote scope="dashboard.anuncios" what="los anuncios" /></>;
  }
}
