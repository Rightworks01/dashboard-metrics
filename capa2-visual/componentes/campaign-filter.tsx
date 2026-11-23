"use client";

// Client Component: el selector necesita estado (abierto, búsqueda, selección) antes de navegar.
// El filtro vive en la URL (?camp=id1,id2): las páginas lo leen en el servidor.
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { fmtMoney } from "@base/util/format";
import type { CampaignOption, CampaignScope } from "@base/datos/metrics";
import { LINEA_ORDER, LINEAS, type Linea, type LineaInfo } from "@base/util/lineas";
import { LINE_DOT } from "@visual/componentes/line-badge";

/**
 * Solo admins (lo pasa la página, Capa 3): línea de cada campaña y `assign` para asignar la línea a las que no
 * tienen. Las líneas solo separan las pestañas de Leads; este filtro sigue mostrando todas las campañas.
 */
export type LineAssign = {
  lines: Record<string, LineaInfo>;
  assign: (campaignId: string, line: string) => Promise<{ ok?: boolean; error?: string }>;
};


function LineTag({ info }: { info: LineaInfo | undefined }) {
  if (!info?.line) return null;
  return (
    <span className="inline-flex items-center gap-1 text-xs text-ink-3">
      · <span className={`size-1.5 rounded-full ${LINE_DOT[info.line]}`} />{LINEAS[info.line].short}
      {info.source === "admin" ? " (fijada)" : ""}
    </span>
  );
}

