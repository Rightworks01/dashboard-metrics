import Link from "next/link";
import { Card, ErrorNote, Kpi, PageHeader } from "@/app/_components/ui";
import { fmtDuration, fmtInt, fmtPct } from "@/lib/format";
import { logError } from "@/lib/log";
import { getCampaignOptions, campQuery, resolveCampaignScope, resolveRange } from "@/lib/metrics";
import { getResponseData } from "@/lib/response";

export const dynamic = "force-dynamic";
export const metadata = { title: "Respuesta · Right Works" };

type SearchParams = Promise<{ from?: string; to?: string; camp?: string }>;

const ratio = (a: number, b: number) => (b > 0 ? a / b : null);
const KIND: Record<string, string> = { sms: "SMS", email: "Email", whatsapp: "WhatsApp", call: "Llamada", fb: "Facebook", ig: "Instagram" };

function RateBar({ value }: { value: number | null }) {
  return (
    <div className="flex items-center justify-end gap-2">
      <div className="hidden h-1.5 w-24 overflow-hidden rounded-full bg-surface-2 sm:block">
        <div className="h-full rounded-full bg-accent" style={{ width: `${Math.round((value ?? 0) * 100)}%` }} />
      </div>
      <span className="w-12 text-right font-medium text-ink">{fmtPct(value)}</span>
    </div>
  );
}

