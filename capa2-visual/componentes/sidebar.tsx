"use client";

// Client Component: necesita la ruta activa y conservar el rango (?from&to) al cambiar de sección.
import Image from "next/image";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import type { ReactNode } from "react";
import { ThemeToggle } from "@visual/componentes/theme-toggle";
import { TimeZonePicker } from "@visual/componentes/timezone-picker";

// Solo lo visual del menú (orden, nombres, íconos). QUIÉN ve cada sección lo decide la Capa 3
// (capa3-cuentas/roles.ts): el layout pasa `allowed` con las claves permitidas.
// `perm` = clave de permiso si es distinta de `key` (dos entradas pueden compartir un permiso).
// `tone` = color del ícono (las pestañas de Leads usan el color de su línea, como en los filtros).
// `icon2` = segundo ícono dentro del mismo cuadro (Comercial: casa arriba a la izquierda + carro abajo a la derecha).
type Item = { key: string; perm?: string; href: string; label: string; icon: string; icon2?: string; tone?: string; soon?: boolean };

const SECTIONS: { title: string; items: Item[] }[] = [
  {
    title: "Rendimiento",
    items: [
      { key: "resumen", href: "/", label: "Resumen", icon: "M3 13h8V3H3zm0 8h8v-6H3zm10 0h8V11h-8zm0-18v6h8V3z" },
      { key: "leads-vida", perm: "leads", href: "/leads/vida", label: "Leads Vida", icon: "M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54z", tone: "text-series-1" },
      { key: "leads-comercial", perm: "leads", href: "/leads/comercial", label: "Leads Comercial", icon: "M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z", icon2: "M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11c-.66 0-1.21.42-1.42 1.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8zM6.5 16c-.83 0-1.5-.67-1.5-1.5S5.67 13 6.5 13s1.5.67 1.5 1.5S7.33 16 6.5 16m11 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5M5 11l1.5-4.5h11L19 11z", tone: "text-series-3" },
      { key: "leads-reclutamiento", perm: "leads", href: "/leads/reclutamiento", label: "Leads Reclutamiento", icon: "M15 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4m-9-2V7H4v3H1v2h3v3h2v-3h3v-2zm9 4c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4", tone: "text-series-2" },
      { key: "campanas", href: "/campanas", label: "Campañas", icon: "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20m0 4a6 6 0 1 1 0 12 6 6 0 0 1 0-12m0 3a3 3 0 1 0 0 6 3 3 0 0 0 0-6" },
      { key: "publicar", href: "/publicar", label: "Publicar", icon: "M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6z" },
      { key: "anuncios", href: "/anuncios", label: "Anuncios", icon: "M3 11v2h3l5 4V7L6 11zm13.5 1A4.5 4.5 0 0 0 14 8v8a4.5 4.5 0 0 0 2.5-4M14 3.2v2.1a7 7 0 0 1 0 13.4v2.1a9 9 0 0 0 0-17.6" },
      { key: "audiencia", href: "/audiencia", label: "Audiencia", icon: "M12 2C8.1 2 5 5.1 5 9c0 5.2 7 13 7 13s7-7.8 7-13c0-3.9-3.1-7-7-7m0 9.5a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5" },
    ],
  },
  {
    title: "Operación",
    items: [
      { key: "respuesta", href: "/respuesta", label: "Respuesta", icon: "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20m1 11h-6v-2h4V6h2z" },
      { key: "calidad", href: "/calidad", label: "Calidad de datos", icon: "M12 2 4 5v6c0 5 3.4 9.7 8 11 4.6-1.3 8-6 8-11V5zm-1 14-4-4 1.4-1.4 2.6 2.6 5.6-5.6L18 9z" },
    ],
  },
  {
    title: "Administración",
    items: [
      { key: "reportes", href: "/reportes", label: "Reportes", icon: "M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8zm2 16H8v-2h8zm0-4H8v-2h8zm-3-5V3.5L18.5 9z" },
      { key: "accesos", href: "/accesos", label: "Accesos", icon: "M12 1 3 5v6c0 5.6 3.8 10.7 9 12 5.2-1.3 9-6.4 9-12V5zm0 6a3 3 0 1 1 0 6 3 3 0 0 1 0-6m0 14c-2.5-.8-4.6-2.6-5.7-5 .9-1.4 3.5-2 5.7-2s4.8.6 5.7 2c-1.1 2.4-3.2 4.2-5.7 5" },
    ],
  },
];