export function CampaignFilter({ options, scope, lineAssign }: { options: CampaignOption[]; scope: CampaignScope; lineAssign?: LineAssign }) {
  // En "activas", los ids son los de las campañas activas ("0" = ninguna activa)
  const selected = scope.mode === "todas" ? [] : scope.ids.filter((id) => id !== "0");
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set(selected));
  const [saving, setSaving] = useState<string | null>(null);
  const [assignError, setAssignError] = useState<string | null>(null);

  async function assign(campaignId: string, line: Linea) {
    if (!lineAssign) return;
    setSaving(campaignId);
    setAssignError(null);
    const res = await lineAssign.assign(campaignId, line).catch(() => ({ error: "No se pudo guardar la línea." }));
    setSaving(null);
    if (res.error) setAssignError(res.error);
    else router.refresh();
  }
  const ref = useRef<HTMLDivElement>(null);

  // Cerrar al hacer clic fuera o con Escape
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onClick); document.removeEventListener("keydown", onKey); };
  }, [open]);

  const names = useMemo(() => new Map(options.map((o) => [o.id, o.name])), [options]);
  const matching = options.filter((o) => o.name.toLowerCase().includes(query.toLowerCase()) || o.id.includes(query));
  // Para admins, las campañas sin línea van aparte, abajo, con los botones para asignarla
  const unlined = lineAssign ? matching.filter((o) => !lineAssign.lines[o.id]?.line) : [];
  const visible = lineAssign ? matching.filter((o) => lineAssign.lines[o.id]?.line) : matching;
  // Por defecto (activas) solo dice "Campañas"; las activas aparecen marcadas al abrir.
  const label =
    scope.mode === "activas" ? (scope.param ? "Campañas: activas" : "Campañas")
    : scope.mode === "todas" ? "Campañas: todas"
    : selected.length === 1 ? (names.get(selected[0]) ?? `Campaña ${selected[0]}`)
    : `Campañas (${selected.length})`;

  /** "activas" = valor por defecto (sin ?camp), "todas", o los ids elegidos. */
  function apply(choice: "activas" | "todas" | Set<string>) {
    const next = new URLSearchParams(params.toString());
    // En Campañas el valor por defecto es "todas": ahí "activas" va explícito en la URL
    if (choice === "activas") { if (pathname.startsWith("/campanas")) next.set("camp", "activas"); else next.delete("camp"); }
    else if (choice === "todas" || choice.size === 0) next.set("camp", "todas");
    else next.set("camp", [...choice].join(","));
    setOpen(false);
    router.push(`${pathname}?${next.toString()}`);
  }

  function toggle(id: string) {
    const next = new Set(picked);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setPicked(next);
  }

  return (
    <div ref={ref} className="relative">
      <button type="button" aria-haspopup="listbox" aria-expanded={open}
        onClick={() => { setPicked(new Set(selected)); setQuery(""); setOpen(!open); }}
        className={`flex max-w-64 items-center gap-2 rounded-lg border px-2.5 py-1.5 text-sm shadow-sm ${
          scope.mode === "custom" ? "border-accent bg-accent-soft text-accent" : "border-line bg-surface text-ink"
        }`}>
        <svg viewBox="0 0 24 24" aria-hidden="true" className="size-4 shrink-0 fill-current"><path d="M3 5h18l-7 8v6l-4 2v-8z" /></svg>
        <span className="truncate">{label}</span>
      </button>

      {open && (
        <div className="card absolute right-0 z-30 mt-2 w-80 max-w-[calc(100vw-2rem)] p-2">
          <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar campaña…"
            className="mb-2 w-full rounded-lg border border-line bg-surface px-2.5 py-1.5 text-sm text-ink outline-none focus:border-accent" />
          <ul role="listbox" aria-multiselectable="true" className="max-h-72 overflow-y-auto">
            {visible.length === 0 && unlined.length === 0 && <li className="px-2 py-3 text-sm text-ink-3">Sin campañas con gasto en este rango.</li>}
            {visible.map((o) => (
              <li key={o.id}>
                <label className="flex cursor-pointer items-start gap-2 rounded-md px-2 py-1.5 hover:bg-surface-2">
                  <input type="checkbox" checked={picked.has(o.id)} onChange={() => toggle(o.id)} className="mt-0.5 accent-[var(--accent)]" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-ink" title={o.name}>{o.name}</span>
                    <span className="text-xs text-ink-3">
                      {o.active ? "Activa · " : ""}{fmtMoney(o.spend)} en el rango
                    </span>
                    {lineAssign && <> <LineTag info={lineAssign.lines[o.id]} /></>}
                  </span>
                </label>
              </li>
            ))}
            {unlined.length > 0 && (
              <li className="mt-1 border-t border-line px-2 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-warning-ink">
                Sin línea · solo admins
              </li>
            )}
            {unlined.map((o) => (
              <li key={o.id} className="px-2 py-1.5">
                <label className="flex cursor-pointer items-start gap-2 rounded-md hover:bg-surface-2">
                  <input type="checkbox" checked={picked.has(o.id)} onChange={() => toggle(o.id)} className="mt-0.5 accent-[var(--accent)]" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-ink" title={o.name}>{o.name}</span>
                    <span className="text-xs text-ink-3">{o.active ? "Activa · " : ""}{fmtMoney(o.spend)} en el rango · sin línea</span>
                  </span>
                </label>
                <p className="ml-6 mt-1.5 text-xs text-ink-3">Asignar a:</p>
                <div className="ml-6 mt-1 flex flex-wrap gap-1.5">
                  {LINEA_ORDER.map((l) => (
                    <button key={l} type="button" disabled={saving === o.id} onClick={() => void assign(o.id, l)}
                      className="inline-flex items-center gap-1.5 rounded-md border border-line bg-surface-2 px-2 py-1 text-xs font-medium text-ink-2 hover:border-accent hover:text-ink disabled:opacity-50">
                      <span className={`size-1.5 rounded-full ${LINE_DOT[l]}`} />{LINEAS[l].short}
                    </button>
                  ))}
                </div>
              </li>
            ))}
          </ul>
          {assignError && <p role="alert" className="px-2 pt-1 text-xs text-critical">{assignError}</p>}
          <div className="mt-2 flex items-center justify-between gap-2 border-t border-line pt-2">
            <span className="flex gap-3">
              <button type="button" onClick={() => apply("activas")} className="text-xs font-medium text-ink-2 hover:text-ink">
                Activas
              </button>
              <button type="button" onClick={() => apply("todas")} className="text-xs font-medium text-ink-2 hover:text-ink">
                Todas
              </button>
              <button type="button" onClick={() => setPicked(new Set())} disabled={picked.size === 0}
                className="text-xs font-medium text-ink-2 hover:text-ink disabled:opacity-40">
                Ninguna
              </button>
            </span>
            <button type="button" onClick={() => apply(picked)}
              className="whitespace-nowrap rounded-lg bg-ink px-3 py-1.5 text-sm font-medium text-plane hover:opacity-90">
              {picked.size ? `Aplicar (${picked.size})` : "Aplicar: todas"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
