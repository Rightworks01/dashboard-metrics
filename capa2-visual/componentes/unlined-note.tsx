import Link from "next/link";
import { fmtInt } from "@base/util/format";

/**
 * Aviso SOLO para admins (la página decide si mostrarlo): campañas activas cuyo nombre no dice si son de Vida,
 * Comercial o Reclutamiento. Sus datos siguen en todo el dashboard; solo faltan en las pestañas de Leads.
 * `where` = dónde se asigna desde esta pantalla.
 */
export function UnlinedCampaignsNote({ names, where }: { names: string[]; where: "filtro" | "tabla" | "leads" }) {
  const one = names.length === 1;
  return (
    <div role="status" className="flex flex-wrap items-start gap-3 rounded-xl border border-warning-ink/40 bg-warning-soft px-4 py-3 text-sm print:hidden">
      <span aria-hidden="true">⚠️</span>
      <p className="min-w-0 flex-1 text-ink">
        <strong className="text-warning-ink">{fmtInt(names.length)} {one ? "campaña activa no tiene" : "campañas activas no tienen"} línea de trabajo</strong>{" "}
        ({names.map((n) => `“${n}”`).join(", ")}). {one ? "Su nombre no dice" : "Sus nombres no dicen"} si {one ? "es" : "son"} de Vida, Comercial o
        Reclutamiento, así que {one ? "sus leads no aparecen" : "sus leads no aparecen"} en esas pestañas de Leads (solo en “Todos”).
        Sus cifras sí cuentan en el Resumen y en el resto del dashboard.{" "}
        {where === "filtro"
          ? <>Asígnale la línea en el filtro de <strong>Campañas</strong> de arriba (sección “Sin línea”) o en la página <Link href="/campanas" className="font-medium text-accent hover:underline">Campañas</Link>.</>
          : where === "tabla" ? <>Elige su línea en la columna <strong>Línea</strong>.</>
          : <>Asígnale la línea en el filtro de campañas del <Link href="/" className="font-medium text-accent hover:underline">Resumen</Link> o en <Link href="/campanas" className="font-medium text-accent hover:underline">Campañas</Link>.</>}
        <span className="ml-1.5 rounded border border-line px-1.5 text-[10px] font-semibold uppercase tracking-wide text-ink-3">solo admins</span>
      </p>
    </div>
  );
}
