// Piezas con el aspecto de Ads Manager para Publicar: árbol Campaña → Conjunto → Anuncio, tarjetas de sección,
// avatar de la página e íconos. Solo dibujan (sin estado ni datos).

const PATHS = {
  globe: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm-9 9h18M12 3c2.5 2.5 3.8 5.5 3.8 9s-1.3 6.5-3.8 9c-2.5-2.5-3.8-5.5-3.8-9S9.5 5.5 12 3Z",
  dots: "M5 12h.01M12 12h.01M19 12h.01",
  close: "M6 6l12 12M18 6 6 18",
  like: "M7 10v10H4V10h3Zm0 0 4-7c1.7 0 2.5 1 2.2 2.6L12.6 9H19a2 2 0 0 1 2 2.3l-1.2 7A2 2 0 0 1 17.8 20H7",
  comment: "M4 5h16v11H8l-4 4V5Z",
  share: "M14 4l7 7-7 7v-4c-5 0-8 1.5-10 5 .5-5.5 3.5-9.5 10-10V4Z",
  heart: "M12 20s-7.5-4.6-9.2-9.3C1.7 7.6 3.7 4.5 7 4.5c2 0 3.6 1.1 5 3 1.4-1.9 3-3 5-3 3.3 0 5.3 3.1 4.2 6.2C19.5 15.4 12 20 12 20Z",
  send: "M21 3 3 10.5l7 2.5m11-10-8 18-3-8m11-10L10 13",
  bookmark: "M6 3h12v18l-6-4.5L6 21V3Z",
  image: "M4 5h16v14H4V5Zm0 11 4.5-4.5L13 16m-2-2 3-3 6 6M15.5 9a1 1 0 1 1 0-.01",
  campaign: "M3 7h6l2 2h10v10H3V7Z",
  adset: "M4 4h7v7H4V4Zm9 0h7v7h-7V4ZM4 13h7v7H4v-7Zm9 0h7v7h-7v-7Z",
  ad: "M4 4h16v16H4V4Zm0 11h16",
  check: "M5 12.5 10 17l9-10",
  phone: "M8 2h8a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Zm3 17h2",
} as const;
export type IconName = keyof typeof PATHS;

export function Icon({ name, className = "size-4" }: { name: IconName; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d={PATHS[name]} />
    </svg>
  );
}

/** Foto de perfil de la página (o la inicial si Meta no la dio). */
export function Avatar({ src, name, className = "size-10", ring = false }: { src?: string | null; name: string; className?: string; ring?: boolean }) {
  const ringCls = ring ? "ring-2 ring-accent ring-offset-2 ring-offset-surface" : "";
  return src
    ? <img src={src} alt="" className={`${className} ${ringCls} shrink-0 rounded-full object-cover`} />
    : <span className={`${className} ${ringCls} flex shrink-0 items-center justify-center rounded-full bg-accent text-sm font-semibold text-white`}>{name.trim().charAt(0).toUpperCase() || "?"}</span>;
}

export type TreeItem = { id: string; level: 0 | 1 | 2; label: string; placeholder: string; done: boolean };
const TREE_ICON: Record<TreeItem["level"], IconName> = { 0: "campaign", 1: "adset", 2: "ad" };

/** Árbol de la izquierda de Ads Manager: Campaña → Conjunto de anuncios → Anuncios. Cada fila salta a su sección. */
export function MetaTree({ items, activeId }: { items: TreeItem[]; activeId?: string }) {
  return (
    <nav aria-label="Estructura de la campaña" className="card p-2 text-sm">
      <ul className="space-y-0.5">
        {items.map((it) => (
          <li key={it.id}>
            <a href={`#${it.id}`} style={{ paddingLeft: `${0.5 + it.level * 1.1}rem` }}
              className={`flex items-center gap-2 rounded-md py-1.5 pr-2 hover:bg-surface-2 ${activeId === it.id ? "bg-accent-soft text-ink" : "text-ink-2"}`}>
              <Icon name={TREE_ICON[it.level]} className="size-4 shrink-0 text-ink-3" />
              <span className={`min-w-0 flex-1 truncate ${it.label.trim() ? "" : "text-ink-3"}`}>{it.label.trim() || it.placeholder}</span>
              {it.done
                ? <Icon name="check" className="size-4 shrink-0 text-good-ink" />
                : <span className="size-2 shrink-0 rounded-full bg-warning-ink" title="Falta completar" />}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** Encabezado de nivel (Campaña / Conjunto / Anuncio) como en el panel de edición de Ads Manager. */
export function LevelHeader({ level, title, subtitle }: { level: TreeItem["level"]; title: string; subtitle?: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="flex size-7 items-center justify-center rounded-md bg-accent-soft text-accent"><Icon name={TREE_ICON[level]} className="size-4" /></span>
      <div className="min-w-0">
        <p className="text-xs font-medium uppercase tracking-wide text-ink-3">{["Campaña", "Conjunto de anuncios", "Anuncio"][level]}</p>
        <h2 className="truncate text-base font-semibold text-ink">{title}{subtitle && <span className="ml-2 text-sm font-normal text-ink-3">{subtitle}</span>}</h2>
      </div>
    </div>
  );
}

/** Tarjeta de sección del panel de edición ("Presupuesto y calendario", "Público"…). */
export function MetaCard({ title, help, children }: { title: string; help?: string; children: React.ReactNode }) {
  return (
    <section className="card space-y-3 p-4">
      <div>
        <h3 className="text-[0.95rem] font-semibold text-ink">{title}</h3>
        {help && <p className="mt-0.5 text-xs text-ink-3">{help}</p>}
      </div>
      {children}
    </section>
  );
}
