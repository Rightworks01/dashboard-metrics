"use client";

// Client Component: un <select> nativo que navega al cambiar (accesible con teclado y lectores de
// pantalla). El valor vive en la URL (?estado=TX, ?agente=ID…); "" = todos.
import { usePathname, useRouter, useSearchParams } from "next/navigation";

export type FilterOption = { value: string; label: string; count: number };

export function FilterSelect({ param, label, icon, allLabel, options, selected, total }: {
  param: string; // nombre del parámetro en la URL
  label: string; // para lectores de pantalla
  icon: string; // path SVG 24×24
  allLabel: string; // "Todos los estados"
  options: FilterOption[];
  selected?: string;
  total: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  function change(value: string) {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(param, value);
    else next.delete(param);
    next.delete("lead"); // cerrar el panel del lead al cambiar de selección
    next.delete("foco"); // y quitar el resaltado
    router.push(`${pathname}?${next.toString()}`, { scroll: false });
  }

  const active = !!selected;
  return (
    <label className={`inline-flex items-center gap-2 rounded-xl border px-3 py-1.5 text-sm shadow-sm ${
      active ? "border-accent bg-accent-soft text-accent" : "border-line bg-surface text-ink-2"
    }`}>
      <svg viewBox="0 0 24 24" aria-hidden="true" className="size-4 shrink-0 fill-current"><path d={icon} /></svg>
      <span className="sr-only">{label}</span>
      <select value={selected ?? ""} onChange={(e) => change(e.target.value)}
        className="max-w-56 cursor-pointer truncate bg-transparent pr-1 font-medium outline-none [field-sizing:content] [&>option]:bg-surface [&>option]:text-ink">
        <option value="">{allLabel} ({total})</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label} ({o.count})</option>
        ))}
      </select>
    </label>
  );
}
