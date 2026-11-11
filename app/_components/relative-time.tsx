"use client";

import { useViewerZone } from "@/app/_components/local-time";

// "hace 2 h" calculado en el navegador (en el servidor "ahora" y la zona horaria no son los del usuario).
const rtf = new Intl.RelativeTimeFormat("es", { numeric: "auto", style: "short" });
const STEPS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["minute", 60], ["hour", 60], ["day", 24], ["week", 7], ["month", 4.35], ["year", 12],
];

function relative(iso: string): string {
  let value = (Date.parse(iso) - Date.now()) / 1000;
  if (Math.abs(value) < 60) return "ahora";
  value /= 60;
  for (let i = 0; i < STEPS.length; i++) {
    const [unit] = STEPS[i];
    const next = STEPS[i + 1]?.[1];
    if (!next || Math.abs(value) < next) return rtf.format(Math.round(value), unit);
    value /= next;
  }
  return rtf.format(Math.round(value), "year");
}

export function RelativeTime({ iso }: { iso: string }) {
  const zone = useViewerZone();
  return (
    <time dateTime={iso} title={new Date(iso).toLocaleString("es-US", { timeZone: zone, timeZoneName: "short" })} suppressHydrationWarning>
      {relative(iso)}
    </time>
  );
}
