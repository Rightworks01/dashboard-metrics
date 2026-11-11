"use client";

// Client Component: el portapapeles solo existe en el navegador.
import { useState } from "react";

export function CopyButton({ value, label }: { value: string; label: string }) {
  const [state, setState] = useState<"idle" | "ok" | "error">("idle");
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setState("ok");
    } catch {
      setState("error"); // p. ej. sin permiso de portapapeles: el número sigue visible para copiarlo a mano
    }
    setTimeout(() => setState("idle"), 1500);
  };
  return (
    <button type="button" onClick={copy} aria-label={label} title={label}
      className="rounded-md border border-line px-1.5 py-0.5 text-xs font-medium text-ink-2 hover:bg-surface-2 hover:text-ink">
      {state === "ok" ? "✓ Copiado" : state === "error" ? "No se pudo" : "Copiar"}
    </button>
  );
}
