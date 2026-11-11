"use client";

// Client Component: el selector necesita estado (abierto, búsqueda, selección) antes de navegar.
// El filtro vive en la URL (?camp=id1,id2): las páginas lo leen en el servidor.
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { fmtMoney } from "@/lib/format";
import type { CampaignOption, CampaignScope } from "@/lib/metrics";

export function CampaignFilter({ options, scope }: { options: CampaignOption[]; scope: CampaignScope }) {
  // En "activas", los ids son los de las campañas activas ("0" = ninguna activa)
  const selected = scope.mode === "todas" ? [] : scope.ids.filter((id) => id !== "0");
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set(selected));
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
  const visible = options.filter((o) => o.name.toLowerCase().includes(query.toLowerCase()) || o.id.includes(query));
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
            {visible.length === 0 && <li className="px-2 py-3 text-sm text-ink-3">Sin campañas con gasto en este rango.</li>}
            {visible.map((o) => (
              <li key={o.id}>
                <label className="flex cursor-pointer items-start gap-2 rounded-md px-2 py-1.5 hover:bg-surface-2">
                  <input type="checkbox" checked={picked.has(o.id)} onChange={() => toggle(o.id)} className="mt-0.5 accent-[var(--accent)]" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-ink" title={o.name}>{o.name}</span>
                    <span className="text-xs text-ink-3">
                      {o.active ? "Activa · " : ""}{fmtMoney(o.spend)} en el rango
                    </span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
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
