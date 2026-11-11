import Link from "next/link";
import type { ReactNode } from "react";
import { AppointmentBadge } from "@/app/_components/appointment-status";
import { compareAppointments } from "@/lib/appointments";
import { LocalTime, ZoneClock } from "@/app/_components/local-time";
import { CopyButton } from "@/app/_components/copy-button";
import { fmtDuration, fmtPhone, titleCase } from "@/lib/format";
import { firstContactMs, type Lead, type TimelineEvent } from "@/lib/leads";

const KIND: Record<string, string> = { sms: "SMS", email: "Email", whatsapp: "WhatsApp", fb: "Facebook", ig: "Instagram", live_chat: "Chat", custom_sms: "SMS" };
const CALL: Record<string, string> = {
  completed: "contestada", "no-answer": "no contestada", voicemail: "buzón de voz", busy: "ocupado", failed: "fallida", ringing: "sin respuesta",
};

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-b border-line px-5 py-4">
      <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-3">{title}</h3>
      {children}
    </section>
  );
}

function Field({ label, value, mono }: { label: string; value: string | null; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-4 py-0.5 text-sm">
      <dt className="shrink-0 text-ink-3">{label}</dt>
      <dd className={`truncate text-right text-ink ${mono ? "font-mono text-xs" : ""}`} title={value ?? undefined}>{value ?? "—"}</dd>
    </div>
  );
}

/** Hito de la línea de tiempo (entrada del lead, primer contacto, cita). */
function Marker({ at, children, tone = "neutral" }: { at: string; children: ReactNode; tone?: "neutral" | "good" | "accent" }) {
  const dot = tone === "good" ? "bg-good" : tone === "accent" ? "bg-accent" : "bg-ink-3";
  return (
    <li className="flex items-center gap-2 py-1 text-xs text-ink-2">
      <span className={`size-2 shrink-0 rounded-full ${dot}`} />
      <span className="flex-1">{children}</span>
      <span className="shrink-0 text-ink-3"><LocalTime iso={at} /></span>
    </li>
  );
}

