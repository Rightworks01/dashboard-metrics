"use client";

import { useEffect, useState } from "react";

/**
 * Solo dentro de un iframe (Centro de Control en un Dashboard de GHL): si el navegador bloquea la sesión dentro
 * del CRM (Safari), después de entrar vuelve a pedir el login. Ofrece abrir el dashboard en una pestaña.
 */
export function InFrameNote({ fromGhl = false }: { fromGhl?: boolean }) {
  const [inFrame, setInFrame] = useState(false);
  useEffect(() => {
    try { setInFrame(window.self !== window.top); } catch { setInFrame(true); }
  }, []);
  if (!inFrame) return null;
  if (fromGhl) {
    // Llegó desde /sso (p. ej. el widget IFrame de un Dashboard de GHL, donde GHL no entrega el usuario)
    return (
      <p className="rounded-lg bg-accent-soft px-3 py-2 text-center text-xs text-ink-2">
        Para entrar sin contraseña, abre <strong>Centro de Control RW</strong> en el menú lateral de GHL una vez.
        Después este recuadro usa esa misma sesión.
      </p>
    );
  }
  return (
    <p className="text-center text-xs text-ink-3">
      Estás dentro del CRM. Si después de entrar te vuelve a pedir el login (pasa en Safari),{" "}
      <a href="/" target="_blank" rel="noopener noreferrer" className="font-medium text-accent hover:underline">abre el dashboard en una pestaña nueva ↗</a>.
    </p>
  );
}
