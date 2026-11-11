"use client";

// Selector de zona horaria de quien mira. Por defecto "Automática": la del dispositivo desde donde
// entra. Elegir otra solo vale para esta pestaña (ver local-time.tsx). Además deja la zona en uso en la
// cookie `cb-tz` para que el servidor calcule "hoy" y los atajos de rango en esa zona
// (lib/viewer-zone.ts); si cambia (primera visita, otra zona u otra elección), recarga los datos una vez.
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { browserZone, clearOldZoneChoice, deviceZone, savedZone, setViewerZone, useViewerZone } from "@/app/_components/local-time";

const COOKIE = "cb-tz";

const ZONES: [string, string][] = [
  ["America/New_York", "Nueva York (Este)"],
  ["America/Chicago", "Chicago (Centro)"],
  ["America/Denver", "Denver (Montaña)"],
  ["America/Phoenix", "Phoenix (Arizona)"],
  ["America/Los_Angeles", "Los Ángeles (Pacífico)"],
  ["America/Puerto_Rico", "Puerto Rico"],
  ["America/Mexico_City", "Ciudad de México"],
  ["America/Bogota", "Bogotá / Lima"],
  ["America/Caracas", "Caracas"],
  ["America/Santiago", "Santiago"],
  ["America/Argentina/Buenos_Aires", "Buenos Aires"],
  ["Europe/Madrid", "Madrid"],
];

function readCookie(): string | null {
  const m = document.cookie.match(/(?:^|;\s*)cb-tz=([^;]*)/);
  return m ? decodeURIComponent(m[1]) : null;
}

export function TimeZonePicker() {
  const router = useRouter();
  const zone = useViewerZone();
  const [chosen, setChosen] = useState("");
  const [auto, setAuto] = useState("");
  const [now, setNow] = useState("");

  useEffect(() => {
    clearOldZoneChoice();
    setChosen(savedZone() ?? "");
    const b = browserZone();
    setAuto(deviceZone() === b ? b : `Los Ángeles (tu navegador no da su zona)`);
  }, []);
  // El servidor usa la misma zona que se ve (para "hoy" y los atajos)
  useEffect(() => {
    if (readCookie() !== zone) {
      document.cookie = `${COOKIE}=${encodeURIComponent(zone)}; path=/; max-age=31536000; samesite=lax${location.protocol === "https:" ? "; secure" : ""}`;
      router.refresh();
    }
  }, [zone, router]);
  useEffect(() => {
    const tick = () => setNow(new Date().toLocaleTimeString("es-US", { timeZone: zone, hour: "numeric", minute: "2-digit", timeZoneName: "short" }));
    tick();
    const t = setInterval(tick, 60_000);
    return () => clearInterval(t);
  }, [zone]);

  return (
    <label className="block text-xs text-ink-3">
      <span className="flex items-center justify-between gap-2">
        Horas en <span className="font-medium text-ink-2">{now}</span>
      </span>
      <select value={chosen} onChange={(e) => { setChosen(e.target.value); setViewerZone(e.target.value || null); }}
        className="mt-1 w-full rounded-lg border border-line bg-surface px-2 py-1 text-xs text-ink"
        title="Automática = la zona de tu dispositivo. Otra zona vale solo mientras tengas abierta esta pestaña.">
        <option value="">Automática · {auto || "tu dispositivo"}</option>
        {ZONES.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
      </select>
    </label>
  );
}
