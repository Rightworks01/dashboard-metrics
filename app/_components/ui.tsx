import Link from "next/link";
import type { ReactNode } from "react";
import { CampaignFilter } from "@/app/_components/campaign-filter";
import { fmtDay, fmtSignedPct, pctChange } from "@/lib/format";
import { campQuery, rangePresets, type CampaignOption, type CampaignScope } from "@/lib/metrics";
import { viewerToday } from "@/lib/viewer-zone";

/**
 * Título de sección + rango de fechas + filtro de campañas. Todo vive en la URL (?from&to&camp),
 * así se puede compartir un enlace ya filtrado.
 */
export async function PageHeader({ title, description, from, to, path, scope, options }: {
  title: string; description?: string; from: string; to: string; path: string;
  scope?: CampaignScope; options?: CampaignOption[];
}) {
  const camp = scope ? campQuery(scope) : "";
  const today = await viewerToday(); // "hoy" de quien mira, no de UTC
  const days = Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1;
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-ink">{title}</h1>
        <p className="mt-0.5 text-sm text-ink-3">
          {fmtDay(from)} – {fmtDay(to)} · {days} días{description ? ` · ${description}` : ""}
        </p>
      </div>
      <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
        <nav className="flex w-full rounded-xl border border-line bg-surface p-1 text-sm shadow-sm sm:inline-flex sm:w-auto" aria-label="Rango rápido">
          {rangePresets(today).map((p) => {
            const selected = from === p.from && to === p.to;
            return (
              <Link key={p.label} href={`${path}?from=${p.from}&to=${p.to}${camp}`} aria-current={selected ? "page" : undefined}
                className={`flex-1 whitespace-nowrap rounded-lg px-2 py-1.5 text-center font-medium transition-colors sm:flex-none sm:px-3 ${
                  selected ? "bg-accent text-white shadow-sm" : "text-ink-2 hover:bg-surface-2"
                }`}>
                {p.label}
              </Link>
            );
          })}
        </nav>
        {options && scope && <CampaignFilter options={options} scope={scope} />}
        {/* En celular: desde → hasta + Aplicar en una sola fila (fechas flexibles) */}
        <form action={path} className="grid w-full grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto] items-center gap-2 text-sm sm:flex sm:w-auto">
          {scope?.param && <input type="hidden" name="camp" value={scope.param} />}
          <input type="date" name="from" defaultValue={from} max={today} aria-label="Desde"
            className="min-w-0 rounded-lg border border-line bg-surface px-2 py-1.5 text-ink shadow-sm outline-none focus:border-accent sm:px-2.5" />
          <span className="text-ink-3">→</span>
          <input type="date" name="to" defaultValue={to} max={today} aria-label="Hasta"
            className="min-w-0 rounded-lg border border-line bg-surface px-2 py-1.5 text-ink shadow-sm outline-none focus:border-accent sm:px-2.5" />
          <button type="submit" className="rounded-lg bg-ink px-3 py-1.5 font-medium text-plane hover:opacity-90">Aplicar</button>
        </form>
      </div>
    </header>
  );
}

export function Card({ title, subtitle, aside, flush, className = "", children }: {
  title: string; subtitle?: string; aside?: ReactNode; flush?: boolean; className?: string; children: ReactNode;
}) {
  return (
    <section className={`card min-w-0 overflow-hidden ${className}`}>
      <div className="flex flex-wrap items-start justify-between gap-2 px-5 pt-4">
        <div>
          <h2 className="text-sm font-semibold text-ink">{title}</h2>
          {subtitle && <p className="mt-0.5 text-xs text-ink-3">{subtitle}</p>}
        </div>
        {aside}
      </div>
      <div className={flush ? "mt-3" : "px-5 pb-5 pt-3"}>{children}</div>
    </section>
  );
}

/**
 * Indicador con variación frente al período anterior de la misma duración.
 * `lowerIsBetter` para costos. El color nunca va solo: flecha + signo + texto para lectores.
 */
export function Kpi({ label, value, hint, current, previous, lowerIsBetter = false, accent = false, href, critical = false }: {
  label: string; value: string; hint?: string;
  current?: number | null; previous?: number | null; lowerIsBetter?: boolean; accent?: boolean;
  href?: string; // con href, la tarjeta lleva a la lista de leads correspondiente
  critical?: boolean; // algo que requiere acción (p. ej. leads sin contacto): valor y borde en rojo
}) {
  const change = pctChange(current, previous);
  const good = change == null || change === 0 ? null : (change < 0) === lowerIsBetter;
  const className = `card relative block overflow-hidden p-4 ${accent ? "ring-1 ring-accent/20" : ""} ${
    critical ? "ring-1 ring-critical/40" : ""} ${href ? "transition-colors hover:border-accent/40" : ""}`;
  const content = (
    <>
      {(accent || critical) && <div className={`absolute inset-x-0 top-0 h-1 ${critical ? "bg-critical" : "bg-accent"}`} />}
      <p className="flex items-center justify-between text-xs font-medium text-ink-3">
        {label}
        {href && <span aria-hidden="true" className="text-ink-3">→</span>}
      </p>
      <p className={`mt-1.5 text-2xl font-semibold tracking-tight tabular-nums ${critical ? "text-critical" : "text-ink"}`}>{value}</p>
      <div className="mt-1 flex flex-wrap items-center gap-x-2 text-xs">
        {change != null && (
          <span title="Frente al período de comparación (ver la nota bajo las tarjetas)"
            className={`inline-flex items-center gap-0.5 rounded px-1 font-medium tabular-nums ${
              good == null ? "text-ink-2" : good ? "bg-good-soft text-good-ink" : "bg-critical-soft text-critical"
            }`}>
            <span aria-hidden="true">{change > 0 ? "▲" : change < 0 ? "▼" : "■"}</span>
            {fmtSignedPct(change)}
            <span className="sr-only">{good ? " mejor" : good === false ? " peor" : ""} que el período anterior</span>
          </span>
        )}
        {hint && <span className="truncate text-ink-3">{hint}</span>}
      </div>
    </>
  );
  return href ? <Link href={href} className={className}>{content}</Link> : <div className={className}>{content}</div>;
}

export function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="h-0.5 w-3 rounded-full" style={{ background: color }} />
      {label}
    </span>
  );
}

export function ErrorNote({ scope, what }: { scope: string; what: string }) {
  return (
    <p className="rounded-xl border border-critical/30 bg-critical-soft p-4 text-sm text-critical">
      No se pudieron cargar {what}. Revisa los logs de Vercel (scope <code>{scope}</code>).
    </p>
  );
}

/** Pantalla restringida (Campañas / Anuncios): el usuario es del equipo pero no tiene acceso. */
export function NoAccessNote({ what }: { what: string }) {
  return (
    <div className="card mx-auto mt-10 max-w-sm p-6 text-center">
      <h1 className="text-lg font-semibold text-ink">Sin acceso</h1>
      <p className="mt-2 text-sm text-ink-2">{what} solo está disponible para el administrador de la cuenta.</p>
    </div>
  );
}
