import Link from "next/link";
import type { ReactNode } from "react";
import type { AgentFollowup, CampaignFollowup, FollowupAppointment, FollowupLead, FollowupReport, Tally } from "@base/datos/followup";
import type { AppointmentPhase } from "@base/util/appointments";
import { fmtDay, fmtDuration, fmtInt, fmtPct, titleCase } from "@base/util/format";
import { AppointmentBadge } from "@visual/componentes/appointment-status";
import { LocalTime } from "@visual/componentes/local-time";
import { Card } from "@visual/componentes/ui";

// Reporte de seguimiento en el CRM. Solo presentación: los datos los arma buildFollowupReport (Capa 1);
// los botones (CSV, PDF) y los enlaces llegan por props.

const th = "px-3 py-2.5 font-medium";
const td = "px-3 py-2.5";
const pct = (n: number, d: number) => (d ? fmtPct(n / d) : "—");
const dur = (ms: number | null) => (ms === null ? "—" : fmtDuration(ms));
const minutes = (s: number) => (s ? fmtDuration(s * 1000) : "—");
const name = (l: FollowupLead) => (l.name ? titleCase(l.name) : "Sin nombre");

const PHASE_LABEL: Record<AppointmentPhase, string> = {
  pendiente: "Pendientes", asistio: "Asistieron", no_asistio: "No asistieron", paso: "Pasaron sin marcar", cancelada: "Canceladas",
};
const PHASE_ORDER: AppointmentPhase[] = ["pendiente", "asistio", "no_asistio", "paso", "cancelada"];

/** Tarjeta de cifra. Con `href`, lleva a donde está el detalle (otra sección o una lista ya filtrada). */
function Stat({ label, value, hint, critical, href }: { label: string; value: string; hint?: string; critical?: boolean; href?: string }) {
  const body = (
    <>
      <p className="flex items-start justify-between gap-2 text-xs text-ink-3">
        {label}
        {href && <span aria-hidden="true" className="text-ink-3 transition-transform group-hover:translate-x-0.5 group-hover:text-accent">→</span>}
      </p>
      <p className={`text-lg font-semibold tabular-nums ${critical ? "text-critical" : "text-ink"}`}>{value}</p>
      {hint && <p className="text-xs tabular-nums text-ink-3">{hint}</p>}
    </>
  );
  const base = `block rounded-lg bg-surface-2 px-3 py-2.5 ${critical ? "ring-1 ring-critical/40" : ""}`;
  if (!href) return <div className={base}>{body}</div>;
  return (
    <Link href={href} className={`group ${base} transition duration-150 hover:-translate-y-0.5 hover:bg-surface hover:shadow-md hover:ring-1 ${
      critical ? "hover:ring-critical/70" : "hover:ring-accent/50"} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent print:transform-none`}>
      {body}
    </Link>
  );
}

function Table({ head, children }: { head: ReactNode; children: ReactNode }) {
  return (
    <div className="relative overflow-x-auto">
      <table className="w-full text-right text-sm tabular-nums">
        <thead className="border-y border-line bg-surface-2/60 text-xs text-ink-3"><tr>{head}</tr></thead>
        <tbody className="divide-y divide-line">{children}</tbody>
      </table>
    </div>
  );
}

