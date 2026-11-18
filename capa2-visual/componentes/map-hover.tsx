"use client";

// Tooltip del mapa. Las formas se dibujan en el servidor; aquí solo se lee `data-tip` del
// elemento bajo el puntero (delegación de eventos: un solo listener para los 51 estados).
import { useRef, useState, type ReactNode } from "react";

type Tip = { name: string; leads: string; rate: string; appts: string; won: string };

export function MapHover({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [tip, setTip] = useState<{ x: number; y: number; data: Tip } | null>(null);

  return (
    <div
      ref={ref}
      className="relative"
      onPointerMove={(e) => {
        const target = (e.target as Element).closest("[data-tip]");
        const box = ref.current?.getBoundingClientRect();
        if (!target || !box) return setTip(null);
        setTip({ x: e.clientX - box.left, y: e.clientY - box.top, data: JSON.parse(target.getAttribute("data-tip") ?? "{}") as Tip });
      }}
      onPointerLeave={() => setTip(null)}
    >
      {children}
      {tip && (
        <div
          className="card pointer-events-none absolute z-10 min-w-40 px-3 py-2 text-xs"
          style={{
            left: tip.x,
            top: tip.y,
            transform: `translate(${tip.x > (ref.current?.clientWidth ?? 0) / 2 ? "calc(-100% - 12px)" : "12px"}, -50%)`,
          }}
        >
          <p className="mb-1 font-medium text-ink">{tip.data.name}</p>
          <Row label="Leads" value={tip.data.leads} />
          <Row label="Respondieron" value={tip.data.rate} />
          <Row label="Citas" value={tip.data.appts} />
          <Row label="Ganados" value={tip.data.won} />
        </div>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <p className="flex justify-between gap-4 text-ink-2">
      {label}
      <span className="font-medium tabular-nums text-ink">{value}</span>
    </p>
  );
}