function Icon({ d, d2, tone }: { d: string; d2?: string; tone?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={`size-4 shrink-0 fill-current ${tone ?? ""}`}>
      {d2 ? (
        <>
          <path d={d} transform="translate(-1 -1.5) scale(0.8)" />
          {/* borde del color del menú para que el carro se separe de la casa */}
          <path d={d2} transform="translate(8 9) scale(0.66)" stroke="var(--surface)" strokeWidth={3.5} paintOrder="stroke" />
        </>
      ) : <path d={d} />}
    </svg>
  );
}

/**
 * `allowed` = secciones que ve la cuenta (Capa 3). `tools` = botones extra del pie (p. ej. sincronizar, Capa 1).
 * `signOut` = acción de cerrar sesión (Capa 3).
 */
export function Sidebar({ email, allowed, tools, signOut }: {
  email: string | null; allowed: readonly string[]; tools?: ReactNode; signOut: () => Promise<void>;
}) {
  const pathname = usePathname();
  const query = useSearchParams().toString();
  const withRange = (href: string) => {
    const params = new URLSearchParams(query);
    params.delete("sort"); // el orden de la tabla de anuncios no aplica a otras secciones
    params.delete("dir");
    params.delete("todas");
    for (const k of ["etapa", "anuncio", "agente", "estado", "lead", "foco"]) params.delete(k); // filtros propios de Leads
    const qs = params.toString();
    return qs ? `${href}?${qs}` : href;
  };

  return (
    <aside className="z-20 flex shrink-0 print:hidden flex-col border-line bg-surface max-md:sticky max-md:top-0 max-md:border-b md:sticky md:top-0 md:h-screen md:w-60 md:border-r">
      <div className="flex items-center justify-between gap-3 px-4 py-3 md:py-5">
        <div className="flex items-center gap-3">
          <Image src="/logo-mark.png" alt="Right Works" width={40} height={40} priority
            className="size-10 rounded-xl object-cover shadow-sm ring-1 ring-line" />
          <div>
            <p className="text-sm font-semibold leading-tight text-ink">Right Works</p>
            <p className="text-xs text-ink-3">Meta Ads → GHL</p>
          </div>
        </div>
        <div className="flex items-center gap-1 md:hidden">
          <ThemeToggle compact />
          <form action={signOut}>
            <button type="submit" className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-ink-2 hover:bg-surface-2">Salir</button>
          </form>
        </div>
      </div>

      <nav className="flex gap-1 overflow-x-auto px-2 pb-2 md:flex-1 md:flex-col md:gap-5 md:overflow-visible md:px-3 md:pb-0">
        {SECTIONS.map((section) => ({ ...section, items: section.items.filter((item) => allowed.includes(item.perm ?? item.key)) }))
          .filter((section) => section.items.length > 0).map((section) => (
          <div key={section.title} className="flex gap-1 md:flex-col">
            <p className="hidden px-2 pb-1 text-[11px] font-medium uppercase tracking-wide text-ink-3 md:block">{section.title}</p>
            {section.items.map((item) => {
              if (item.soon) {
                return (
                  <span key={item.href} aria-disabled="true"
                    className="flex shrink-0 items-center gap-2 rounded-lg px-2.5 py-2 text-sm text-ink-3 max-md:hidden">
                    <Icon d={item.icon} />
                    <span className="min-w-0 truncate">{item.label}</span>
                    <span className="ml-auto shrink-0 rounded bg-surface-2 px-1.5 text-[10px] font-medium">Pronto</span>
                  </span>
                );
              }
              const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
              return (
                <Link key={item.href} href={withRange(item.href)} aria-current={active ? "page" : undefined}
                  className={`flex shrink-0 items-center gap-2 whitespace-nowrap rounded-lg px-2.5 py-2 text-sm font-medium transition-colors ${
                    active ? "bg-accent-soft text-accent" : "text-ink-2 hover:bg-surface-2 hover:text-ink"
                  }`}>
                  <Icon d={item.icon} d2={item.icon2} tone={item.tone} />
                  {item.label}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="hidden border-t border-line px-4 py-3 md:block">
        {tools}
        <div className="-mx-2 mb-2"><ThemeToggle /></div>
        {/* También en celular (oculto con CSS, pero montado): guarda la zona en uso en la cookie */}
        <div className="mb-3"><TimeZonePicker /></div>
        {email && <p className="truncate text-xs text-ink-3" title={email}>{email}</p>}
        <form action={signOut}>
          <button type="submit" className="mt-1 text-sm font-medium text-ink-2 hover:text-ink">Cerrar sesión</button>
        </form>
      </div>
    </aside>
  );
}