/** Columnas comunes de seguimiento (por agente y por campaña). */
function TallyCells({ t }: { t: Tally }) {
  return (
    <>
      <td className={td}>{fmtInt(t.leads)}</td>
      <td className={td}>{fmtInt(t.contacted)} <span className="text-xs text-ink-3">{pct(t.contacted, t.leads)}</span></td>
      <td className={td}>{dur(t.medianFirstMs)}</td>
      <td className={td}>{pct(t.under5, t.contacted)}</td>
      <td className={`${td} ${t.noContact24h ? "font-medium text-critical" : ""}`}>{fmtInt(t.noContact)}{t.noContact24h ? <span className="text-xs"> ({fmtInt(t.noContact24h)} +24 h)</span> : null}</td>
      <td className={td}>{fmtInt(t.responded)} <span className="text-xs text-ink-3">{pct(t.responded, t.leads)}</span></td>
      <td className={td}>{fmtInt(t.humanMsgs)}</td>
      <td className={td}>{fmtInt(t.callsOut)}{t.callsOut ? <span className="text-xs text-ink-3"> ({fmtInt(t.callsAnswered)} contest.)</span> : null}</td>
      <td className={td}>{minutes(t.callSeconds)}</td>
      <td className={`${td} ${t.missedUnreturned ? "font-medium text-critical" : ""}`}>{fmtInt(t.missedUnreturned)}</td>
      <td className={td}>{fmtInt(t.withCita)} <span className="text-xs text-ink-3">{pct(t.withCita, t.leads)}</span></td>
      <td className={td}>{fmtInt(t.won)}</td>
    </>
  );
}
const TALLY_HEAD = ["Leads", "Contacto humano", "1er contacto (mediana)", "≤ 5 min", "Sin contacto", "Respondieron", "Mensajes del agente", "Llamadas salientes", "Tiempo en llamada", "Perdidas sin devolver", "Con cita", "Ganados"];

function LeadList({ rows, leadHref, empty, extra }: {
  rows: FollowupLead[]; leadHref: (id: string) => string; empty: string; extra?: (l: FollowupLead) => ReactNode;
}) {
  if (rows.length === 0) return <p className="px-5 pb-5 text-sm text-ink-3">{empty}</p>;
  return (
    <Table head={<><th className={`${th} pl-5 text-left`}>Lead</th><th className={th}>Entró</th><th className={`${th} text-left`}>Agente</th><th className={`${th} text-left`}>Etapa</th><th className={`${th} pr-5 text-left`}>Detalle</th></>}>
      {rows.slice(0, 50).map((l) => (
        <tr key={l.id}>
          <td className={`${td} pl-5 text-left`}><Link href={leadHref(l.id)} className="font-medium text-accent hover:underline">{name(l)}</Link></td>
          <td className={td}><LocalTime iso={l.created_at} /></td>
          <td className={`${td} text-left`}>{l.agent_name ?? "Sin asignar"}</td>
          <td className={`${td} text-left text-ink-2`}>{l.stage ?? "—"}</td>
          <td className={`${td} pr-5 text-left text-ink-2`}>{extra?.(l)}</td>
        </tr>
      ))}
      {rows.length > 50 && <tr><td colSpan={5} className="px-5 py-2.5 text-left text-xs text-ink-3">…y {fmtInt(rows.length - 50)} más (todos en el CSV).</td></tr>}
    </Table>
  );
}

function AppointmentList({ rows, leadHref }: { rows: FollowupAppointment[]; leadHref: (id: string) => string }) {
  if (rows.length === 0) return <p className="px-5 pb-5 text-sm text-ink-3">No hay citas en el calendario para los leads de este período.</p>;
  return (
    <Table head={<><th className={`${th} pl-5 text-left`}>Lead</th><th className={`${th} text-left`}>Fecha y hora</th><th className={`${th} text-left`}>Responsable</th><th className={`${th} text-left`}>Estado</th><th className={`${th} pr-5 text-left`}>Cita</th></>}>
      {rows.map((a) => (
        <tr key={a.appointment_id}>
          <td className={`${td} pl-5 text-left`}><Link href={leadHref(a.contact_id)} className="font-medium text-accent hover:underline">{a.contact_name_display}</Link></td>
          <td className={`${td} text-left`}>{a.start_time ? <LocalTime iso={a.start_time} showZone /> : "—"}</td>
          <td className={`${td} text-left`}>{a.owner_name ?? "Sin responsable"}</td>
          <td className={`${td} text-left`}><AppointmentBadge start={a.start_time} status={a.status} /></td>
          <td className={`${td} pr-5 text-left text-ink-2`}>{a.title ?? "—"}</td>
        </tr>
      ))}
    </Table>
  );
}

/**
 * `leadsHref(etapa)` = lista de Leads con el mismo período y campañas (etapa: contactado, respondio, cita, ganado,
 * sin_contacto; sin etapa = todos). `respuestaHref(seccion)` = página Respuesta (por-agente, mensajes, llamadas).
 */
