// Qué cookie de sesión de Supabase usa cada petición. Es parte de la conexión (la usan supabaseServer() y
// proxy.ts); las reglas de QUIÉN entra por /embed están en capa3-cuentas/embed.ts.
//   EMBED_HEADER: lo pone proxy.ts en las rutas /embed (nunca se acepta del cliente).
//   EMBED_COOKIE: cookie aparte para el iframe de GHL: SameSite=None, Secure y Partitioned (CHIPS).
export const EMBED_HEADER = "x-rw-embed";
export const EMBED_COOKIE = {
  name: "sb-rw-embed",
  path: "/",
  sameSite: "none" as const,
  secure: true,
  partitioned: true,
};
