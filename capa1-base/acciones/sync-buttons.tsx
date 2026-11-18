"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Job = "ghl" | "meta";
const LABELS: Record<Job, string> = { ghl: "Sincronizar GHL", meta: "Sincronizar Meta" };

/** Botones de sincronización a pedido (solo admins). Pueden tardar hasta unos minutos. */
export function SyncButtons() {
  const router = useRouter();
  const [running, setRunning] = useState<Job | null>(null);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  const run = async (job: Job) => {
    setRunning(job);
    setResult(null);
    try {
      const res = await fetch(`/api/sync?job=${job}`, { method: "POST" });
      const body = (await res.json().catch(() => ({}))) as { summary?: string; error?: string };
      setResult(res.ok ? { ok: true, text: body.summary ?? "Listo" } : { ok: false, text: body.error ?? "Falló la sincronización" });
      if (res.ok) router.refresh();
    } catch {
      setResult({ ok: false, text: "Sin conexión con el servidor" });
    } finally {
      setRunning(null);
    }
  };

  return (
    <div className="mb-3">
      <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-ink-3">Sincronizar ahora</p>
      <div className="flex gap-1.5">
        {(["ghl", "meta"] as const).map((job) => (
          <button key={job} type="button" disabled={running !== null} onClick={() => run(job)}
            className="inline-flex flex-1 items-center justify-center gap-1 rounded-lg border border-line px-2 py-1.5 text-xs font-medium text-ink-2 hover:bg-surface-2 disabled:opacity-60">
            <svg viewBox="0 0 16 16" aria-hidden="true" className={`size-3 ${running === job ? "animate-spin" : ""}`} fill="none" stroke="currentColor" strokeWidth="1.6">
              <path d="M13.5 8a5.5 5.5 0 1 1-1.6-3.9M13.5 2.5v2.5H11" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {running === job ? "…" : LABELS[job].replace("Sincronizar ", "")}
          </button>
        ))}
      </div>
      <p role="status" aria-live="polite" className={`mt-1.5 text-[11px] leading-snug ${result?.ok === false ? "text-critical" : "text-ink-3"}`}>
        {running ? `${LABELS[running]}… puede tardar unos minutos.` : result?.text ?? ""}
      </p>
    </div>
  );
}
