"use client";

import { useState, type ReactNode } from "react";

export const META_LINK_DISMISS_COOKIE = "rw-meta-link-dismissed";

/**
 * Envuelve el banner de conexión rota: al pulsar "Conectar Facebook en GHL" se oculta y deja una cookie
 * con el día evaluado (`windowEnd`). Al día siguiente la ventana cambia y, si los leads siguen sin
 * llegar, el banner vuelve a salir.
 */
export function MetaLinkDismissable({ windowEnd, href, children }: { windowEnd: string; href: string; children: ReactNode }) {
  const [hidden, setHidden] = useState(false);
  if (hidden) return null;
  const dismiss = () => {
    const secure = location.protocol === "https:" ? "; secure" : "";
    document.cookie = `${META_LINK_DISMISS_COOKIE}=${windowEnd}; path=/; max-age=172800; samesite=lax${secure}`;
    setHidden(true);
  };
  return (
    <div role="alert" className="mb-5 flex flex-col gap-3 rounded-xl border border-critical/40 bg-critical-soft px-4 py-3 text-sm text-ink sm:flex-row sm:items-center sm:justify-between">
      {children}
      <a href={href} target="_blank" rel="noopener noreferrer" onClick={dismiss}
        className="inline-flex shrink-0 items-center justify-center rounded-lg bg-critical px-3 py-1.5 text-sm font-medium text-white hover:opacity-90">
        Conectar Facebook en GHL ↗
      </a>
    </div>
  );
}
