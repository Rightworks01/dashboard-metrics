"use client";

import { useEffect, useState } from "react";

/**
 * Solo dentro de un iframe (Centro de Control en un Dashboard de GHL): si el navegador bloquea la sesión dentro
 * del CRM (Safari), después de entrar vuelve a pedir el login. Ofrece abrir el dashboard en una pestaña.
 */
export function InFrameNote() {
  const [inFrame, setInFrame] = useState(false);
  useEffect(() => {
    try { setInFrame(window.self !== window.top); } catch { setInFrame(true); }
  }, []);
  if (!inFrame) return null;
  return (
    <p className="text-center text-xs text-ink-3">
      Estás dentro del CRM. Si después de entrar te vuelve a pedir el login (pasa en Safari),{" "}
      <a href="/" target="_blank" rel="noopener noreferrer" className="font-medium text-accent hover:underline">abre el dashboard en una pestaña nueva ↗</a>.
    </p>
  );
}
