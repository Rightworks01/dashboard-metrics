import type { NextRequest } from "next/server";
import { sessionProxy } from "@cuentas/proxy";

// Next exige este archivo en la raíz. La lógica (sesión, /login, /embed) está en la Capa 3: capa3-cuentas/proxy.ts.
export function proxy(request: NextRequest) {
  return sessionProxy(request);
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
