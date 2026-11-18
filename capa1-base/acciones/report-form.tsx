"use client";

import { useState } from "react";

type Funding = "empresa" | "paquete" | "cliente" | "compartida";
type Row = { name: string; amount: string; agentId: string };

const FUNDING: { value: Funding; label: string; hint: string }[] = [
  { value: "empresa", label: "Solo Right Works", hint: "Toda la inversión es de la empresa." },
  { value: "paquete", label: "Compra de un paquete de leads", hint: "Alguien compró un paquete de leads de estas campañas." },
  { value: "cliente", label: "Un cliente o agente específico", hint: "Lo pagó una sola persona (cliente o agente)." },
  { value: "compartida", label: "Compartida entre varias personas", hint: "Escribe cuánto puso cada uno: el dashboard calcula el %." },
];

const input = "w-full rounded-lg border border-line bg-surface px-2.5 py-1.5 text-sm text-ink placeholder:text-ink-3 focus:border-accent focus:outline-none";

/** Preguntas antes de generar el reporte. Envía por GET a /reportes (el reporte queda en la URL). */
export function ReportForm({ from, to, camp, agents, initial }: {
  from: string; to: string; camp?: string;
  agents: { id: string; name: string }[];
  initial: { funding: Funding; rows: Row[]; vmin: string; vmax: string };
}) {
  const [funding, setFunding] = useState<Funding>(initial.funding);
  const [rows, setRows] = useState<Row[]>(initial.rows.length ? initial.rows : [{ name: "", amount: "", agentId: "" }]);
  const shared = funding === "compartida";
  const visible = shared ? rows : rows.slice(0, 1);
  const update = (i: number, patch: Partial<Row>) => setRows((r) => r.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const total = visible.reduce((s, r) => s + (Number(r.amount.replace(/[$,\s]/g, "")) || 0), 0);

  return (
    <form method="get" action="/reportes" className="card space-y-5 p-5 print:hidden">
      <input type="hidden" name="from" value={from} />
      <input type="hidden" name="to" value={to} />
      {camp && <input type="hidden" name="camp" value={camp} />}
      <input type="hidden" name="g" value="1" />

      <fieldset>
        <legend className="mb-2 text-sm font-semibold text-ink">1. ¿Quién financió la inversión de estas campañas?</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {FUNDING.map((f) => (
            <label key={f.value} className={`flex cursor-pointer gap-2.5 rounded-lg border px-3 py-2 text-sm ${funding === f.value ? "border-accent bg-accent-soft" : "border-line hover:bg-surface-2"}`}>
              <input type="radio" name="fuente" value={f.value} checked={funding === f.value} onChange={() => setFunding(f.value)} className="mt-0.5 accent-[var(--accent)]" />
              <span><span className="font-medium text-ink">{f.label}</span><span className="block text-xs text-ink-3">{f.hint}</span></span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="mb-2 text-sm font-semibold text-ink">
          2. {shared ? "Inversionistas y cuánto puso cada uno" : funding === "empresa" ? "Monto invertido (opcional)" : "Quién lo pagó y cuánto"}
        </legend>
        <p className="mb-2 text-xs text-ink-3">
          {shared
            ? "Si el inversionista es un agente, elígelo: así el reporte muestra también lo que cerraron sus propios leads."
            : "Si dejas el monto vacío se usa el gasto real en Meta del período."}
        </p>
        <div className="space-y-2">
          {visible.map((r, i) => (
            <div key={i} className="grid gap-2 sm:grid-cols-[1fr_9rem_1fr_auto]">
              <input name="inv" value={r.name} onChange={(e) => update(i, { name: e.target.value })} maxLength={80}
                placeholder={funding === "empresa" ? "Right Works" : "Nombre"} className={input} aria-label="Nombre del inversionista" />
              <input name="monto" value={r.amount} onChange={(e) => update(i, { amount: e.target.value })} inputMode="decimal"
                placeholder="$ monto" className={`${input} tabular-nums`} aria-label="Monto invertido" />
              <select name="agente" value={r.agentId} onChange={(e) => update(i, { agentId: e.target.value })} className={input} aria-label="Agente de GHL">
                <option value="">No es un agente</option>
                {agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
              {shared && rows.length > 1 ? (
                <button type="button" onClick={() => setRows((x) => x.filter((_, j) => j !== i))}
                  className="rounded-lg px-2 text-sm text-ink-3 hover:bg-surface-2 hover:text-ink" aria-label="Quitar inversionista">✕</button>
              ) : <span />}
            </div>
          ))}
        </div>
        {shared && (
          <div className="mt-2 flex items-center justify-between text-xs">
            {rows.length < 8 && (
              <button type="button" onClick={() => setRows((x) => [...x, { name: "", amount: "", agentId: "" }])} className="font-medium text-accent hover:underline">
                + Agregar inversionista
              </button>
            )}
            <span className="tabular-nums text-ink-3">Total declarado: ${total.toLocaleString("es-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
          </div>
        )}
      </fieldset>

      <fieldset>
        <legend className="mb-1 text-sm font-semibold text-ink">3. Valor estimado de un ganado (opcional)</legend>
        <p className="mb-2 text-xs text-ink-3">
          Para los ganados sin valor real cargado. Si lo dejas vacío, el reporte muestra cuánto tendría que dejar cada ganado
          para recuperar la inversión (punto de equilibrio).
        </p>
        <div className="flex flex-wrap items-center gap-2 text-sm text-ink-2">
          Entre <input name="vmin" defaultValue={initial.vmin} inputMode="decimal" placeholder="$ mínimo" className={`${input} w-32 tabular-nums`} aria-label="Valor mínimo por ganado" />
          y <input name="vmax" defaultValue={initial.vmax} inputMode="decimal" placeholder="$ máximo" className={`${input} w-32 tabular-nums`} aria-label="Valor máximo por ganado" />
          por ganado
        </div>
      </fieldset>

      <button type="submit" className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90">Generar reporte</button>
    </form>
  );
}