function MessageItem({ e }: { e: TimelineEvent }) {
  const time = <span className="text-[11px] text-ink-3"><LocalTime iso={e.at} /></span>;
  if (e.kind === "call") {
    const who = e.direction === "inbound" ? "Llamada del lead" : `Llamada de ${e.sender ?? "un agente"}`;
    const ok = e.call_status === "completed";
    return (
      <li className="flex items-center gap-2 py-1.5 text-sm">
        <span aria-hidden="true" className={ok ? "text-good-ink" : "text-critical"}>☎</span>
        <span className="flex-1 text-ink">
          {who} · <span className={ok ? "text-good-ink" : "text-critical"}>{CALL[e.call_status ?? ""] ?? e.call_status ?? "—"}</span>
          {ok && e.call_duration_s ? <span className="text-ink-3"> · {fmtDuration(e.call_duration_s * 1000)}</span> : null}
        </span>
        {time}
      </li>
    );
  }
  const channel = KIND[e.kind ?? ""] ?? e.kind ?? "";
  if (e.direction === "outbound" && e.automated) {
    // Automatizaciones atenuadas y en una línea: no deben tapar la conversación real
    return (
      <li className="flex items-center gap-2 py-1 text-xs text-ink-3">
        <span className="shrink-0 rounded bg-surface-2 px-1.5 py-0.5">Auto · {channel}</span>
        <span className="min-w-0 flex-1 truncate" title={e.body ?? undefined}>{e.body ?? "(sin texto)"}</span>
        {time}
      </li>
    );
  }
  const inbound = e.direction === "inbound";
  return (
    <li className={`flex py-1.5 ${inbound ? "justify-start" : "justify-end"}`}>
      <div className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${inbound ? "rounded-bl-sm bg-surface-2 text-ink" : "rounded-br-sm bg-accent-soft text-ink"}`}>
        <p className="mb-0.5 flex items-center justify-between gap-3 text-[11px] text-ink-3">
          <span>{inbound ? "Lead" : (e.sender ?? "Agente")} · {channel}</span>
          <LocalTime iso={e.at} />
        </p>
        <p className="whitespace-pre-line break-words">{e.body ?? "(sin texto)"}</p>
      </div>
    </li>
  );
}

export function LeadDetail({ lead, events, closeHref, leadZone = null, phone = null }: { lead: Lead; events: TimelineEvent[]; closeHref: string; leadZone?: string | null; phone?: string | null }) {
  const name = lead.name ? titleCase(lead.name) : "Sin nombre";
  const firstMs = firstContactMs(lead);
  // Pendientes primero (la más próxima), luego las que ya pasaron (la más reciente)
  const appointments = events
    .filter((e) => e.type === "appointment")
    .sort((a, b) => compareAppointments({ start: a.appt_start, status: a.appt_status }, { start: b.appt_start, status: b.appt_status }));
  // Línea de tiempo: mensajes + hitos (entrada del lead y primer contacto humano), en orden
  type Item = { at: string; node: ReactNode };
  const items: Item[] = [
    { at: lead.created_at, node: <Marker key="in" at={lead.created_at}>Entró el lead desde Meta</Marker> },
    ...events.map((e, i): Item => ({
      at: e.at,
      node: e.type === "appointment"
        ? <Marker key={`a${i}`} at={e.at} tone="accent">
            Cita agendada {e.appt_start ? <>para <LocalTime iso={e.appt_start} showZone /></> : ""}
            {(e.appt_status === "cancelled" || e.appt_status === "invalid") && " · cancelada"}
          </Marker>
        : <MessageItem key={`m${i}`} e={e} />,
    })),
  ];
  if (lead.first_human_at && firstMs != null) {
    items.push({ at: lead.first_human_at, node: (
      <Marker key="first" at={lead.first_human_at} tone={firstMs <= 5 * 60_000 ? "good" : "neutral"}>
        Primer contacto humano · {fmtDuration(firstMs)} después de entrar
      </Marker>
    ) });
  }
  items.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));

  return (
    <>
      <header className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
        <div className="min-w-0">
          <h2 id="lead-drawer-title" className="truncate text-lg font-semibold text-ink">{name}</h2>
          <p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs">
            {lead.opp_status === "won" && <span className="rounded bg-good-soft px-1.5 py-0.5 font-medium text-good-ink">Ganado</span>}
            {lead.stage && <span className="rounded bg-surface-2 px-1.5 py-0.5 text-ink-2">{lead.stage}</span>}
            {lead.state && <span className="rounded bg-surface-2 px-1.5 py-0.5 text-ink-2">{lead.state_code ?? lead.state}</span>}
            <span className="text-ink-3">{lead.agent_name ?? (lead.assigned_to ? "Agente sin nombre" : "Sin agente")}</span>
          </p>
          {phone && (
            <p className="mt-1.5 flex items-center gap-1.5 text-sm">
              <a href={`tel:${phone}`} className="font-medium tabular-nums text-ink hover:text-accent">{fmtPhone(phone)}</a>
              <CopyButton value={phone} label="Copiar teléfono" />
            </p>
          )}
          {leadZone && (
            <p className="mt-1 text-xs text-ink-3" title={leadZone}>
              Hora del lead ahora: <span className="font-medium text-ink-2"><ZoneClock timeZone={leadZone} /></span>
            </p>
          )}
        </div>
        <Link href={closeHref} scroll={false} replace aria-label="Cerrar"
          className="rounded-lg px-2 py-1 text-lg leading-none text-ink-3 hover:bg-surface-2 hover:text-ink">✕</Link>
      </header>

      <div className="flex-1 overflow-y-auto">
        <div className="flex gap-2 border-b border-line px-5 py-3">
          {lead.conversation_url && (
            <a href={lead.conversation_url} target="_blank" rel="noreferrer"
              className="rounded-lg bg-ink px-3 py-1.5 text-sm font-medium text-plane hover:opacity-90">Abrir conversación en GHL ↗</a>
          )}
          <a href={lead.contact_url} target="_blank" rel="noreferrer"
            className="rounded-lg border border-line px-3 py-1.5 text-sm font-medium text-ink-2 hover:bg-surface-2">Contacto ↗</a>
        </div>

        <Section title="Origen en Meta">
          <dl>
            <Field label="Campaña" value={lead.campaign_name} />
            <Field label="Campaign ID" value={lead.campaign_id} mono />
            <Field label="Ad set ID" value={lead.adset_id} mono />
            <Field label="Ad ID" value={lead.ad_id} mono />
            <div className="flex justify-between gap-4 py-0.5 text-sm">
              <dt className="text-ink-3">Entró</dt>
              <dd className="text-ink"><LocalTime iso={lead.created_at} /></dd>
            </div>
          </dl>
        </Section>

        {appointments.length > 0 && (
          <Section title={`Citas (${appointments.length})`}>
            <ul className="space-y-1 text-sm">
              {appointments.map((a, i) => (
                <li key={i} className="flex justify-between gap-3">
                  <span className="text-ink">
                    {a.appt_start ? <LocalTime iso={a.appt_start} showZone /> : "Sin fecha"}
                    {a.appt_start && leadZone && (
                      <span className="block text-xs text-ink-3">Para el lead: <LocalTime iso={a.appt_start} timeZone={leadZone} /></span>
                    )}
                  </span>
                  <span className="flex items-center gap-2 text-ink-2">
                    <AppointmentBadge start={a.appt_start} status={a.appt_status} />
                    {a.sender && <span className="text-xs">{a.sender}</span>}
                  </span>
                </li>
              ))}
            </ul>
          </Section>
        )}

        <Section title="Línea de tiempo">
          {events.length === 0 && <p className="mb-2 text-sm text-ink-3">Sin mensajes ni llamadas registrados todavía.</p>}
          <ol>{items.map((it) => it.node)}</ol>
        </Section>
      </div>
    </>
  );
}
