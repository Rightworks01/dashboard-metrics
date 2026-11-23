// Qué cookie de sesión de Supabase usa cada petición. Es parte de la conexión (la usan supabaseServer() y
// proxy.ts); las reglas de QUIÉN entra por /embed están en capa3-cuentas/embed.ts.
//   EMBED_HEADER: lo pone proxy.ts en las rutas /embed (nunca se acepta del cliente).
//   EMBED_COOKIE: cookie aparte para el iframe de Publicar en GHL (/embed): SameSite=None, Secure y Partitioned.
//   SESSION_COOKIE: la del resto del dashboard. También particionada (CHIPS) para que el Centro de Control funcione
//     dentro de un iframe de GHL (widget IFrame de un Dashboard de la subcuenta): el navegador guarda una sesión
//     para el dashboard abierto directo y otra, aparte, para el dashboard dentro de GHL. Cada una pide su login.
export const EMBED_HEADER = "x-rw-embed";
export const EMBED_COOKIE = {
  name: "sb-rw-embed",
  path: "/",
  sameSite: "none" as const,
  secure: true,
  partitioned: true,
};
export const SESSION_COOKIE = {
  name: "sb-rw-session",
  path: "/",
  sameSite: "none" as const,
  secure: true,
  partitioned: true,
};
