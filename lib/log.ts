// Logs en una sola línea JSON para poder filtrarlos en los Runtime Logs de Vercel.
export function logInfo(scope: string, context: Record<string, unknown> = {}): void {
  console.log(JSON.stringify({ level: "info", scope, ...context }));
}

export function logError(scope: string, error: unknown, context: Record<string, unknown> = {}): void {
  console.error(
    JSON.stringify({
      level: "error",
      scope,
      message: error instanceof Error ? error.message : String(error),
      ...context,
    }),
  );
}
