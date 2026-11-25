import Link from "next/link";
import { LeadDetail } from "@visual/componentes/lead-detail";
import { LeadDrawer } from "@visual/componentes/lead-drawer";
import { LeadsTable } from "@visual/componentes/leads-table";
import { UpcomingAppointments } from "@visual/componentes/upcoming-appointments";
import { FilterSelect, type FilterOption } from "@visual/componentes/filter-select";
import { Card, ErrorNote, Kpi, PageHeader } from "@visual/componentes/ui";
import { fmtDuration, fmtInt } from "@base/util/format";
import {
  countLeads, defaultLeadSort, filterLeads, firstContactMs, getAgentName, getContactInfo, getLeads, getUpcomingAppointments, getLeadTimeline, LEAD_FILTERS, parseLeadFilter, parseLeadSort, sortLeads,
  type LeadFilter,
} from "@base/datos/leads";
import { agentScope, myAccess } from "@cuentas/auth";
import { puede } from "@cuentas/roles";
import { UnlinedCampaignsNote } from "@visual/componentes/unlined-note";
import { logError } from "@base/conexiones/log";
import { getCampaignOptions, getCampaigns, resolveCampaignScope, resolveRange } from "@base/datos/metrics";
import { LINEAS, resolveLine, type Linea } from "@base/util/lineas";
import { getFixedLines } from "@base/datos/campaign-lines";
import { US_STATES } from "@base/util/us-states";
import { campaignStartDay } from "@base/util/campaign-age";

export type LeadsSearchParams = Promise<{
  from?: string; to?: string; camp?: string; etapa?: string; anuncio?: string; agente?: string; estado?: string; sort?: string; dir?: string;
  lead?: string; // panel lateral abierto
  foco?: string; // lead a resaltar (venimos de su etiqueta "Ganado")

}>;

// Íconos de las pestañas (SVG 24×24, color del texto)
const TAB_ICONS: Record<LeadFilter, string> = {
  todos: "M16 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6m-8 0a3 3 0 1 0 0-6 3 3 0 0 0 0 6m0 2c-2.3 0-7 1.2-7 3.5V19h14v-2.5C15 14.2 10.3 13 8 13m8 0-.9.1A4.2 4.2 0 0 1 17 16.5V19h6v-2.5c0-2.3-4.7-3.5-7-3.5",
  contactado: "M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1A17 17 0 0 1 3 4c0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1z",
  respondio: "M20 2H4a2 2 0 0 0-2 2v18l4-4h14a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2M6 9h12v2H6zm8 5H6v-2h8zm4-6H6V6h12z",
  cita: "M19 4h-1V2h-2v2H8V2H6v2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2m0 16H5V9h14zM7 11h5v5H7z",
  ganado: "M19 5h-2V3H7v2H5a2 2 0 0 0-2 2v1c0 2.5 1.9 4.6 4.4 4.9A5 5 0 0 0 11 15.9V19H7v2h10v-2h-4v-3.1a5 5 0 0 0 3.6-3C19.1 12.6 21 10.5 21 8V7a2 2 0 0 0-2-2M5 8V7h2v3.8A3 3 0 0 1 5 8m14 0a3 3 0 0 1-2 2.8V7h2z",
  sin_contacto: "M1 21h22L12 2zm12-3h-2v-2h2zm0-4h-2v-4h2z",
};

const PIN_ICON = "M12 2C8.1 2 5 5.1 5 9c0 5.2 7 13 7 13s7-7.8 7-13c0-3.9-3.1-7-7-7m0 9.5a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5";
const AGENT_ICON = "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8m0 2c-2.7 0-8 1.3-8 4v2h16v-2c0-2.7-5.3-4-8-4";

