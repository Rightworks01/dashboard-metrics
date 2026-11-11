"use client";

// Switch de estado de una campaña. Pide confirmación porque activar una campaña gasta dinero.
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

export function CampaignToggle({ id, name, active, disabled }: { id: string; name: string; active: boolean; disabled?: boolean }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const next = active ? "PAUSED" : "ACTIVE";

  function apply() {
    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch("/api/meta/campaigns/status", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ campaign_id: id, status: next }),
        });
        const json = (await res.json().catch(() => ({}))) as { error?: string };
        if (!res.ok) throw new Error(json.error ?? `Error ${res.status}`);
        setConfirming(false);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "No se pudo cambiar el estado");
      }
    });
  }

  if (confirming) {
    return (
      <div className="flex flex-col items-end gap-1">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={apply}
            disabled={pending}
            className={`rounded-lg px-2.5 py-1 text-xs font-medium text-white disabled:opacity-60 ${active ? "bg-critical" : "bg-good-ink"}`}
          >
            {pending ? "Aplicando…" : active ? "Pausar" : "Activar"}
          </button>
          <button
            type="button"
            onClick={() => {
              setConfirming(false);
              setError(null);
            }}
            disabled={pending}
            className="rounded-lg px-2 py-1 text-xs text-ink-2 hover:bg-surface-2"
          >
            Cancelar
          </button>
        </div>
        {error && <p className="max-w-56 text-right text-xs text-critical">{error}</p>}
      </div>
    );
  }

  return (
    <button
      type="button"
      role="switch"
      aria-checked={active}
      aria-label={`${active ? "Pausar" : "Activar"} ${name}`}
      title={disabled ? "No tienes permiso para cambiar campañas" : active ? "Pausar campaña" : "Activar campaña"}
      disabled={disabled}
      onClick={() => setConfirming(true)}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
        active ? "bg-good" : "bg-ink-3/40"
      }`}
    >
      <span className={`inline-block size-5 rounded-full bg-white shadow transition-transform ${active ? "translate-x-5.5" : "translate-x-0.5"}`} />
    </button>
  );
}

export function SyncCampaignsButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState(false);
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          setError(false);
          const res = await fetch("/api/meta/campaigns/sync", { method: "POST" }).catch(() => null);
          if (!res?.ok) setError(true);
          router.refresh();
        })
      }
      className="inline-flex items-center gap-1.5 rounded-lg border border-line px-2.5 py-1.5 text-xs font-medium text-ink-2 hover:bg-surface-2 disabled:opacity-60"
    >
      <svg viewBox="0 0 16 16" className={`size-3.5 ${pending ? "animate-spin" : ""}`} fill="none" stroke="currentColor" strokeWidth="1.6">
        <path d="M13.5 8a5.5 5.5 0 1 1-1.6-3.9M13.5 2.5v2.5H11" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {pending ? "Sincronizando…" : error ? "Reintentar" : "Sincronizar con Meta"}
    </button>
  );
}
