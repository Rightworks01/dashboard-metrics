"use client";

// Client Component solo porque Recharts necesita el DOM. Recibe los datos ya calculados.
// Dos gráficas con un solo eje cada una (dinero vs conteos) en lugar de un eje doble.
// Clic en un día: fija una ficha con enlaces a Leads (y Citas) de ese día, ya filtrados.
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { MouseHandlerDataParam } from "recharts";
import { Area, Bar, BarChart, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { fmtDay, fmtInt, fmtMoney } from "@/lib/format";

export type DailyPoint = { date: string; spend: number; leads_ghl: number; opps_appointment: number };

const axisTick = { fontSize: 11, fill: "var(--ink-3)" };

type TooltipEntry = { name?: unknown; value?: unknown; color?: string; dataKey?: unknown };

function ChartTooltip({
  active,
  payload,
  label,
  money,
}: {
  active?: boolean;
  payload?: readonly TooltipEntry[];
  label?: string | number;
  money?: boolean;
}) {
  if (!active || !payload?.length) return null;
  const hint = "Clic para abrir el detalle del día";
  return (
    <div className="card min-w-36 px-3 py-2 text-xs">
      <p className="mb-1 font-medium text-ink">{fmtDay(String(label))}</p>
      {payload.map((p) => (
        <p key={String(p.dataKey)} className="flex items-center justify-between gap-4 text-ink-2">
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-full" style={{ background: p.color }} />
            {String(p.name)}
          </span>
          <span className="font-medium tabular-nums text-ink">{money ? fmtMoney(Number(p.value)) : fmtInt(Number(p.value))}</span>
        </p>
      ))}
      <p className="mt-1.5 border-t border-line pt-1.5 text-[11px] text-ink-3">{hint}</p>
    </div>
  );
}

type PinLink = { label: string; value: string; href?: string; color?: string };
type Pin = { date: string; x: number; links: PinLink[] };

/** Ficha fija tras un clic: a diferencia del tooltip, se puede pulsar. Esc o clic fuera la cierra. */
function PinnedCard({ pin, onClose }: { pin: Pin; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onDown = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) onClose(); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    // En el siguiente tick, para no cerrarla con el mismo clic que la abrió
    const t = setTimeout(() => document.addEventListener("mousedown", onDown));
    document.addEventListener("keydown", onKey);
    return () => { clearTimeout(t); document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [onClose]);
  return (
    <div ref={ref} role="dialog" aria-label={`Detalle del ${fmtDay(pin.date)}`}
      className="card absolute top-2 z-20 min-w-44 -translate-x-1/2 px-3 py-2 text-xs"
      style={{ left: `clamp(5.5rem, ${pin.x}px, calc(100% - 5.5rem))` }}>
      <div className="mb-1 flex items-center justify-between gap-3">
        <p className="font-medium text-ink">{fmtDay(pin.date)}</p>
        <button type="button" onClick={onClose} aria-label="Cerrar" className="text-ink-3 hover:text-ink">✕</button>
      </div>
      {pin.links.map((l) => {
        const label = (
          <span className="flex items-center gap-1.5">
            {l.color && <span className="size-2 rounded-full" style={{ background: l.color }} />}
            {l.label}
          </span>
        );
        // Sin href (p. ej. Campañas para quien no tiene acceso): solo la cifra, sin enlace.
        if (!l.href) {
          return (
            <div key={l.label} className="-mx-1.5 flex items-center justify-between gap-4 px-1.5 py-1 text-ink-2">
              {label}<span className="font-medium tabular-nums text-ink">{l.value}</span>
            </div>
          );
        }
        return (
          <Link key={l.label} href={l.href}
            className="-mx-1.5 flex items-center justify-between gap-4 rounded-md px-1.5 py-1 text-ink-2 hover:bg-surface-2 hover:text-ink">
            {label}
            <span className="font-medium tabular-nums text-accent">{l.value} →</span>
          </Link>
        );
      })}
    </div>
  );
}

/** Enlace a Leads de un día: from=to=ese día, conservando el alcance de campañas. */
function dayHref(date: string, query: string, etapa?: string) {
  return `/leads?from=${date}&to=${date}${query}${etapa ? `&etapa=${etapa}` : ""}`;
}

function usePin(data: DailyPoint[], build: (d: DailyPoint) => PinLink[]) {
  const [pin, setPin] = useState<Pin | null>(null);
  const onClick = (state: MouseHandlerDataParam) => {
    const i = typeof state.activeTooltipIndex === "number" ? state.activeTooltipIndex : Number(state.activeTooltipIndex);
    const d = Number.isInteger(i) ? data[i] : undefined;
    if (!d) return;
    setPin({ date: d.date, x: state.activeCoordinate?.x ?? 0, links: build(d) });
  };
  return { pin, close: () => setPin(null), onClick };
}

function Empty() {
  return <p className="flex h-56 items-center justify-center text-sm text-ink-3">Sin datos en este rango.</p>;
}

export function SpendChart({ data, query = "", campaignsLink = true }: { data: DailyPoint[]; query?: string; campaignsLink?: boolean }) {
  const { pin, close, onClick } = usePin(data, (d) => [
    { label: "Inversión", value: fmtMoney(d.spend), href: campaignsLink ? `/campanas?from=${d.date}&to=${d.date}${query}` : undefined },
    { label: "Leads", value: fmtInt(d.leads_ghl), href: dayHref(d.date, query) },
  ]);
  if (data.length === 0) return <Empty />;
  return (
    <div className="relative">
    {pin && <PinnedCard pin={pin} onClose={close} />}
    <ResponsiveContainer width="100%" height={224}>
      <BarChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: 0 }} barCategoryGap={2} onClick={onClick} className="cursor-pointer">
        <CartesianGrid stroke="var(--grid)" vertical={false} />
        <XAxis dataKey="date" tickFormatter={fmtDay} tick={axisTick} tickLine={false} axisLine={{ stroke: "var(--axis)" }} minTickGap={24} />
        <YAxis tickFormatter={(v: number) => fmtMoney(v)} tick={axisTick} tickLine={false} axisLine={false} width={64} />
        <Tooltip cursor={{ fill: "var(--surface-2)" }} active={pin ? false : undefined} content={(p) => <ChartTooltip {...p} money />} />
        <Bar dataKey="spend" name="Inversión" fill="var(--series-1)" radius={[4, 4, 0, 0]} maxBarSize={28} />
      </BarChart>
    </ResponsiveContainer>
    </div>
  );
}