/** Opciones con conteo, de más a menos leads; `missing` agrega "Sin …" al final si hay. */
function toOptions(counts: Map<string, { label: string; count: number }>, missing: number, missingLabel: string): FilterOption[] {
  const opts = [...counts.entries()]
    .map(([value, v]) => ({ value, label: v.label, count: v.count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  return missing > 0 ? [...opts, { value: "sin", label: missingLabel, count: missing }] : opts;
}

const isId = (v?: string) => (v && /^[\w-]+$/.test(v) ? v : undefined);

/**
 * Lista de leads. `linea` = solo los de esa línea (Vida / Comercial / Reclutamiento: la fijada por un admin o
 * la automática por el nombre de la campaña, `resolveLine`); null = todos, también los de campañas sin línea
 * (adonde llegan los enlaces de reportes y Resumen).
 */
export async function LeadsView({ searchParams, linea }: { searchParams: LeadsSearchParams; linea: Linea | null }) {
  const basePath = linea ? LINEAS[linea].path : "/leads";
  const pageTitle = linea ? LINEAS[linea].label : "Leads";
  const scopeAgent = await agentScope(); // Capa 3: null = la cuenta ve todo
  const params = await searchParams;
  // Pestaña de una línea, sin ?camp: TODAS las campañas de esa línea (activas y pausadas), no solo las activas.
  // Sin ?from: desde el día en que arrancó la más antigua de las campañas que se ven, hasta hoy.
  let campScope = await resolveCampaignScope(params.camp);
  let lineStart: string | undefined;
  if (linea) {
    try {
      const [cat, fixed] = await Promise.all([getCampaigns(), getFixedLines()]);
      if (!params.camp) {
        const ids = cat.filter((c) => resolveLine(c.name, fixed.get(c.id)).line === linea).map((c) => c.id);
        campScope = { mode: "custom", ids: ids.length ? ids : campScope.ids };
      }
      if (campScope.ids.length) {
        const shown = new Set(campScope.ids);
        lineStart = cat.filter((c) => shown.has(c.id)).map(campaignStartDay).filter((d): d is string => !!d).sort()[0];
      }
    } catch (error) {
      logError("leads.lineDefaults", error, { linea }); // sin catálogo: valores por defecto generales
    }
  }
  const { from, to } = await resolveRange(params.from ?? lineStart, params.to);
  const sinceStart = !!linea && !params.from && !!lineStart;
  const camps = campScope.ids;
  const filter = parseLeadFilter(params.etapa);
  const ad = isId(params.anuncio);
  // ID del agente en GHL, o "sin" = sin agente asignado. Un usuario limitado a un agente solo ve el suyo.
  const agent = scopeAgent ?? isId(params.agente);
  // Código USPS, o "sin" = leads sin estado reconocible
  const state = params.estado && (params.estado in US_STATES || params.estado === "sin") ? params.estado : undefined;
  const { sort, dir } = parseLeadSort(params.sort, params.dir, filter);
  const def = defaultLeadSort(filter);
  const isUuid = (v?: string) => (v && /^[0-9a-f-]{36}$/i.test(v) ? v : undefined);
  const selectedId = isUuid(params.lead);
  const focusId = isUuid(params.foco);

  // Construye la URL actual cambiando un parámetro (null = quitarlo)
  const href = (change: Record<string, string | null>) => {
    const q = new URLSearchParams({ from, to });
    const current: Record<string, string | undefined> = {
      camp: campScope.param, etapa: filter === "todos" ? undefined : filter, anuncio: ad, agente: agent, estado: state,
      // El orden solo va en la URL si no es el de la pestaña; al cambiar de pestaña se resetea
      sort: sort === def.sort && dir === def.dir ? undefined : sort,
      dir: sort === def.sort && dir === def.dir ? undefined : dir,
    };
    for (const [k, v] of Object.entries({ ...current, ...change })) if (v) q.set(k, v);
    return `${basePath}?${q.toString()}`;
  };

  try {
    // Una sola consulta con todos los leads del rango y campaña: los filtros de estado / agente / anuncio
    // se aplican aquí para poder decir "5 de 48" y para los contadores de cada pestaña.
    const [rangeLeads, allOptions, allUpcoming, catalog, fixedLines] = await Promise.all([
      getLeads({ from, to, campaigns: camps, filter: "todos" }),
      getCampaignOptions(from, to, scopeAgent),
      // Solo en "Con cita": las citas por venir de cualquier lead (no solo de los que entraron en el rango)
      filter === "cita" ? getUpcomingAppointments({ campaigns: camps, agent }) : Promise.resolve([]),
      getCampaigns(),
      getFixedLines(),
    ]);
    // Línea de cada lead = la de su campaña (fijada por un admin o automática por el nombre)
    const campaignNames = new Map(catalog.map((c) => [c.id, c.name]));
    const lineOf = (campaignId: string | null, name?: string | null) =>
      resolveLine(name ?? (campaignId ? campaignNames.get(campaignId) : null), campaignId ? fixedLines.get(campaignId) : null).line;
    const inRange = linea ? rangeLeads.filter((l) => lineOf(l.campaign_id, l.campaign_name) === linea) : rangeLeads;
    const options = linea ? allOptions.filter((o) => lineOf(o.id, o.name) === linea) : allOptions;
    const upcoming = linea ? allUpcoming.filter((a) => lineOf(a.campaignId) === linea) : allUpcoming;
    // Solo admins, en las pestañas por línea: campañas activas sin línea (sus leads no salen en ninguna pestaña)
    const unlinedActive = linea && puede(await myAccess().catch(() => null), "lineas")
      ? catalog.filter((c) => c.status === "ACTIVE" && !lineOf(c.id, c.name)).map((c) => c.name) : [];
    type L = (typeof inRange)[number];
    const matchesState = (l: L) => !state || (state === "sin" ? !l.state_code : l.state_code === state);
    const matchesAgent = (l: L) => !agent || (agent === "sin" ? !l.assigned_to : l.assigned_to === agent);
    const matchesAd = (l: L) => !ad || l.ad_id === ad;
    const all = inRange.filter((l) => matchesState(l) && matchesAgent(l) && matchesAd(l));

    // Cada selector cuenta con los demás filtros aplicados (el de estado ignora el estado, etc.)
    const forStates = inRange.filter((l) => matchesAgent(l) && matchesAd(l));
    const stateCounts = new Map<string, { label: string; count: number }>();
    for (const l of forStates) {
      if (!l.state_code) continue;
      const c = stateCounts.get(l.state_code) ?? { label: US_STATES[l.state_code], count: 0 };
      c.count++;
      stateCounts.set(l.state_code, c);
    }
    const stateOptions = toOptions(stateCounts, forStates.filter((l) => !l.state_code).length, "Sin estado");

    const forAgents = inRange.filter((l) => matchesState(l) && matchesAd(l));
    const agentCounts = new Map<string, { label: string; count: number }>();
    for (const l of forAgents) {
      if (!l.assigned_to) continue;
      const c = agentCounts.get(l.assigned_to) ?? { label: l.agent_name ?? `Agente ${l.assigned_to}`, count: 0 };
      c.count++;
      agentCounts.set(l.assigned_to, c);
    }
    const agentOptions = toOptions(agentCounts, forAgents.filter((l) => !l.assigned_to).length, "Sin agente asignado");
    const counts = countLeads(all);
    const leads = sortLeads(filterLeads(all, filter), sort, dir);
    const delays = all.map(firstContactMs).filter((d): d is number => d != null).sort((a, b) => a - b);
    const median = delays.length ? delays[Math.floor(delays.length / 2)] : null;
    const agentName = agent === "sin" ? "sin agente asignado"
      : agent ? (inRange.find((l) => l.assigned_to === agent)?.agent_name ?? (await getAgentName(agent)) ?? "este agente") : null;
    // Qué recorte se está viendo, en palabras (para el título, el aviso y las tarjetas)
    const stateName = state === "sin" ? "sin estado" : state ? US_STATES[state] : null;
    const scopeParts = [stateName, agentName, ad && `anuncio ${ad}`].filter((x): x is string => !!x);
    const scope = scopeParts.join(" · ");
    const scoped = scopeParts.length > 0;
    const selected = selectedId ? all.find((l) => l.id === selectedId) : undefined;
    const [timeline, info] = selected
      ? await Promise.all([getLeadTimeline(selected.id), getContactInfo(selected.id)])
      : [[], { timeZone: null, phone: null }];
    const leadZone = info.timeZone;
    type Chip = { label: string; clear: Record<string, null> };
    const chips: Chip[] = [];
    if (ad) chips.push({ label: `Anuncio ${ad}`, clear: { anuncio: null } });

    return (
      <div className="space-y-5">
        <PageHeader title={scoped ? `${pageTitle} · ${scope}` : pageTitle} from={from} to={to} path={basePath} scope={campScope} options={options}
          description={linea ? `campañas de la línea ${LINEAS[linea].short}${sinceStart ? ", desde que arrancó la primera" : ""}` : "todas las líneas, también campañas sin línea"} />

        {unlinedActive.length > 0 && <UnlinedCampaignsNote names={unlinedActive} where="leads" />}


        {scoped && (
          <div role="status" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-accent/30 bg-accent-soft px-4 py-3 text-sm">
            <p className="text-ink">
              <span aria-hidden="true" className="mr-1.5">🔎</span>
              Estás viendo <strong>solo los leads de {scope}</strong>:{" "}
              <strong className="tabular-nums">{fmtInt(all.length)}</strong> de {fmtInt(inRange.length)} leads de este rango
              {campScope.mode === "activas" ? " de las campañas activas" : campScope.mode === "custom" && params.camp ? " de la campaña elegida" : ""}. Todas las cifras de esta página son de esa selección.
            </p>
            <Link href={href({ estado: null, agente: null, anuncio: null })}
              className="shrink-0 rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-white hover:opacity-90">
              Ver todos los leads
            </Link>
          </div>
        )}

        <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Kpi label={scoped ? `Leads de ${scope}` : "Total leads"} value={fmtInt(counts.todos)} hint={`${fmtInt(counts.respondio)} ${counts.respondio === 1 ? "respondió" : "respondieron"}`} />
          <Kpi label="Con cita" value={fmtInt(counts.cita)} hint={`${fmtInt(counts.ganado)} ${counts.ganado === 1 ? "ganado" : "ganados"}`} href={href({ etapa: "cita" })} />
          <Kpi label="Sin contacto humano" value={fmtInt(counts.sin_contacto)} critical={counts.sin_contacto > 0}
            hint={counts.sin_contacto > 0 ? "Nadie les ha escrito ni llamado" : "Todos fueron contactados"} href={href({ etapa: "sin_contacto" })} />
          <Kpi label="1er contacto (mediana)" value={median != null ? fmtDuration(median) : "—"} hint="Desde que entra el lead" accent />
        </section>

        <div className="flex flex-wrap items-center gap-2">
          <nav className="inline-flex flex-wrap rounded-xl border border-line bg-surface p-1 text-sm shadow-sm" aria-label="Etapa">
            {(Object.keys(LEAD_FILTERS) as LeadFilter[]).map((f) => (
              <Link key={f} href={href({ etapa: f === "todos" ? null : f, sort: null, dir: null })} aria-current={filter === f ? "page" : undefined}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-medium ${
                  filter === f ? "bg-accent text-white shadow-sm" : f === "sin_contacto" && counts[f] > 0 ? "text-critical hover:bg-surface-2" : "text-ink-2 hover:bg-surface-2"
                }`}>
                <svg viewBox="0 0 24 24" aria-hidden="true" className="size-4 shrink-0 fill-current"><path d={TAB_ICONS[f]} /></svg>
                {LEAD_FILTERS[f]}
                <span className={`ml-1 tabular-nums ${filter === f ? "text-white/80" : "text-ink-3"}`}>({fmtInt(counts[f])})</span>
              </Link>
            ))}
          </nav>
          <FilterSelect param="estado" label="Estado" icon={PIN_ICON} allLabel="Todos los estados"
            options={stateOptions} selected={state} total={forStates.length} />
          <FilterSelect param="agente" label="Agente" icon={AGENT_ICON} allLabel="Todos los agentes"
            options={agentOptions} selected={agent} total={forAgents.length} />
          {chips.map((c) => (
            <Link key={c.label} href={href(c.clear)}
              className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-1 text-xs text-ink-2 hover:bg-surface-2">
              {c.label} <span aria-hidden="true">✕</span><span className="sr-only">Quitar filtro</span>
            </Link>
          ))}
        </div>

        {filter === "cita" && (
          <Card flush title={`Próximas citas · ${fmtInt(upcoming.length)}`}
            subtitle="Las que aún no llegan, la más próxima arriba. Incluye leads que entraron antes de este rango.">
            <UpcomingAppointments items={upcoming} leadHref={(a) => {
              const day = a.leadCreatedAt.slice(0, 10);
              const q = new URLSearchParams({ from: day, to: day, etapa: "cita", lead: a.contactId });
              if (campScope.param) q.set("camp", campScope.param);
              return `${basePath}?${q.toString()}`;
            }} />
          </Card>
        )}

        <Card flush title={`${LEAD_FILTERS[filter]}${scoped ? ` · ${scope}` : ""} · ${fmtInt(leads.length)}`}
          subtitle="Haz clic en un lead para ver su historial completo. Pasa el mouse sobre el nombre para ver los IDs de Meta. Pulsa Entró, Cita o 1er contacto para ordenar.">
          <LeadsTable leads={leads} sort={sort} dir={dir} selectedId={selected?.id} focusId={focusId}
            sortHref={(key, d) => href({ sort: key, dir: d })} leadHref={(id) => href({ lead: id, foco: focusId ?? null })}
            wonHref={(id) => href({ etapa: "ganado", sort: null, dir: null, foco: id })} />
        </Card>

        {selected && (
          <LeadDrawer closeHref={href({ foco: focusId ?? null })} labelledBy="lead-drawer-title">
            <LeadDetail lead={selected} events={timeline} leadZone={leadZone} phone={info.phone} closeHref={href({ foco: focusId ?? null })} />
          </LeadDrawer>
        )}
      </div>
    );
  } catch (error) {
    logError("dashboard.leads", error, { from, to, camps, filter });
    return (
      <>
        <PageHeader title={pageTitle} from={from} to={to} path={basePath} scope={campScope} />
        <ErrorNote scope="dashboard.leads" what="los leads" />
      </>
    );
  }
}
