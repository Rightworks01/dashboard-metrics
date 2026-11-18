import { timingSafeEqual } from "node:crypto";

export function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}

// Vercel Cron envía `Authorization: Bearer $CRON_SECRET`. Sirve igual para lanzarlo a mano.
export function isAuthorizedCron(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  const header = req.headers.get("authorization");
  return !!secret && !!header && safeEqual(header, `Bearer ${secret}`);
}
