// Capa 3 · Cuentas: forma de entrar. Lo llama proxy.ts (raíz) en cada petición.
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { EMBED_COOKIE, EMBED_HEADER, SESSION_COOKIE } from "@base/conexiones/supabase/sesion";

// Refresca la sesión de Supabase Auth en cada request y manda a /login a quien no la tenga.
// /api queda fuera: webhooks y cron tienen su propia autenticación por secreto.
// /embed (pestaña Publicar dentro de GHL) usa su propia cookie particionada y su propio login.
export async function sessionProxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const embedded = path === "/embed" || path.startsWith("/embed/");

  // El header le dice a supabaseServer() qué cookie usar; nunca se acepta del cliente.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.delete(EMBED_HEADER);
  if (embedded) requestHeaders.set(EMBED_HEADER, "1");
  const next = () => NextResponse.next({ request: { headers: requestHeaders } });
  let response = next();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
    {
      cookieOptions: embedded ? EMBED_COOKIE : SESSION_COOKIE,
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet, headers) => {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = next();
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
          Object.entries(headers).forEach(([key, value]) => response.headers.set(key, value));
        },
      },
    },
  );

  // getClaims valida el JWT; no usar getSession() aquí (no verifica la firma).
  const { data } = await supabase.auth.getClaims();
  const signedIn = !!data?.claims;

  if (embedded) {
    // Las API de /embed responden 401 solas; las páginas comprueban CRM y subcuenta en el servidor.
    if (path.startsWith("/embed/api/")) return response;
    const isLogin = path === "/embed/login";
    const location = request.nextUrl.searchParams.get("location") ?? "";
    if (!signedIn && !isLogin) {
      const url = request.nextUrl.clone();
      url.pathname = "/embed/login";
      url.search = location ? `?location=${encodeURIComponent(location)}` : "";
      return NextResponse.redirect(url);
    }
    if (signedIn && isLogin) {
      const url = request.nextUrl.clone();
      url.pathname = "/embed/publicar";
      url.search = location ? `?location=${encodeURIComponent(location)}` : "";
      return NextResponse.redirect(url);
    }
    return response;
  }

  // /sso (entrada automática desde la app de GHL) siempre se sirve: con o sin sesión, porque puede cambiar de usuario
  if (path === "/sso") return response;
  const isLogin = path.startsWith("/login");
  if (!signedIn && !isLogin) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }
  if (signedIn && isLogin) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    return NextResponse.redirect(url);
  }
  return response;
}
