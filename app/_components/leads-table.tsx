import Link from "next/link";
import { AppointmentIcon } from "@/app/_components/appointment-status";
import { LeadName } from "@/app/_components/lead-card";
import { ClickableRow } from "@/app/_components/lead-drawer";
import { LocalTime } from "@/app/_components/local-time";
import { RelativeTime } from "@/app/_components/relative-time";
import { fmtDuration } from "@/lib/format";
import { firstContactMs, type Lead, type LeadSort } from "@/lib/leads";

function FirstContact({ lead }: { lead: Lead }) {
  const ms = firstContactMs(lead);
  if (ms == null) {
    return <span className="rounded bg-critical-soft px-1.5 py-0.5 text-xs font-medium text-critical">Sin contacto</span>;
  }
  return <span className={ms <= 5 * 60_000 ? "font-medium text-good-ink" : "text-ink-2"}>{fmtDuration(ms)}</span>;
}

function Appointment({ lead }: { lead: Lead }) {
  if (!lead.appointment_at) {
    return lead.has_cita ? <span className="text-ink-2">Etapa de cita</span> : <span className="text-ink-3">—</span>;
  }
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-ink">
      <LocalTime iso={lead.appointment_at} showZone />
      <AppointmentIcon start={lead.appointment_at} status={lead.appointment_status} />
    </span>
  );
}

function LastReply({ lead }: { lead: Lead }) {
  if (!lead.last_reply) return <span className="text-ink-3">—</span>;
  return (
    <div className="flex min-w-0 items-baseline gap-2">
      <span className="min-w-0 flex-1 truncate text-ink-2" title={lead.last_reply}>{lead.last_reply}</span>
      {lead.last_reply_at && <span className="shrink-0 text-xs text-ink-3"><RelativeTime iso={lead.last_reply_at} /></span>}
      {lead.conversation_url && (
        <a href={lead.conversation_url} target="_blank" rel="noreferrer" title="Abrir conversación en GHL"
          className="shrink-0 text-xs font-medium text-accent hover:underline">Abrir ↗</a>
      )}
    </div>
  );
}

function SortHeader({ label, sortKey, sort, dir, sortHref, title, className = "", firstDir = "desc" }: {
  label: string; sortKey: LeadSort; sort: LeadSort; dir: "asc" | "desc";
  sortHref: (key: LeadSort, dir: "asc" | "desc") => string; title?: string; className?: string;
  firstDir?: "asc" | "desc"; // dirección al pulsar por primera vez
}) {
  const active = sort === sortKey;
  const nextDir = active ? (dir === "asc" ? "desc" : "asc") : firstDir;
  return (
    <th className={`px-3 py-2.5 font-medium ${className}`} title={title} aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : undefined}>
      <Link href={sortHref(sortKey, nextDir)} className={`whitespace-nowrap hover:text-ink ${active ? "text-ink" : ""}`}>
        {label}<span aria-hidden="true" className="ml-0.5">{active ? (dir === "asc" ? "↑" : "↓") : "↕"}</span>
      </Link>
    </th>
  );
}

export function LeadsTable({ leads, sort, dir, sortHref, leadHref, wonHref, selectedId, focusId }: {
  leads: Lead[]; sort: LeadSort; dir: "asc" | "desc"; sortHref: (key: LeadSort, dir: "asc" | "desc") => string;
  leadHref: (id: string) => string; // abre el panel lateral del lead
  wonHref: (id: string) => string; // etiqueta "Ganado" → pestaña Ganados con ese lead resaltado
  selectedId?: string;
  focusId?: string; // lead resaltado (venimos de su etiqueta "Ganado")
}) {
  if (leads.length === 0) return <p className="px-5 pb-5 text-sm text-ink-3">No hay leads con estos filtros.</p>;
  const sortProps = { sort, dir, sortHref };
  return (
    <div className="relative overflow-x-auto">
      {/* Anchos fijos: la última respuesta toma el espacio restante y se trunca; en pantallas
          angostas la tabla conserva su ancho mínimo y se desplaza */}
      <table className="w-full min-w-[1120px] table-fixed text-left text-sm">
        <thead className="border-y border-line bg-surface-2/60 text-xs text-ink-3">
          <tr>
            <th className="sticky left-0 z-[1] w-[150px] bg-surface px-4 py-2.5 font-medium sm:static sm:w-[180px] sm:bg-transparent sm:px-5">Lead · campaña</th>
            <SortHeader label="Entró" sortKey="entrada" {...sortProps} className="w-[124px]" />
            <th className="w-[120px] px-3 py-2.5 font-medium">Agente</th>
            <th className="w-[64px] px-3 py-2.5 font-medium">Estado</th>
            <th className="w-[124px] px-3 py-2.5 font-medium">Etapa</th>
            <SortHeader label="Cita" sortKey="cita" {...sortProps} className="w-[190px]" firstDir="asc"
              title="Primero las pendientes (la más próxima), luego las que ya pasaron (la más reciente)" />
            <SortHeader label="1er contacto" sortKey="contacto" {...sortProps} className="w-[108px]"
              title="Tiempo desde que entró el lead hasta el primer mensaje o llamada de un agente (sin automatizaciones)" />
            <th className="px-5 py-2.5 font-medium">Última respuesta del lead</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {leads.map((l) => (
            <ClickableRow key={l.id} href={leadHref(l.id)} focused={focusId === l.id}
              className={`transition-colors ${
                focusId === l.id
                  ? "bg-good-soft shadow-[inset_4px_0_0_var(--good)] hover:bg-good-soft"
                  : selectedId === l.id ? "bg-accent-soft/60 hover:bg-surface-2/50" : "hover:bg-surface-2/50"
              }`}>
              {/* En celular la primera columna queda fija al desplazar la tabla hacia los lados */}
              <td className="sticky left-0 z-[1] bg-surface px-4 py-2.5 shadow-[1px_0_0_var(--line)] sm:static sm:bg-transparent sm:px-5 sm:shadow-none">
                <LeadName lead={l} href={leadHref(l.id)} />
                <span className="block truncate text-xs text-ink-3" title={l.campaign_name ?? undefined}>{l.campaign_name ?? "Sin campaña"}</span>
              </td>
              <td className="whitespace-nowrap px-3 py-2.5 text-ink-2"><LocalTime iso={l.created_at} /></td>
              <td className="truncate px-3 py-2.5 text-ink-2" title={l.agent_name ?? undefined}>{l.agent_name ?? (l.assigned_to ? "…" : "Sin asignar")}</td>
              <td className="whitespace-nowrap px-3 py-2.5 text-ink-2">{l.state_code ?? l.state ?? "—"}</td>
              <td className="truncate px-3 py-2.5 text-ink-2" title={l.stage ?? undefined}>
                {l.opp_status === "won" ? (
                  <Link href={wonHref(l.id)} scroll={false} title={`${l.stage ?? "Ganado"} · ver en la pestaña Ganados`}
                    className="rounded bg-good-soft px-1.5 py-0.5 text-xs font-medium text-good-ink ring-good/40 hover:ring-1">
                    Ganado
                  </Link>
                ) : (l.stage ?? "—")}
              </td>
              <td className="whitespace-nowrap px-3 py-2.5"><Appointment lead={l} /></td>
              <td className="whitespace-nowrap px-3 py-2.5"><FirstContact lead={l} /></td>
              <td className="px-5 py-2.5"><LastReply lead={l} /></td>
            </ClickableRow>
          ))}
        </tbody>
      </table>
    </div>
  );
}