export default async function RespuestaPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const { from, to } = await resolveRange(params.from, params.to);
  const scope = await resolveCampaignScope(params.camp);
  const camps = scope.ids;
  const qs = `from=${from}&to=${to}${campQuery(scope)}`;

  try {
    const [data, options] = await Promise.all([getResponseData(from, to, camps), getCampaignOptions(from, to)]);
    const t = data.total;
    return (
      <div className="space-y-5">
        <PageHeader title="Respuesta" from={from} to={to} path="/respuesta" scope={scope} options={options}
          description="Seguimiento de leads de Meta" />

        <section className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
          <Kpi label="1er contacto humano (mediana)" value={t.median_first_ms != null ? fmtDuration(t.median_first_ms) : "—"}
            hint="Desde que entra el lead" accent />
          <Kpi label="Contactados en ≤ 5 min" value={fmtPct(ratio(t.under_5min, t.leads))} hint={`${fmtInt(t.under_5min)} de ${fmtInt(t.leads)}`} />
          <Kpi label="Contactados por un agente" value={fmtPct(ratio(t.contacted, t.leads))} hint={`${fmtInt(t.contacted)} leads`} />
          <Kpi label="Sin contacto humano" value={fmtInt(t.no_contact)} hint={`${fmtInt(t.no_contact_24h)} con más de 24 h`}
            href={`/leads?${qs}&etapa=sin_contacto`} />
          <Kpi label="El lead respondió" value={fmtPct(ratio(t.responded, t.leads))} hint={`${fmtInt(t.responded)} leads`}
            href={`/leads?${qs}&etapa=respondio`} />
        </section>
        <p className="-mt-2 text-xs text-ink-3">
          Contacto humano = primer mensaje o llamada de un agente. No cuentan workflows, campañas ni envíos masivos de GHL.
        </p>

        <Card title="Por agente" flush subtitle="Agente asignado al lead en GHL. Pulsa un nombre para ver sus leads.">
          <div className="relative overflow-x-auto">
            <table className="w-full text-right text-sm tabular-nums">
              <thead className="border-y border-line bg-surface-2/60 text-xs text-ink-3">
                <tr>
                  <th className="px-5 py-2.5 text-left font-medium">Agente</th>
                  <th className="px-3 py-2.5 font-medium">Leads</th>
                  <th className="px-3 py-2.5 font-medium">1er contacto (mediana)</th>
                  <th className="px-3 py-2.5 font-medium">≤ 5 min</th>
                  <th className="px-3 py-2.5 font-medium">Contactados</th>
                  <th className="px-3 py-2.5 font-medium">Sin contacto</th>
                  <th className="px-5 py-2.5 font-medium">Respondieron</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {data.agents.map((a) => (
                  <tr key={a.agent_id ?? "none"} className="hover:bg-surface-2/50">
                    <td className="px-5 py-2.5 text-left">
                      {a.agent_id
                        ? <Link href={`/leads?${qs}&agente=${a.agent_id}`} className="font-medium text-ink hover:text-accent">{a.agent_name}</Link>
                        : <span className="text-ink-3">{a.agent_name}</span>}
                    </td>
                    <td className="px-3 py-2.5">{fmtInt(a.leads)}</td>
                    <td className="px-3 py-2.5 text-ink">{a.median_first_ms != null ? fmtDuration(a.median_first_ms) : "—"}</td>
                    <td className="px-3 py-2.5">{fmtPct(ratio(a.under_5min, a.leads))}</td>
                    <td className="px-3 py-2.5">{fmtPct(ratio(a.contacted, a.leads))}</td>
                    <td className="px-3 py-2.5">
                      {a.no_contact > 0 && a.agent_id
                        ? <Link href={`/leads?${qs}&agente=${a.agent_id}&etapa=sin_contacto`} className="font-medium text-critical hover:underline">{fmtInt(a.no_contact)}</Link>
                        : fmtInt(a.no_contact)}
                    </td>
                    <td className="px-5 py-2.5">{fmtPct(ratio(a.responded, a.leads))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <section className="grid gap-5 xl:grid-cols-2">
          <Card title="¿Qué mensajes responden los leads?" flush
            subtitle="Mensajes automáticos de la secuencia (sin recordatorios de cita): % de leads que contestan en 48 h.">
            {data.sequence.length === 0 ? <p className="px-5 pb-5 text-sm text-ink-3">Sin mensajes automáticos en este rango.</p> : (
              <div className="relative overflow-x-auto">
                <table className="w-full text-sm tabular-nums">
                  <thead className="border-y border-line bg-surface-2/60 text-xs text-ink-3">
                    <tr>
                      <th className="px-5 py-2.5 text-left font-medium">Mensaje</th>
                      <th className="px-3 py-2.5 text-right font-medium">Leads</th>
                      <th className="px-5 py-2.5 text-right font-medium">Respondieron</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {data.sequence.map((s) => (
                      <tr key={s.template}>
                        <td className="max-w-80 px-5 py-2.5">
                          <span className="block truncate text-ink" title={s.template}>{s.template}…</span>
                          <span className="text-xs text-ink-3">{KIND[s.kind ?? ""] ?? s.kind}</span>
                        </td>
                        <td className="px-3 py-2.5 text-right">{fmtInt(s.leads_sent)}</td>
                        <td className="px-5 py-2.5"><RateBar value={s.reply_rate} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <Card title="Llamadas" flush
            subtitle="Salientes del agente y llamadas perdidas del lead (no contestadas o buzón) que luego se devolvieron.">
            {data.calls.length === 0 ? <p className="px-5 pb-5 text-sm text-ink-3">Sin llamadas en este rango.</p> : (
              <div className="relative overflow-x-auto">
                <table className="w-full text-right text-sm tabular-nums">
                  <thead className="border-y border-line bg-surface-2/60 text-xs text-ink-3">
                    <tr>
                      <th className="px-5 py-2.5 text-left font-medium">Agente</th>
                      <th className="px-3 py-2.5 font-medium">Salientes</th>
                      <th className="px-3 py-2.5 font-medium">Contestadas</th>
                      <th className="px-3 py-2.5 font-medium" title="Duración media de las contestadas">Duración</th>
                      <th className="px-3 py-2.5 font-medium">Perdidas del lead</th>
                      <th className="px-5 py-2.5 font-medium" title="Perdidas devueltas por un agente (llamada o mensaje) y mediana del tiempo">Devueltas</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {data.calls.map((c) => (
                      <tr key={c.agent_id ?? "none"}>
                        <td className="px-5 py-2.5 text-left text-ink">{c.agent_name}</td>
                        <td className="px-3 py-2.5">{fmtInt(c.outbound)}</td>
                        <td className="px-3 py-2.5">{fmtInt(c.answered)} <span className="text-xs text-ink-3">{fmtPct(ratio(c.answered, c.outbound))}</span></td>
                        <td className="px-3 py-2.5 text-ink-2">{c.avg_answered_s != null ? fmtDuration(c.avg_answered_s * 1000) : "—"}</td>
                        <td className="px-3 py-2.5">{fmtInt(c.missed_inbound)}</td>
                        <td className="whitespace-nowrap px-5 py-2.5">
                          {c.missed_inbound > 0 ? (
                            <>
                              {fmtInt(c.missed_returned)}/{fmtInt(c.missed_inbound)}
                              {c.median_return_s != null && <span className="ml-1 text-xs text-ink-3">en {fmtDuration(c.median_return_s * 1000)}</span>}
                            </>
                          ) : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="border-t border-line px-5 py-2 text-xs text-ink-3">
                  "Contestada" = GHL la marcó como completada; las de pocos segundos suelen ser buzón.
                </p>
              </div>
            )}
          </Card>
        </section>
      </div>
    );
  } catch (error) {
    logError("dashboard.respuesta", error, { from, to, camps });
    return (
      <>
        <PageHeader title="Respuesta" from={from} to={to} path="/respuesta" scope={scope} />
        <ErrorNote scope="dashboard.respuesta" what="las estadísticas de respuesta" />
      </>
    );
  }
}
