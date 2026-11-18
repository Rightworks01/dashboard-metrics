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

// Ciudades grandes que la gente escribe en vez del estado (texto libre del formulario).
const CITIES: Record<string, string> = {
  MIAMI: "FL", ORLANDO: "FL", TAMPA: "FL", HIALEAH: "FL", JACKSONVILLE: "FL",
  HOUSTON: "TX", DALLAS: "TX", AUSTIN: "TX", "SAN ANTONIO": "TX", "EL PASO": "TX", "FORT WORTH": "TX",
  "LOS ANGELES": "CA", "SAN DIEGO": "CA", "SAN JOSE": "CA", "SAN FRANCISCO": "CA", SACRAMENTO: "CA", FRESNO: "CA",
  "LAS VEGAS": "NV", PHOENIX: "AZ", TUCSON: "AZ", CHICAGO: "IL", ATLANTA: "GA", DENVER: "CO",
  "NEW YORK CITY": "NY", BROOKLYN: "NY", BRONX: "NY", QUEENS: "NY", NEWARK: "NJ", BOSTON: "MA",
  PHILADELPHIA: "PA", CHARLOTTE: "NC", NASHVILLE: "TN", "SALT LAKE CITY": "UT", SEATTLE: "WA", ALBUQUERQUE: "NM",
};
// Nombres más largos primero, para que "WEST VIRGINIA" gane a "VIRGINIA".
const NAMES_LONGEST = [...BY_NAME.entries()].sort((a, b) => b[0].length - a[0].length);
const CITIES_LONGEST = Object.entries(CITIES).sort((a, b) => b[0].length - a[0].length);
const hasWords = (text: string, words: string) => ` ${text} `.includes(` ${words} `);

/**
 * "tx", "Texas", " TEXAS ", "Tejas" → "TX". También texto libre: "San Diego california" → CA,
 * "Pittsburg ca" → CA, "Austin texa" → TX, "miami" → FL. null si no es un estado de EE. UU. reconocible.
 */
export function toStateCode(raw: string): string | null {
  const s = strip(raw);
  if (!s) return null;
  if (s.length === 2 && s in US_STATES) return s;
  const exact = BY_NAME.get(s);
  if (exact) return exact;
  // Nombre de estado dentro del texto ("San Diego california")
  for (const [name, code] of NAMES_LONGEST) if (hasWords(s, name)) return code;
  const words = s.split(" ");
  // Abreviatura al final tras una ciudad ("Pittsburg ca"); DE/LA/ME/IN/OR son palabras comunes, se exigen 2+ palabras
  const last = words[words.length - 1];
  if (words.length >= 2 && last.length === 2 && last in US_STATES) return last;
  // Nombre cortado ("Austin texa"): una palabra de 4+ letras que empieza un único nombre de estado
  for (const w of words) {
    if (w.length < 4) continue;
    const hits = new Set(NAMES_LONGEST.filter(([name]) => !name.includes(" ") && name.startsWith(w)).map(([, c]) => c));
    if (hits.size === 1) return [...hits][0];
  }
  for (const [city, code] of CITIES_LONGEST) if (hasWords(s, city)) return code;
  return null;
}
