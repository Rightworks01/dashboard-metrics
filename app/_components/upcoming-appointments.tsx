import Link from "next/link";
import { AppointmentIcon } from "@/app/_components/appointment-status";
import { LocalTime } from "@/app/_components/local-time";
import { RelativeTime } from "@/app/_components/relative-time";
import { titleCase } from "@/lib/format";
import type { UpcomingAppointment } from "@/lib/leads";

// Próximas citas (las que aún no pasan), la más próxima arriba, de cualquier fecha de entrada del lead.
// Cada fila abre el panel del lead en el día en que entró (así el panel lo encuentra en su rango).
export function UpcomingAppointments({ items, leadHref }: { items: UpcomingAppointment[]; leadHref: (a: UpcomingAppointment) => string }) {
  if (items.length === 0) {
    return <p className="px-5 pb-4 text-sm text-ink-3">No hay citas por venir con estos filtros.</p>;
  }
  return (
    <ul className="divide-y divide-line border-t border-line">
      {items.map((a) => (
        <li key={`${a.contactId}-${a.start}`}>
          <Link href={leadHref(a)} scroll={false}
            className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-2.5 text-sm hover:bg-surface-2/50">
            <span className="flex min-w-0 basis-full items-center gap-2 sm:basis-auto sm:flex-1">
              <AppointmentIcon start={a.start} status={a.status} />
              <span className="truncate font-medium text-ink">{a.name ? titleCase(a.name) : "Sin nombre"}</span>
            </span>
            <span className="whitespace-nowrap pl-6 text-ink sm:pl-0">
              <LocalTime iso={a.start} showZone /> <span className="text-xs text-ink-3">· <RelativeTime iso={a.start} /></span>
            </span>
            <span className="w-full truncate pl-6 text-xs text-ink-3 sm:w-40 sm:pl-0 sm:text-right">
              {a.agentName ?? (a.agentId ? "Agente sin nombre" : "Sin agente")}{a.stateCode ? ` · ${a.stateCode}` : ""}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
