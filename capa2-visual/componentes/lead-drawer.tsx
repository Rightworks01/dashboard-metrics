"use client";

// Client Component solo para la mecánica del panel: cerrar con Esc / clic fuera, foco y bloquear el
// scroll del fondo. El contenido llega ya renderizado desde el servidor (children).
import { useRouter } from "next/navigation";
import { useEffect, useRef, type ReactNode } from "react";

export function LeadDrawer({ closeHref, labelledBy, children }: { closeHref: string; labelledBy: string; children: ReactNode }) {
  const router = useRouter();
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const close = () => router.replace(closeHref, { scroll: false });
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    document.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panel.current?.focus();
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = overflow; };
  }, [closeHref, router]);

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <button type="button" aria-label="Cerrar panel" onClick={() => router.replace(closeHref, { scroll: false })}
        className="absolute inset-0 cursor-default bg-black/30 backdrop-blur-[1px]" />
      <div ref={panel} role="dialog" aria-modal="true" aria-labelledby={labelledBy} tabIndex={-1}
        className="relative flex h-full w-full max-w-[540px] flex-col overflow-hidden border-l border-line bg-surface shadow-2xl outline-none">
        {children}
      </div>
    </div>
  );
}

/**
 * Fila de tabla clicable: abre el panel del lead salvo que el clic sea en un enlace o botón propio.
 * `focused`: la fila de la que venimos (p. ej. desde la etiqueta "Ganado"); se desplaza hasta ella.
 */
export function ClickableRow({ href, className = "", focused = false, children }: {
  href: string; className?: string; focused?: boolean; children: ReactNode;
}) {
  const router = useRouter();
  const row = useRef<HTMLTableRowElement>(null);
  useEffect(() => {
    if (focused) row.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [focused]);
  return (
    <tr ref={row} aria-current={focused ? "true" : undefined} className={`cursor-pointer ${className}`}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest("a,button")) return;
        router.push(href, { scroll: false });
      }}>
      {children}
    </tr>
  );
}
