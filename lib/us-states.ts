// Código USPS → nombre (como viene en us-atlas). Incluye DC; PR no está en el mapa.
export const US_STATES: Record<string, string> = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California", CO: "Colorado",
  CT: "Connecticut", DE: "Delaware", DC: "District of Columbia", FL: "Florida", GA: "Georgia",
  HI: "Hawaii", ID: "Idaho", IL: "Illinois", IN: "Indiana", IA: "Iowa", KS: "Kansas", KY: "Kentucky",
  LA: "Louisiana", ME: "Maine", MD: "Maryland", MA: "Massachusetts", MI: "Michigan", MN: "Minnesota",
  MS: "Mississippi", MO: "Missouri", MT: "Montana", NE: "Nebraska", NV: "Nevada", NH: "New Hampshire",
  NJ: "New Jersey", NM: "New Mexico", NY: "New York", NC: "North Carolina", ND: "North Dakota",
  OH: "Ohio", OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania", RI: "Rhode Island",
  SC: "South Carolina", SD: "South Dakota", TN: "Tennessee", TX: "Texas", UT: "Utah", VT: "Vermont",
  VA: "Virginia", WA: "Washington", WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming",
};

const strip = (s: string): string =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[^A-Z ]/g, " ").replace(/\s+/g, " ").trim();

const BY_NAME = new Map<string, string>(Object.entries(US_STATES).map(([code, name]) => [strip(name), code]));
// Variantes frecuentes en formularios en español
for (const [alias, code] of [
  ["NUEVA YORK", "NY"], ["NUEVO MEXICO", "NM"], ["NUEVA JERSEY", "NJ"], ["CAROLINA DEL NORTE", "NC"],
  ["CAROLINA DEL SUR", "SC"], ["DAKOTA DEL NORTE", "ND"], ["DAKOTA DEL SUR", "SD"], ["LUISIANA", "LA"],
  ["MISURI", "MO"], ["MISISIPI", "MS"], ["PENSILVANIA", "PA"], ["VIRGINIA OCCIDENTAL", "WV"],
  ["HAWAI", "HI"], ["TEJAS", "TX"], ["FLORIDA", "FL"], ["WASHINGTON DC", "DC"], ["DISTRITO DE COLUMBIA", "DC"],
] as const) BY_NAME.set(alias, code);

/** "tx", "Texas", " TEXAS ", "Tejas" → "TX". null si no es un estado de EE. UU. reconocible. */
export function toStateCode(raw: string): string | null {
  const s = strip(raw);
  if (s.length === 2 && s in US_STATES) return s;
  return BY_NAME.get(s) ?? null;
}
