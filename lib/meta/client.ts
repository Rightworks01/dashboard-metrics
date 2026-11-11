import { requireEnv } from "@/lib/env";
import type { RetryPolicy } from "@/lib/http";

// Meta devuelve los límites de cuota como 400 con estos códigos de error
const RATE_LIMIT_CODES = [4, 17, 32, 613, 80000, 80004];
export const metaRetryable: RetryPolicy = (status, body) => {
  if (status === 429 || status >= 500) return true;
  try {
    const parsed = JSON.parse(body) as { error?: { code?: number; is_transient?: boolean } };
    return !!parsed.error?.is_transient || RATE_LIMIT_CODES.includes(parsed.error?.code ?? -1);
  } catch {
    return false;
  }
};

export const metaAccountId = (): string => requireEnv("META_AD_ACCOUNT_ID").replace(/^act_/, "");

/** URL de la Graph API. El access_token va en la query: no loguear la URL completa. */
export function graphUrl(path: string, params: Record<string, string> = {}): string {
  const version = process.env.META_API_VERSION ?? "v23.0";
  const query = new URLSearchParams({ ...params, access_token: requireEnv("META_ACCESS_TOKEN") });
  return `https://graph.facebook.com/${version}/${path}?${query}`;
}
