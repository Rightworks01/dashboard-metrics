import { accesoA } from "@cuentas/roles";
import { saveWinValue } from "@cuentas/acciones";
import { Card, ErrorNote, NoAccessNote, PageHeader } from "@visual/componentes/ui";
import { ReportTabs } from "@visual/componentes/report-tabs";
import { PrintButton, WinValueForm } from "@base/acciones/report-actions";
import { ReportForm } from "@base/acciones/report-form";
import { myAccess, agentScope } from "@cuentas/auth";
import { fmtDay, fmtInt, fmtMoney, fmtPct, pctChange, fmtSignedPct, titleCase } from "@base/util/format";
import { logError } from "@base/conexiones/log";
import { getCampaignOptions, resolveCampaignScope, resolveRange } from "@base/datos/metrics";
import { buildReport, FUNDING, getCrmUsers, parseReportParams, recoveredText, type Recovery, type Report } from "@base/datos/report";

export const dynamic = "force-dynamic";
export const metadata = { title: "Reportes · Right Works" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function ReportesPage({ searchParams }: { searchParams: SearchParams }) {
  const scopeAgent = await agentScope(); // Capa 3: null = la cuenta ve todo
  if (!(await accesoA("reportes"))) return <NoAccessNote what="Reportes" />;
  const raw = await searchParams;
  const { from, to } = await resolveRange(one(raw.from), one(raw.to));
  const scope = await resolveCampaignScope(one(raw.camp));
  const params = parseReportParams(raw);
  const generate = one(raw.g) === "1";

  let agents: { id: string; name: string }[] = [];
  let options: Awaited<ReturnType<typeof getCampaignOptions>> = [];
  let report: Report | null = null;
  try {
    [agents, options] = await Promise.all([getCrmUsers(), getCampaignOptions(from, to, scopeAgent)]);
    if (generate) report = await buildReport(from, to, scope.ids, params);
  } catch (error) {
    logError("dashboard.reportes", error, { from, to });
    return <><PageHeader title="Reportes" from={from} to={to} path="/reportes" scope={scope} /><ErrorNote scope="dashboard.reportes" what="el reporte" /></>;
  }

  const query = new URLSearchParams();
  for (const [k, v] of Object.entries(raw)) for (const x of Array.isArray(v) ? v : v !== undefined ? [v] : []) query.append(k, x);
  const csvHref = `/reportes/csv?${query.toString()}`;

  return (
    <div className="space-y-5">
      <div className="print:hidden">
        <PageHeader title="Reportes" description="elige período y campañas arriba" from={from} to={to} path="/reportes" scope={scope} options={options} />
        <div className="mt-4"><ReportTabs active="inversion" query={new URLSearchParams({ from, to, ...(scope.param ? { camp: scope.param } : {}) }).toString()} /></div>
      </div>
      <ReportForm from={from} to={to} camp={scope.param} agents={agents}
        initial={{
          funding: params.funding,
          rows: params.investors.map((i) => ({ name: i.name, amount: i.amount?.toString() ?? "", agentId: i.agentId ?? "" })),
          vmin: params.valueMin?.toString() ?? "", vmax: params.valueMax?.toString() ?? "",
        }} />
      {report && <ReportView report={report} csvHref={csvHref} campaignsLabel={scope.mode === "todas" ? "todas las campañas" : scope.mode === "activas" ? "campañas activas" : `${scope.ids.length} campañas elegidas`} />}
    </div>
  );
}

const th = "px-3 py-2.5 font-medium";
const td = "px-3 py-2.5";

function RecoveryCell({ r }: { r: Recovery }) {
  return (
    <span className="tabular-nums">
      {recoveredText(r)}
      {r.scenario && r.unknownWins > 0 && <span className="block text-xs text-ink-3">esperado {fmtMoney(r.scenario.mid)}</span>}
    </span>
  );
}

function ReportView({ report: r, csvHref, campaignsLabel }: { report: Report; csvHref: string; campaignsLabel: string }) {
  const t = r.total;
  const leads = t?.leads_ghl ?? 0;
  const multiAgent = r.agents.filter((a) => a.leads > 0).length > 1;
  const shared = r.params.funding === "compartida" && r.investors.length > 1;
  const funnel = [
    { label: "Inversión", value: fmtMoney(r.investment), cost: null as string | null },
    { label: "Leads reales", value: fmtInt(leads), cost: fmtMoney(t?.cpl_real ?? null) },
    { label: "Respondieron", value: fmtInt(r.totals.responded), cost: fmtMoney(r.totals.responded ? r.investment / r.totals.responded : null) },
    { label: "Citas", value: fmtInt(r.totals.citas), cost: fmtMoney(r.totals.citas ? r.investment / r.totals.citas : null) },
    { label: "Asistieron", value: fmtInt(r.totals.showed), cost: fmtMoney(r.totals.showed ? r.investment / r.totals.showed : null) },
    { label: "Ganados", value: fmtInt(r.totals.wins), cost: fmtMoney(r.breakEvenPerWin) },
  ];
  const delta = (cur?: number | null, prev?: number | null) => {
    const c = pctChange(cur, prev);
    return c === null ? "" : ` (${fmtSignedPct(c)} vs. período anterior)`;
  };

  return (
    <article className="space-y-5">
      {/* Encabezado del reporte (también en el PDF) */}
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-line pb-3">
        <div>
          <p className="text-xs uppercase tracking-wide text-ink-3">Reporte de campañas · Right Works</p>
          <h2 className="text-lg font-semibold text-ink">{fmtDay(r.from)} – {fmtDay(r.to)} · {campaignsLabel}</h2>
          <p className="text-xs text-ink-3">Inversión: {FUNDING[r.params.funding]} · generado el {new Date().toLocaleDateString("es-US", { dateStyle: "long" })}</p>
        </div>
        <div className="flex gap-2 print:hidden">
          <a href={csvHref} className="inline-flex items-center rounded-lg border border-line px-3 py-1.5 text-sm font-medium text-ink-2 hover:bg-surface-2">Excel / CSV</a>
          <PrintButton />
        </div>
      </div>

      {/* A. Resumen ejecutivo */}
      <Card title="Resumen">
        <p className="text-[15px] leading-relaxed text-ink">{r.summary}</p>
        {r.bullets.length > 0 && (
          <ul className="mt-3 space-y-1.5 text-sm">
            {r.bullets.map((b, i) => (
              <li key={i} className="flex gap-2">
                <span aria-hidden="true">{b.tone === "good" ? "✅" : b.tone === "warn" ? "⚠️" : "ℹ️"}</span>
                <span className="text-ink-2">{b.text}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* B. Embudo */}
      <Card title="Embudo e indicadores" subtitle={`Costo de cada etapa sobre ${fmtMoney(r.investment)} invertidos. En "Ganados", el costo es lo que debe dejar cada ganado para recuperar la inversión.`}>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {funnel.map((f) => (
            <div key={f.label} className="rounded-lg bg-surface-2 px-3 py-2.5">
              <p className="text-xs text-ink-3">{f.label}</p>
              <p className="text-lg font-semibold tabular-nums text-ink">{f.value}</p>
              {f.cost && <p className="text-xs tabular-nums text-ink-3">{f.cost} c/u</p>}
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs text-ink-3">
          Leads{delta(leads, r.previous?.leads_ghl)} · CPL real {fmtMoney(t?.cpl_real ?? null)}{delta(t?.cpl_real, r.previous?.cpl_real)} ·
          Meta reporta {fmtInt(t?.leads_reported ?? 0)} leads · CTR {fmtPct(t?.ctr ?? null)}
        </p>
      </Card>

      {/* C. Por agente */}
      {multiAgent && (
        <Card title="Resultados por agente" flush>
          <div className="relative overflow-x-auto">
            <table className="w-full text-right text-sm tabular-nums">
              <thead className="border-y border-line bg-surface-2/60 text-xs text-ink-3">
                <tr>
                  <th className={`${th} pl-5 text-left`}>Agente</th><th className={th}>Leads</th><th className={th}>Contactado ≤ 5 min</th>
                  <th className={th}>Sin contacto +24 h</th><th className={th}>Respondieron</th><th className={th}>Citas</th>
                  <th className={th}>Asistieron</th><th className={th}>Ganados</th><th className={th}>Lead → ganado</th><th className={`${th} pr-5`}>Recuperado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {r.agents.map((a) => (
                  <tr key={a.agent_id || "sin"}>
                    <td className={`${td} pl-5 text-left font-medium text-ink`}>{a.agent_name ?? (a.agent_id ? a.agent_id : "Sin agente")}</td>
                    <td className={td}>{fmtInt(a.leads)}</td>
                    <td className={td}>{fmtPct(a.leads ? a.contacted_5min / a.leads : null)}</td>
                    <td className={`${td} ${a.no_contact_24h ? "text-critical" : ""}`}>{fmtInt(a.no_contact_24h)}</td>
                    <td className={td}>{fmtInt(a.responded)}</td>
                    <td className={td}>{fmtInt(a.citas)}</td>
                    <td className={td}>{fmtInt(a.showed)}</td>
                    <td className={td}>{fmtInt(a.won)}</td>
                    <td className={td}>{fmtPct(a.leads ? a.won / a.leads : null)}</td>
                    <td className={`${td} pr-5`}><RecoveryCell r={{ real: a.won_value, wins: a.won, unknownWins: a.won_without_value,
                      scenario: r.params.valueMin !== null && r.params.valueMax !== null ? {
                        low: a.won_value + a.won_without_value * r.params.valueMin,
                        mid: a.won_value + a.won_without_value * ((r.params.valueMin + r.params.valueMax) / 2),
                        high: a.won_value + a.won_without_value * r.params.valueMax } : null }} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* D. Inversión y recuperación */}
      <Card title={shared ? "Inversión y recuperación por inversionista" : "Inversión y recuperación"} flush
        subtitle={shared ? "Proporcional: cada uno recupera según el % que puso. Según quién cerró: lo que cerraron los leads de su agente." : undefined}>
        <div className="relative overflow-x-auto">
          <table className="w-full text-right text-sm tabular-nums">
            <thead className="border-y border-line bg-surface-2/60 text-xs text-ink-3">
              <tr>
                <th className={`${th} pl-5 text-left`}>{shared ? "Inversionista" : "Quién invirtió"}</th><th className={th}>Invirtió</th>
                {shared && <th className={th}>%</th>}
                <th className={th}>Equilibrio por ganado</th><th className={th}>Recuperado {shared ? "(proporcional)" : ""}</th>
                {shared && <th className={th}>Según quién cerró</th>}
                <th className={`${th} pr-5`}>Retorno</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {r.investors.map((inv, i) => {
                const rec = inv.proportional;
                const known = rec.unknownWins === 0 ? rec.real : rec.scenario?.mid ?? null;
                return (
                  <tr key={i}>
                    <td className={`${td} pl-5 text-left font-medium text-ink`}>{inv.name}</td>
                    <td className={td}>{fmtMoney(inv.invested)}</td>
                    {shared && <td className={td}>{fmtPct(inv.share)}</td>}
                    <td className={td}>{inv.breakEvenPerWin !== null ? fmtMoney(inv.breakEvenPerWin) : `${fmtMoney(inv.invested)} el 1º`}</td>
                    <td className={td}><RecoveryCell r={rec} /></td>
                    {shared && <td className={td}><RecoveryCell r={inv.byCloser} /><span className="block text-xs text-ink-3">{inv.closerLabel}</span></td>}
                    <td className={`${td} pr-5`}>{known !== null && inv.invested > 0 && rec.wins > 0 ? fmtPct(known / inv.invested) : "—"}</td>
                  </tr>
                );
              })}
              {shared && (
                <tr className="font-semibold">
                  <td className={`${td} pl-5 text-left text-ink`}>Total</td>
                  <td className={td}>{fmtMoney(r.investment)}</td><td className={td}>100 %</td>
                  <td className={td}>{r.breakEvenPerWin !== null ? fmtMoney(r.breakEvenPerWin) : "—"}</td>
                  <td className={td}><RecoveryCell r={r.recovery} /></td><td className={td} /><td className={`${td} pr-5`} />
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="border-t border-line px-5 py-3 text-xs text-ink-3">
          "Equilibrio por ganado" = cuánto tiene que dejar cada ganado para recuperar lo invertido. "Recuperado" suma el valor real
          cargado en los ganados{r.params.valueMin !== null ? ` y, para los que no lo tienen, el rango estimado de ${fmtMoney(r.params.valueMin)} a ${fmtMoney(r.params.valueMax)}` : ""}.
          {r.recovery.unknownWins > 0 && " Carga el valor real de cada ganado abajo para que el reporte deje de estimar."}
        </p>
      </Card>

      {/* E. Detalle */}
      <Card title="Por campaña" flush>
        <div className="relative overflow-x-auto">
          <table className="w-full text-right text-sm tabular-nums">
            <thead className="border-y border-line bg-surface-2/60 text-xs text-ink-3">
              <tr><th className={`${th} pl-5 text-left`}>Campaña</th><th className={th}>Gasto</th><th className={th}>Leads Meta</th><th className={th}>Leads GHL</th>
                <th className={th}>CPL real</th><th className={th}>Citas</th><th className={th}>Costo/cita</th><th className={`${th} pr-5`}>Ganados</th></tr>
            </thead>
            <tbody className="divide-y divide-line">
              {r.campaigns.map((c) => (
                <tr key={c.id}>
                  <td className={`${td} pl-5 text-left font-medium text-ink`}>{c.name}</td>
                  <td className={td}>{fmtMoney(c.row.spend)}</td><td className={td}>{fmtInt(c.row.leads_reported)}</td><td className={td}>{fmtInt(c.row.leads_ghl)}</td>
                  <td className={td}>{fmtMoney(c.row.cpl_real)}</td><td className={td}>{fmtInt(c.row.opps_appointment)}</td>
                  <td className={td}>{fmtMoney(c.row.cost_per_appointment)}</td><td className={`${td} pr-5`}>{fmtInt(c.row.opps_won)}</td>
                </tr>
              ))}
              {r.campaigns.length === 0 && <tr><td colSpan={8} className="px-5 py-4 text-left text-ink-3">Sin gasto ni leads en el período.</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>

      <Card title="Por anuncio" flush>
        <div className="relative overflow-x-auto">
          <table className="w-full text-right text-sm tabular-nums">
            <thead className="border-y border-line bg-surface-2/60 text-xs text-ink-3">
              <tr><th className={`${th} pl-5 text-left`}>Anuncio</th><th className={th}>Gasto</th><th className={th}>Leads Meta</th><th className={th}>Leads GHL</th>
                <th className={th}>CPL real</th><th className={th}>Citas</th><th className={th}>Costo/cita</th><th className={`${th} pr-5`}>Ganados</th></tr>
            </thead>
            <tbody className="divide-y divide-line">
              {r.ads.filter((a) => a.spend > 0 || a.leads_ghl > 0).map((a) => (
                <tr key={a.key}>
                  <td className={`${td} pl-5 text-left font-mono text-xs text-ink-2`}>{a.key}</td>
                  <td className={td}>{fmtMoney(a.spend)}</td><td className={td}>{fmtInt(a.leads_reported)}</td><td className={td}>{fmtInt(a.leads_ghl)}</td>
                  <td className={td}>{fmtMoney(a.cpl_real)}</td><td className={td}>{fmtInt(a.opps_appointment)}</td>
                  <td className={td}>{fmtMoney(a.cost_per_appointment)}</td><td className={`${td} pr-5`}>{fmtInt(a.opps_won)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card title={`Ganados · ${fmtInt(r.wins.length)}`} flush
        subtitle="Carga aquí el valor real de cada ganado cuando se conozca (comisión, venta). Solo admins; los agentes no tienen que cargar nada.">
        <div className="relative overflow-x-auto">
          <table className="w-full text-right text-sm tabular-nums">
            <thead className="border-y border-line bg-surface-2/60 text-xs text-ink-3">
              <tr><th className={`${th} pl-5 text-left`}>Lead</th><th className={`${th} text-left`}>Agente</th><th className={`${th} text-left`}>Campaña</th>
                <th className={th}>Ganado</th><th className={th}>Valor</th><th className={`${th} pr-5 print:hidden`}>Valor real</th></tr>
            </thead>
            <tbody className="divide-y divide-line">
              {r.wins.map((w) => (
                <tr key={w.opportunity_id}>
                  <td className={`${td} pl-5 text-left font-medium text-ink`}>{w.contact_name ? titleCase(w.contact_name) : "—"}</td>
                  <td className={`${td} text-left text-ink-2`}>{w.agent_name ?? "Sin agente"}</td>
                  <td className={`${td} max-w-56 truncate text-left text-ink-2`} title={w.campaign_name ?? ""}>{w.campaign_name ?? "—"}</td>
                  <td className={td}>{w.won_at ? fmtDay(w.won_at.slice(0, 10)) : "—"}</td>
                  <td className={td}>{w.value !== null ? <>{fmtMoney(w.value)}<span className="block text-xs text-ink-3">{w.source === "manual" ? "cargado" : "de GHL"}</span></> : <span className="text-ink-3">sin valor</span>}</td>
                  <td className={`${td} pr-5 print:hidden`}><WinValueForm opportunityId={w.opportunity_id} value={w.value_manual} save={saveWinValue} /></td>
                </tr>
              ))}
              {r.wins.length === 0 && <tr><td colSpan={6} className="px-5 py-4 text-left text-ink-3">Todavía no hay ganados de los leads de este período.</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>
    </article>
  );
}

