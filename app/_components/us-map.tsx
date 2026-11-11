import "server-only";
import { geoPath } from "d3-geo";
import { feature, mesh } from "topojson-client";
import type { GeometryCollection, Topology } from "topojson-specification";
import atlas from "us-atlas/states-albers-10m.json";
import { fmtInt, fmtPct } from "@/lib/format";
import type { StateMetrics } from "@/lib/metrics";
import { toStateCode } from "@/lib/us-states";
import { MapHover } from "./map-hover";

// us-atlas viene ya proyectado (Albers USA, 975×610): geoPath sin proyección.
const topology = atlas as unknown as Topology<{ states: GeometryCollection<{ name: string }>; nation: GeometryCollection }>;
const path = geoPath().digits(1);
const SHAPES = feature(topology, topology.objects.states).features.map((f) => ({
  code: toStateCode(f.properties.name) ?? "",
  name: f.properties.name,
  d: path(f) ?? "",
}));
const BORDERS = path(mesh(topology, topology.objects.states, (a, b) => a !== b)) ?? "";

const STEPS = 5;

/** Cortes "redondos" de 0 a max en 5 tramos para la rampa secuencial. */
function buckets(max: number): number[] {
  const step = Math.max(1, Math.ceil(max / STEPS));
  return Array.from({ length: STEPS }, (_, i) => step * i + 1);
}

export function UsMap({ states }: { states: StateMetrics[] }) {
  const byCode = new Map(states.map((s) => [s.code, s]));
  const max = states.reduce((m, s) => Math.max(m, s.leads), 0);
  const cuts = buckets(max);
  const level = (leads: number): number => {
    if (leads <= 0) return 0;
    let l = 1;
    for (let i = 0; i < cuts.length; i++) if (leads >= cuts[i]) l = i + 1;
    return l;
  };

  return (
    <div>
      <MapHover>
        <svg viewBox="0 0 975 610" className="h-auto w-full" role="img" aria-label="Leads por estado de EE. UU.">
          {SHAPES.map((s) => {
            const m = byCode.get(s.code);
            const leads = m?.leads ?? 0;
            const l = level(leads);
            return (
              <path
                key={s.name}
                d={s.d}
                fill={l === 0 ? "var(--map-empty)" : `var(--seq-${l})`}
                className="cursor-default transition-opacity hover:opacity-80"
                data-tip={JSON.stringify({
                  name: s.name,
                  leads: fmtInt(leads),
                  rate: m && m.leads > 0 ? fmtPct(m.responded / m.leads) : "—",
                  appts: fmtInt(m?.appointments ?? 0),
                  won: fmtInt(m?.won ?? 0),
                })}
              >
                <title>{`${s.name}: ${fmtInt(leads)} leads`}</title>
              </path>
            );
          })}
          <path d={BORDERS} fill="none" stroke="var(--map-stroke)" strokeWidth={1} strokeLinejoin="round" pointerEvents="none" />
        </svg>
      </MapHover>

      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-3">
        <span>Leads</span>
        <span className="flex items-center gap-1">
          <span className="h-2.5 w-5 rounded-sm" style={{ background: "var(--map-empty)" }} />0
        </span>
        {cuts.map((c, i) => {
          const hi = i < cuts.length - 1 ? cuts[i + 1] - 1 : null;
          if (max === 0 || c > max) return null;
          return (
            <span key={c} className="flex items-center gap-1">
              <span className="h-2.5 w-5 rounded-sm" style={{ background: `var(--seq-${i + 1})` }} />
              {hi == null || hi >= max ? `${fmtInt(c)}+` : c === hi ? fmtInt(c) : `${fmtInt(c)}–${fmtInt(hi)}`}
            </span>
          );
        })}
      </div>
    </div>
  );
}
