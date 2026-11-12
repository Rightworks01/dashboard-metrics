import { cookies } from "next/headers";
import { MetaLinkDismissable, META_LINK_DISMISS_COOKIE } from "@/app/_components/meta-link-button";
import { fmtDay, fmtInt } from "@/lib/format";
import { ghlIntegrationsUrl, metaLinkHealth } from "@/lib/meta-link-health";

/**
 * Banner rojo si los leads de Meta dejaron de llegar a GHL (conexión de Facebook en GHL rota).
 * Se va solo cuando los leads vuelven a llegar (siguiente sincronización) o al pulsar el botón;
 * en ese caso vuelve al día siguiente si los leads siguen sin llegar.
 */
export async function MetaLinkBanner() {
  const health = await metaLinkHealth();
  if (!health?.broken) return null;
  if ((await cookies()).get(META_LINK_DISMISS_COOKIE)?.value === health.to) return null;
  return (
    <MetaLinkDismissable windowEnd={health.to} href={ghlIntegrationsUrl()}>
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
    </MetaLinkDismissable>
  );
}
