import Link from "next/link";

/** Pestañas de Reportes. `query` = from/to/camp para conservar período y campañas al cambiar. */
export function ReportTabs({ active, query }: { active: "inversion" | "seguimiento"; query: string }) {
  const tabs = [
    { key: "inversion", href: "/reportes", label: "Campañas e inversión" },
    { key: "seguimiento", href: "/reportes/seguimiento", label: "Seguimiento en el CRM" },
  ] as const;
  return (
    <nav className="flex gap-1 border-b border-line print:hidden" aria-label="Tipo de reporte">
      {tabs.map((t) => (
        <Link key={t.key} href={query ? `${t.href}?${query}` : t.href} aria-current={active === t.key ? "page" : undefined}
          className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium ${
            active === t.key ? "border-accent text-accent" : "border-transparent text-ink-2 hover:text-ink"}`}>
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