export function LeadsChart({ data, query = "" }: { data: DailyPoint[]; query?: string }) {
  const { pin, close, onClick } = usePin(data, (d) => [
    { label: "Leads", value: fmtInt(d.leads_ghl), href: dayHref(d.date, query), color: "var(--series-2)" },
    { label: "Citas", value: fmtInt(d.opps_appointment), href: dayHref(d.date, query, "cita"), color: "var(--series-3)" },
  ]);
  if (data.length === 0) return <Empty />;
  return (
    <div className="relative">
    {pin && <PinnedCard pin={pin} onClose={close} />}
    <ResponsiveContainer width="100%" height={224}>
      <ComposedChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: 0 }} onClick={onClick} className="cursor-pointer">
        <defs>
          <linearGradient id="leadsFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--series-2)" stopOpacity={0.22} />
            <stop offset="100%" stopColor="var(--series-2)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke="var(--grid)" vertical={false} />
        <XAxis dataKey="date" tickFormatter={fmtDay} tick={axisTick} tickLine={false} axisLine={{ stroke: "var(--axis)" }} minTickGap={24} />
        <YAxis allowDecimals={false} tick={axisTick} tickLine={false} axisLine={false} width={32} />
        <Tooltip cursor={{ stroke: "var(--axis)" }} active={pin ? false : undefined} content={(p) => <ChartTooltip {...p} />} />
        <Area
          dataKey="leads_ghl"
          name="Leads"
          stroke="var(--series-2)"
          strokeWidth={2}
          fill="url(#leadsFill)"
          dot={false}
          activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--surface)" }}
        />
        <Line
          dataKey="opps_appointment"
          name="Citas"
          stroke="var(--series-3)"
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--surface)" }}
        />
      </ComposedChart>
    </ResponsiveContainer>
    </div>
  );
}
