import { requireEnv } from "@/lib/env";
import { fetchJson } from "@/lib/http";

const BASE_URL = "https://services.leadconnectorhq.com";
const API_VERSION = "2021-07-28";

type Query = Record<string, string | number | undefined>;

export const ghlLocationId = (): string => requireEnv("GHL_LOCATION_ID");

function headers(): HeadersInit {
  return {
    Authorization: `Bearer ${requireEnv("GHL_PRIVATE_TOKEN")}`,
    Version: API_VERSION,
    Accept: "application/json",
    "Content-Type": "application/json",
  };
}

function buildUrl(path: string, query: Query = {}): string {
  const url = new URL(path, BASE_URL);
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }
  return url.toString();
}

export function ghlGet<T>(path: string, query?: Query): Promise<T> {
  return fetchJson<T>(buildUrl(path, query), { headers: headers() }, `GHL GET ${path}`);
}

export function ghlPost<T>(path: string, body: unknown): Promise<T> {
  return fetchJson<T>(
    buildUrl(path),
    { method: "POST", headers: headers(), body: JSON.stringify(body) },
    `GHL POST ${path}`,
  );
}
