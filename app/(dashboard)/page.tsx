import Link from "next/link";
import { redirect } from "next/navigation";
import { mergeCampaigns, CampaignsTable, NewCampaignsNote } from "@/app/_components/campaigns-table";
import { LeadsChart, SpendChart } from "@/app/_components/daily-chart";
import { Funnel } from "@/app/_components/funnel";
import { Card, ErrorNote, Kpi, LegendDot, PageHeader } from "@/app/_components/ui";
import { fmtDay, fmtInt, fmtMoney, fmtPct } from "@/lib/format";
import { agentScope, canSeeAds } from "@/lib/auth";
import { logError } from "@/lib/log";
import { getCampaignOptions, getCampaigns, getRollup, campQuery, resolveCampaignScope, previousRange, resolveRange, type Campaign, type CampaignOption, type RollupRow } from "@/lib/metrics";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ from?: string; to?: string; camp?: string }>;

export default async function ResumenPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  // El Resumen agrega todos los leads: quien está limitado a un agente va directo a sus Leads.
  if (await agentScope()) redirect(`/leads${params.from && params.to ? `?from=${params.from}&to=${params.to}` : ""}`);
  const { from, to } = await resolveRange(params.from, params.to);
  const prev = previousRange(from, to);
  const scope = await resolveCampaignScope(params.camp);
  const camps = scope.ids;
  const adsAccess = await canSeeAds();

  let total: RollupRow | null = null;
  let previous: RollupRow | null = null;
  let days: RollupRow[] = [];
  let byCampaign: RollupRow[] = [];
  let catalog: Campaign[] = [];
  let options: CampaignOption[] = [];
  try {
    let t: RollupRow[];
    let p: RollupRow[];
    [t, p, days, byCampaign, catalog, options] = await Promise.all([
      getRollup(from, to, "total", camps),
      getRollup(prev.from, prev.to, "total", camps),
      getRollup(from, to, "day", camps),
      getRollup(from, to, "campaign", camps),
      getCampaigns(),
      getCampaignOptions(from, to),
    ]);
    total = t[0] ?? null;
    previous = p[0] ?? null;
  } catch (error) {
    logError("dashboard.resumen", error, { from, to, camps });
    return <><PageHeader title="Resumen" from={from} to={to} path="/" scope={scope} /><ErrorNote scope="dashboard.resumen" what="las métricas" /></>;
  }

  // Aviso solo si el RANGO elegido es corto (inicio de mes con "Este mes" o un rango a mano de pocos días):
  // con un rango largo (p. ej. "Mes pasado") el usuario ya pidió ver un período completo y no se avisa,
  // aunque la campaña lleve pocos días encendida dentro de él.
  const MIN_DAYS = 7;
  const rangeDays = Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000) + 1;
  const spendDays = days.filter((d) => d.spend > 0).length;
  const thinData = spendDays > 0 && rangeDays < MIN_DAYS;
  const daily = days.map((r) => ({ date: r.key, spend: r.spend, leads_ghl: r.leads_ghl, opps_appointment: r.opps_appointment }));
  const qs = `?from=${from}&to=${to}${campQuery(scope)}`;
  const leadsHref = (etapa?: string) => `/leads${qs}${etapa ? `&etapa=${etapa}` : ""}`;
  const header = <PageHeader title="Resumen" from={from} to={to} path="/" scope={scope} options={options} />;

  return (
    <div className="space-y-5">
      {header}

      {/* 1. Indicadores con variación vs. período anterior. El costo por cita manda: va destacado. */}
      <section>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          <Kpi label="Inversión" value={fmtMoney(total?.spend ?? 0)} hint={`CTR ${fmtPct(total?.ctr ?? null)}`}
            current={total?.spend} previous={previous?.spend} />
          <Kpi label="Leads reales" value={fmtInt(total?.leads_ghl ?? 0)} hint={`Meta: ${fmtInt(total?.leads_reported ?? 0)}`}
            current={total?.leads_ghl} previous={previous?.leads_ghl} href={leadsHref()} />
          <Kpi label="CPL real" value={fmtMoney(total?.cpl_real ?? null)} hint="Inversión ÷ leads GHL"
            current={total?.cpl_real} previous={previous?.cpl_real} lowerIsBetter />
          <Kpi label="Tasa de respuesta" value={fmtPct(total?.response_rate ?? null)} hint={`CPL resp. ${fmtMoney(total?.cpl_responded ?? null)}`}
            current={total?.response_rate} previous={previous?.response_rate} href={leadsHref("respondio")} />
          <Kpi label="Costo por cita" value={fmtMoney(total?.cost_per_appointment ?? null)} hint={`${fmtInt(total?.opps_appointment ?? 0)} citas`}
            current={total?.cost_per_appointment} previous={previous?.cost_per_appointment} lowerIsBetter accent href={leadsHref("cita")} />
          <Kpi label="Costo por ganado" value={fmtMoney(total?.cost_per_won ?? null)} hint={`${fmtInt(total?.opps_won ?? 0)} ganados`}
            current={total?.cost_per_won} previous={previous?.cost_per_won} lowerIsBetter href={leadsHref("ganado")} />
        </div>
        <p className="mt-2 text-xs text-ink-3">
          ▲▼ frente al {fmtDay(prev.from)} – {fmtDay(prev.to)}. En costos, bajar es bueno.
        </p>
        <NewCampaignsNote rows={mergeCampaigns(catalog, byCampaign).filter((c) => !camps.length || camps.includes(c.id))} className="mt-3" />
        {thinData && (
          <div role="note" className="mt-3 flex items-start gap-2.5 rounded-xl border border-warning-ink/30 bg-warning-soft px-4 py-3 text-sm text-ink">
            <svg viewBox="0 0 24 24" aria-hidden="true" className="mt-0.5 size-4 shrink-0 fill-current text-warning-ink">
              <path d="M1 21h22L12 2zm12-3h-2v-2h2zm0-4h-2v-4h2z" />
            </svg>
            <p>
              <strong>Pocos datos todavía:</strong> el rango elegido cubre solo{" "}
              <strong className="tabular-nums">{rangeDays} {rangeDays === 1 ? "día" : "días"}</strong>.
              Con tan pocos días, las variaciones ▲▼ y los costos por cita o por ganado pueden moverse mucho
              (de 2 a 4 leads ya es +100%). Tómalos como orientativos hasta tener al menos {MIN_DAYS} días.
            </p>
          </div>
        )}
      </section>

      {/* 2. Tendencia diaria: un gráfico por magnitud (sin doble eje) */}
      <section className="grid gap-5 lg:grid-cols-2">
        <Card title="Inversión diaria"><SpendChart data={daily} query={campQuery(scope)} campaignsLink={adsAccess} /></Card>
        <Card title="Leads y citas por día" aside={
          <div className="flex items-center gap-3 text-xs text-ink-2">
            <LegendDot color="var(--series-2)" label="Leads" />
            <LegendDot color="var(--series-3)" label="Citas" />
          </div>
        }>
          <LeadsChart data={daily} query={campQuery(scope)} />
        </Card>
      </section>

      {/* 3. Embudo + campañas */}
      <section className="grid gap-5 lg:grid-cols-3">
        <Card title="Embudo"><Funnel total={total} /></Card>
        <Card title="Campañas" className="lg:col-span-2" flush
          aside={adsAccess ? <Link href={`/campanas${qs}`} className="text-xs font-medium text-accent hover:underline">Gestionar →</Link> : null}>
          <CampaignsTable rows={mergeCampaigns(catalog, byCampaign).filter((c) => c.catalog?.status === "ACTIVE" || (c.metrics?.spend ?? 0) > 0)} limit={5}
            leadsHref={(id, etapa) => `/leads?from=${from}&to=${to}&camp=${id}${etapa ? `&etapa=${etapa}` : ""}`} />
        </Card>
      </section>
    </div>
  );
}
