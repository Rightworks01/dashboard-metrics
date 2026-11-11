"use client";

// Client Component: la ficha se posiciona en coordenadas de pantalla (position: fixed) para que
// no la recorten las tablas con scroll. Se abre al pasar el mouse o al enfocar con teclado.
import Link from "next/link";
import { useRef, useState } from "react";
import { LocalTime } from "@/app/_components/local-time";
import { titleCase } from "@/lib/format";
import type { Lead } from "@/lib/leads";

const CARD_W = 320;

function Row({ label, value, mono }: { label: string; value: string | null; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="shrink-0 text-ink-3">{label}</dt>
      <dd className={`truncate text-right text-ink ${mono ? "font-mono text-[11px]" : ""}`} title={value ?? undefined}>{value ?? "—"}</dd>
    </div>
  );
}

/** `href` = abrir el panel del lead; sin él, el nombre lleva al contacto en GHL. */
export function LeadName({ lead, href }: { lead: Lead; href?: string }) {
  const name = lead.name ? titleCase(lead.name) : "Sin nombre";
  const ref = useRef<HTMLSpanElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number; above: boolean } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function show() {
    if (timer.current) clearTimeout(timer.current);
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    const above = r.bottom + 300 > window.innerHeight; // sin espacio abajo: abrir hacia arriba
    setPos({ top: above ? r.top - 4 : r.bottom + 4, left: Math.min(r.left, window.innerWidth - CARD_W - 8), above });
  }
  // Pequeño retraso al salir para poder mover el mouse hasta la ficha y usar sus enlaces
  function hide() {
    timer.current = setTimeout(() => setPos(null), 150);
  }

  return (
    <span ref={ref} className="inline-block max-w-full" onMouseEnter={show} onMouseLeave={hide} onFocus={show} onBlur={hide}>
      {href ? (
        <Link href={href} scroll={false}
          className="block truncate text-[15px] font-semibold text-ink underline decoration-ink-3/40 decoration-dotted underline-offset-4 hover:text-accent">
          {name}
        </Link>
      ) : (
        <a href={lead.contact_url} target="_blank" rel="noreferrer"
          className="block truncate text-[15px] font-semibold text-ink underline decoration-ink-3/40 decoration-dotted underline-offset-4 hover:text-accent">
          {name}
        </a>
      )}
      {pos && (
        <span role="tooltip" onMouseEnter={show} onMouseLeave={hide}
          style={{ position: "fixed", left: pos.left, top: pos.top, width: CARD_W, transform: pos.above ? "translateY(-100%)" : undefined }}
          className="card z-50 block p-3 text-left text-xs">
          <span className="mb-2 block text-sm font-semibold text-ink">{name}</span>
          <dl className="space-y-1">
            <Row label="Campaña" value={lead.campaign_name} />
            <Row label="Campaign ID" value={lead.campaign_id} mono />
            <Row label="Ad set ID" value={lead.adset_id} mono />
            <Row label="Ad ID" value={lead.ad_id} mono />
            <Row label="Contacto GHL" value={lead.id_ghl} mono />
            <Row label="Agente" value={lead.agent_name ?? lead.assigned_to} />
            {/* Ya viene resuelto: el campo de estado que tenga valor ("Estado", "States" o el State estándar) */}
            <Row label="State / States"
              value={lead.state ? (lead.state_code && lead.state_code !== lead.state ? `${lead.state} (${lead.state_code})` : lead.state) : null} />
            <Row label="Etapa" value={lead.stage ? `${lead.stage}${lead.opp_status && lead.opp_status !== "open" ? ` (${lead.opp_status})` : ""}` : null} />
            <div className="flex justify-between gap-3">
              <dt className="text-ink-3">Entró</dt>
              <dd className="text-ink"><LocalTime iso={lead.created_at} /></dd>
            </div>
          </dl>
          <span className="mt-2 flex gap-3 border-t border-line pt-2">
            <a href={lead.contact_url} target="_blank" rel="noreferrer" className="font-medium text-accent hover:underline">Contacto en GHL ↗</a>
            {lead.conversation_url && (
              <a href={lead.conversation_url} target="_blank" rel="noreferrer" className="font-medium text-accent hover:underline">Conversación ↗</a>
            )}
          </span>
        </span>
      )}
    </span>
  );
}
