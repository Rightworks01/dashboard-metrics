import { fmtDay, fmtInt } from "@/lib/format";
import { ghlIntegrationsUrl, metaLinkHealth } from "@/lib/meta-link-health";

/** Banner rojo si los leads de Meta dejaron de llegar a GHL (conexión de Facebook en GHL rota). */
export async function MetaLinkBanner() {
  const health = await metaLinkHealth();
  if (!health?.broken) return null;
  return (
    <div role="alert" className="mb-5 flex flex-col gap-3 rounded-xl border border-critical/40 bg-critical-soft px-4 py-3 text-sm text-ink sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-2.5">
        <svg viewBox="0 0 24 24" aria-hidden="true" className="mt-0.5 size-4 shrink-0 fill-current text-critical">
          <path d="M1 21h22L12 2zm12-3h-2v-2h2zm0-4h-2v-4h2z" />
        </svg>
        <p>
          <strong className="text-critical">Los leads de Meta no están llegando a GHL.</strong>{" "}
          Del {fmtDay(health.from)} al {fmtDay(health.to)} Meta reporta{" "}
          <strong className="tabular-nums">{fmtInt(health.metaLeads)}</strong> leads y en GHL entraron{" "}
          <strong className="tabular-nums">{fmtInt(health.ghlLeads)}</strong> con atribución. Probablemente se desconectó
          Facebook en GHL: vuelve a conectarlo en Integraciones.
        </p>
      </div>
      <a href={ghlIntegrationsUrl()} target="_blank" rel="noopener noreferrer"
        className="inline-flex shrink-0 items-center justify-center rounded-lg bg-critical px-3 py-1.5 text-sm font-medium text-white hover:opacity-90">
        Conectar Facebook en GHL ↗
      </a>
    </div>
  );
}
