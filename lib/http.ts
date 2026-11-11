const MAX_RETRIES = 5;

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export type RetryPolicy = (status: number, body: string) => boolean;

const defaultRetryable: RetryPolicy = (status) => status === 429 || status >= 500;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// 0.5s, 1s, 2s, 4s, 8s (+ jitter), con tope de 30s
function backoffMs(attempt: number): number {
  return Math.min(30_000, 500 * 2 ** (attempt - 1)) + Math.random() * 250;
}

/**
 * fetch + JSON con backoff exponencial: hasta 5 reintentos ante errores de red,
 * 429, 5xx o lo que indique `retryable`. Respeta el header Retry-After.
 * `label` no debe incluir secretos: termina en los logs.
 */
export async function fetchJson<T>(
  url: string,
  init: RequestInit,
  label: string,
  retryable: RetryPolicy = defaultRetryable,
): Promise<T> {
  let lastError: unknown;
  let retryAfterMs = 0;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) await sleep(Math.max(retryAfterMs, backoffMs(attempt)));
    retryAfterMs = 0;

    let res: Response;
    try {
      res = await fetch(url, { ...init, cache: "no-store" });
    } catch (error) {
      lastError = error;
      continue;
    }

    if (res.ok) return (await res.json()) as T;

    const body = await res.text();
    lastError = new HttpError(res.status, `${label} -> ${res.status}: ${body.slice(0, 500)}`);
    if (!retryable(res.status, body)) throw lastError;

    const retryAfter = Number(res.headers.get("retry-after"));
    if (Number.isFinite(retryAfter) && retryAfter > 0) retryAfterMs = retryAfter * 1000;
  }

  throw lastError;
}