export function FollowupReportView({ report: r, campaignsLabel, actions, leadHref, leadsHref, respuestaHref }: {
  report: FollowupReport; campaignsLabel: string; actions?: ReactNode; leadHref: (contactId: string) => string;
  leadsHref: (etapa?: string) => string; respuestaHref: (section?: string) => string;
}) {
  const t = r.total;
  const totalAppts = r.appointments.length;
  const funnel = [
    { label: "Leads", value: t.leads, href: leadsHref() },
    { label: "Contacto humano", value: t.contacted, href: leadsHref("contactado") },
    { label: "Respondieron", value: t.responded, href: leadsHref("respondio") },
    { label: "Con cita", value: t.withCita, href: leadsHref("cita") },
    { label: "Asistieron", value: r.appointmentsByPhase.asistio, href: "#citas" },
    { label: "Ganados", value: t.won, href: leadsHref("ganado") },
  ];

  return (
    <article className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-line pb-3">
        <div>
          <p className="text-xs uppercase tracking-wide text-ink-3">Reporte de seguimiento en el CRM · Right Works</p>
          <h2 className="text-lg font-semibold text-ink">Leads que entraron del {fmtDay(r.from)} al {fmtDay(r.to)} · {campaignsLabel}</h2>
          <p className="text-xs text-ink-3">Generado el <LocalTime iso={r.generatedAt} /> · leads de Meta, por fecha de entrada</p>
        </div>
        {actions && <div className="flex gap-2 print:hidden">{actions}</div>}
      </div>

      {/* Resumen en texto */}
      <Card title="Resumen">
        <ul className="space-y-1.5 text-[15px] leading-relaxed text-ink">
          {r.summary.map((s, i) => <li key={i}>{s}</li>)}
        </ul>
        {r.notes.length > 0 && (
          <ul className="mt-3 space-y-1.5 text-sm">
            {r.notes.map((n, i) => (
              <li key={i} className="flex gap-2"><span aria-hidden="true">⚠️</span><span className="text-ink-2">{n}</span></li>
            ))}
          </ul>
        )}
      </Card>

      {/* Indicadores */}
      <Card title="Contacto y respuesta">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <Stat label="Leads" value={fmtInt(t.leads)} href={leadsHref()} />
          <Stat label="Con contacto humano" value={fmtInt(t.contacted)} hint={pct(t.contacted, t.leads)} href={leadsHref("contactado")} />
          <Stat label="Sin contacto humano" value={fmtInt(t.noContact)} hint={t.noContact24h ? `${fmtInt(t.noContact24h)} con más de 24 h` : undefined} critical={t.noContact24h > 0} href={leadsHref("sin_contacto")} />
          <Stat label="1er contacto (mediana)" value={dur(t.medianFirstMs)} hint={t.contacted ? `${pct(t.under5, t.contacted)} en ≤ 5 min` : undefined} href={respuestaHref("por-agente")} />
          <Stat label="Respondieron" value={fmtInt(t.responded)} hint={pct(t.responded, t.leads)} href={leadsHref("respondio")} />
          <Stat label="Respondieron sin respuesta humana" value={fmtInt(t.respondedNoHuman)} critical={t.respondedNoHuman > 0} href="#respondieron-sin-respuesta" />
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <Stat label="Mensajes de agentes" value={fmtInt(t.humanMsgs)} href="#por-agente" />
          <Stat label="Mensajes automáticos" value={fmtInt(t.autoMsgs)} href={r.sequence.length ? "#automaticos" : respuestaHref("mensajes")} />
          <Stat label="Mensajes de los leads" value={fmtInt(t.inboundMsgs)} href={leadsHref("respondio")} />
          <Stat label="Llamadas salientes" value={fmtInt(t.callsOut)} hint={t.callsOut ? `${fmtInt(t.callsAnswered)} contestadas (${pct(t.callsAnswered, t.callsOut)})` : undefined} href={respuestaHref("llamadas")} />
          <Stat label="Tiempo en llamada" value={minutes(t.callSeconds)} href={respuestaHref("llamadas")} />
          <Stat label="Llamadas entrantes perdidas" value={fmtInt(t.missedIn)} hint={t.missedIn ? `${fmtInt(t.missedUnreturned)} sin devolver` : undefined} critical={t.missedUnreturned > 0} href={r.attention.missedUnreturned.length ? "#llamadas-perdidas" : respuestaHref("llamadas")} />
        </div>
      </Card>

      <Card title="Embudo de seguimiento" subtitle="De los leads del período, cuántos llegaron a cada paso.">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {funnel.map((f, i) => (
            <Stat key={f.label} label={f.label} value={fmtInt(f.value)} hint={i === 0 ? undefined : `${pct(f.value, t.leads)} de los leads`} href={f.href} />
          ))}
        </div>
      </Card>

      {/* Citas */}
      <Card id="citas" title={`Citas · ${fmtInt(totalAppts)}`} flush
        subtitle={`Citas en el calendario de GHL de los leads de este período. ${fmtInt(t.withCita)} leads tienen cita (calendario o etapa de cita en el pipeline).`}>
        <div className="grid grid-cols-2 gap-3 px-5 pb-4 sm:grid-cols-5">
          {PHASE_ORDER.map((p) => <Stat key={p} label={PHASE_LABEL[p]} value={fmtInt(r.appointmentsByPhase[p])} critical={p === "paso" && r.appointmentsByPhase.paso > 0} href="#lista-citas" />)}
        </div>
        {r.appointmentsByOwner.length > 0 && (
          <Table head={<><th className={`${th} pl-5 text-left`}>Responsable</th><th className={th}>Citas</th>{PHASE_ORDER.map((p) => <th key={p} className={`${th} ${p === "cancelada" ? "pr-5" : ""}`}>{PHASE_LABEL[p]}</th>)}</>}>
            {r.appointmentsByOwner.map((o) => (
              <tr key={o.ownerId ?? "none"}>
                <td className={`${td} pl-5 text-left font-medium text-ink`}>{o.ownerName}</td>
                <td className={td}>{fmtInt(o.total)}</td>
                {PHASE_ORDER.map((p) => <td key={p} className={`${td} ${p === "cancelada" ? "pr-5" : ""}`}>{fmtInt(o[p])}</td>)}
              </tr>
            ))}
          </Table>
        )}
        <div id="lista-citas" className="mt-4 scroll-mt-20"><AppointmentList rows={r.appointments} leadHref={leadHref} /></div>
      </Card>

      {/* Por agente */}
      <Card id="por-agente" title="Seguimiento por agente" flush subtitle="Por agente asignado al lead en GHL. Llamadas y mensajes cuentan los de sus leads.">
        <Table head={<><th className={`${th} pl-5 text-left`}>Agente</th>{TALLY_HEAD.map((h, i) => <th key={h} className={`${th} ${i === TALLY_HEAD.length - 1 ? "pr-5" : ""}`}>{h}</th>)}</>}>
          {r.agents.map((a: AgentFollowup) => (
            <tr key={a.agentId ?? "none"}>
              <td className={`${td} pl-5 text-left font-medium text-ink`}>{a.agentName}</td>
              <TallyCells t={a} />
            </tr>
          ))}
          <tr className="bg-surface-2/40 font-medium">
            <td className={`${td} pl-5 text-left`}>Total</td>
            <TallyCells t={t} />
          </tr>
        </Table>
      </Card>

      {/* Leads que necesitan atención */}
      <Card id="sin-contacto-24h" title={`Sin contacto humano hace más de 24 h · ${fmtInt(r.attention.noContact24h.length)}`} flush
        subtitle="Leads a los que ninguna persona ha escrito ni llamado (solo recibieron automáticos). Los más antiguos primero.">
        <LeadList rows={r.attention.noContact24h} leadHref={leadHref} empty="Ninguno: todos los leads con más de 24 h tienen contacto humano."
          extra={(l) => `${fmtInt(l.auto_msgs_out)} automáticos${l.responded ? " · respondió" : ""}`} />
      </Card>
      <Card id="respondieron-sin-respuesta" title={`Respondieron y nadie les contestó · ${fmtInt(r.attention.respondedNoHuman.length)}`} flush
        subtitle="El lead escribió, pero solo tiene mensajes automáticos. Son los más calientes para retomar.">
        <LeadList rows={r.attention.respondedNoHuman} leadHref={leadHref} empty="Ninguno."
          extra={(l) => (l.last_reply ? `“${l.last_reply.slice(0, 80)}${l.last_reply.length > 80 ? "…" : ""}”` : "—")} />
      </Card>
      {r.attention.missedUnreturned.length > 0 && (
        <Card id="llamadas-perdidas" title={`Llamadas perdidas sin devolver · ${fmtInt(r.attention.missedUnreturned.length)}`} flush>
          <LeadList rows={r.attention.missedUnreturned} leadHref={leadHref} empty="Ninguna."
            extra={(l) => `${fmtInt(l.missed_unreturned)} sin devolver`} />
        </Card>
      )}
      {r.attention.unassigned.length > 0 && (
        <Card title={`Sin agente asignado · ${fmtInt(r.attention.unassigned.length)}`} flush>
          <LeadList rows={r.attention.unassigned} leadHref={leadHref} empty="Ninguno."
            extra={(l) => (l.first_contact_ms === null ? "Sin contacto humano" : "Con contacto")} />
        </Card>
      )}

      {/* Pipeline y campañas */}
      <div className="grid gap-5 lg:grid-cols-[1fr_2fr]">
        <Card title="Etapa actual en el pipeline" flush>
          <Table head={<><th className={`${th} pl-5 text-left`}>Etapa</th><th className={th}>Leads</th><th className={`${th} pr-5`}>%</th></>}>
            {r.stages.map((s) => (
              <tr key={s.stage}>
                <td className={`${td} pl-5 text-left`}>{s.stage}</td>
                <td className={td}>{fmtInt(s.leads)}</td>
                <td className={`${td} pr-5 text-ink-3`}>{pct(s.leads, t.leads)}</td>
              </tr>
            ))}
          </Table>
        </Card>
        <Card title="Seguimiento por campaña" flush>
          <Table head={<><th className={`${th} pl-5 text-left`}>Campaña</th><th className={th}>Leads</th><th className={th}>Contacto humano</th><th className={th}>Respondieron</th><th className={th}>Con cita</th><th className={`${th} pr-5`}>Ganados</th></>}>
            {r.campaigns.map((c: CampaignFollowup) => (
              <tr key={c.campaignId ?? "none"}>
                <td className={`${td} pl-5 text-left`}>{c.campaignName}</td>
                <td className={td}>{fmtInt(c.leads)}</td>
                <td className={td}>{pct(c.contacted, c.leads)}</td>
                <td className={td}>{pct(c.responded, c.leads)}</td>
                <td className={td}>{fmtInt(c.withCita)}</td>
                <td className={`${td} pr-5`}>{fmtInt(c.won)}</td>
              </tr>
            ))}
          </Table>
        </Card>
      </div>

      {/* Secuencia automática */}
      {r.sequence.length > 0 && (
        <Card id="automaticos" title="Mensajes automáticos: cuántos responden" flush
          subtitle="Por mensaje de la secuencia (sin recordatorios de cita). % = leads que respondieron después de recibirlo.">
          <Table head={<><th className={`${th} pl-5 text-left`}>Mensaje</th><th className={th}>Canal</th><th className={th}>Leads que lo recibieron</th><th className={th}>Respondieron</th><th className={`${th} pr-5`}>%</th></>}>
            {r.sequence.slice(0, 15).map((s, i) => (
              <tr key={i}>
                <td className={`${td} pl-5 text-left text-ink-2`} title={s.template}>{s.template.length > 90 ? `${s.template.slice(0, 90)}…` : s.template}</td>
                <td className={td}>{s.kind ?? "—"}</td>
                <td className={td}>{fmtInt(s.leads_sent)}</td>
                <td className={td}>{fmtInt(s.leads_replied)}</td>
                <td className={`${td} pr-5`}>{s.reply_rate === null ? "—" : fmtPct(s.reply_rate)}</td>
              </tr>
            ))}
          </Table>
        </Card>
      )}

      <p className="text-xs text-ink-3">
        Contacto humano = mensaje o llamada saliente hecho por una persona desde GHL (no workflows ni campañas). “Respondieron” = el lead
        escribió o devolvió el contacto. Las citas cuentan las del calendario de GHL; “Con cita” también incluye oportunidades en etapa de cita.
      </p>
    </article>
  );
}
