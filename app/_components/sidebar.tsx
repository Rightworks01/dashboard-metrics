"use client";

// Client Component: necesita la ruta activa y conservar el rango (?from&to) al cambiar de sección.
import Image from "next/image";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { SyncButtons } from "@/app/_components/sync-buttons";
import { ThemeToggle } from "@/app/_components/theme-toggle";
import { TimeZonePicker } from "@/app/_components/timezone-picker";
import { signOut } from "@/app/login/actions";

// ads: solo para quien tiene acceso a anuncios; agent: visible también para usuarios limitados a un agente;
// admin: solo para administradores
type Item = { href: string; label: string; icon: string; soon?: boolean; ads?: boolean; agent?: boolean; admin?: boolean };

const SECTIONS: { title: string; items: Item[] }[] = [
  {
    title: "Rendimiento",
    items: [
      { href: "/", label: "Resumen", icon: "M3 13h8V3H3zm0 8h8v-6H3zm10 0h8V11h-8zm0-18v6h8V3z" },
      { href: "/leads", label: "Leads", agent: true, icon: "M16 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6m-8 0a3 3 0 1 0 0-6 3 3 0 0 0 0 6m0 2c-2.3 0-7 1.2-7 3.5V19h14v-2.5C15 14.2 10.3 13 8 13m8 0-.9.1A4.2 4.2 0 0 1 17 16.5V19h6v-2.5c0-2.3-4.7-3.5-7-3.5" },
      { href: "/campanas", label: "Campañas", ads: true, icon: "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20m0 4a6 6 0 1 1 0 12 6 6 0 0 1 0-12m0 3a3 3 0 1 0 0 6 3 3 0 0 0 0-6" },
      { href: "/anuncios", label: "Anuncios", ads: true, icon: "M3 11v2h3l5 4V7L6 11zm13.5 1A4.5 4.5 0 0 0 14 8v8a4.5 4.5 0 0 0 2.5-4M14 3.2v2.1a7 7 0 0 1 0 13.4v2.1a9 9 0 0 0 0-17.6" },
      { href: "/audiencia", label: "Audiencia", agent: true, icon: "M12 2C8.1 2 5 5.1 5 9c0 5.2 7 13 7 13s7-7.8 7-13c0-3.9-3.1-7-7-7m0 9.5a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5" },
    ],
  },
  {
    title: "Operación",
    items: [
      { href: "/respuesta", label: "Respuesta", agent: true, icon: "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20m1 11h-6v-2h4V6h2z" },
      { href: "/calidad", label: "Calidad de datos", icon: "M12 2 4 5v6c0 5 3.4 9.7 8 11 4.6-1.3 8-6 8-11V5zm-1 14-4-4 1.4-1.4 2.6 2.6 5.6-5.6L18 9z" },
    ],
  },
  {
    title: "Administración",
    items: [
      { href: "/accesos", label: "Accesos", admin: true, icon: "M12 1 3 5v6c0 5.6 3.8 10.7 9 12 5.2-1.3 9-6.4 9-12V5zm0 6a3 3 0 1 1 0 6 3 3 0 0 1 0-6m0 14c-2.5-.8-4.6-2.6-5.7-5 .9-1.4 3.5-2 5.7-2s4.8.6 5.7 2c-1.1 2.4-3.2 4.2-5.7 5" },
    ],
  },
];

function Icon({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-4 shrink-0 fill-current">
      <path d={d} />
    </svg>
  );
}

export function Sidebar({ email, adsAccess, agentOnly, isAdmin }: { email: string | null; adsAccess: boolean; agentOnly: boolean; isAdmin: boolean }) {
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
    <aside className="z-20 flex shrink-0 flex-col border-line bg-surface max-md:sticky max-md:top-0 max-md:border-b md:sticky md:top-0 md:h-screen md:w-60 md:border-r">
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
        {SECTIONS.map((section) => ({ ...section, items: section.items.filter((item) => (adsAccess || !item.ads) && (isAdmin || !item.admin) && (!agentOnly || item.agent || (isAdmin && item.admin))) }))
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
                  <Icon d={item.icon} />
                  {item.label}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="hidden border-t border-line px-4 py-3 md:block">
        {isAdmin && <SyncButtons />}
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
