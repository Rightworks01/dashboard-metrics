// La sesión del dashboard viaja en una cookie SameSite=None (para que funcione dentro del iframe de GHL), así que
// el navegador también la mandaría en un POST armado desde otro sitio. Las API que cambian algo y usan la sesión
// (no las de cron/webhook, que van con secreto) exigen que la petición venga del propio dashboard: el navegador
// pone Origin en todo POST y una página ajena no puede falsificarlo. Las Server Actions ya las protege Next.
export function isSameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return false;
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  try {
    return !!host && new URL(origin).host === host;
  } catch {
    return false;
  }
}
