import "server-only";
import { myAccess, type Access } from "@cuentas/auth";

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// TIPOS DE CUENTA Y QUÉ VE CADA UNO. Única fuente de verdad: el menú, las páginas y las API leen de aquí.
// Para cambiar un permiso, se cambia en este archivo (no en las páginas ni en los componentes).
//
// Cómo se entra: email + contraseña (/login, Supabase Auth). Tener cuenta no basta: hay que estar en
// la tabla `team_members` (se gestiona en /accesos). Cada fila guarda tres datos que definen el tipo:
//   is_admin     → Administrador
//   agent_id     → limitada a los leads de un agente de GHL (la base de datos lo aplica con RLS)
//   can_see_ads  → Campañas y Anuncios (nunca si está limitada a un agente)
// ─────────────────────────────────────────────────────────────────────────────────────────────────

export type TipoDeCuenta = "admin" | "completa" | "sin_anuncios" | "agente";

export const TIPOS_DE_CUENTA: Record<TipoDeCuenta, { nombre: string; descripcion: string }> = {
  admin: {
    nombre: "Administrador",
    descripcion: "Todo el dashboard + Publicar, Reportes, Accesos y los botones de sincronizar.",
  },
  completa: {
    nombre: "Completa",
    descripcion: "Todo el dashboard, incluidas Campañas y Anuncios. No administra ni publica.",
  },
  sin_anuncios: {
    nombre: "Sin anuncios",
    descripcion: "Resumen, Leads, Audiencia, Respuesta y Calidad de datos; sin Campañas ni Anuncios.",
  },
  agente: {
    nombre: "Agente",
    descripcion: "Solo sus propios leads: Leads, Audiencia y Respuesta.",
  },
};

export function tipoDeCuenta(a: Access): TipoDeCuenta {
  if (a.isAdmin) return "admin";
  if (a.agentId) return "agente";
  return a.canSeeAds ? "completa" : "sin_anuncios";
}

/** Secciones del menú y las acciones que piden permiso. */
export type Permiso =
  | "resumen" | "leads" | "campanas" | "publicar" | "anuncios" | "audiencia" | "respuesta" | "calidad"
  | "reportes" | "accesos"
  | "sincronizar"
  | "lineas";

const REGLAS: Record<Permiso, (a: Access) => boolean> = {
  resumen: (a) => !a.agentId,           // un agente entra directo a Leads
  leads: () => true,
  campanas: (a) => a.canSeeAds,         // pausar/activar además exige canControlCampaigns (META_CONTROL_EMAILS)
  publicar: (a) => a.isAdmin && a.canSeeAds,
  anuncios: (a) => a.canSeeAds,
  audiencia: () => true,
  respuesta: () => true,                // un agente solo ve sus llamadas
  calidad: (a) => !a.agentId,
  reportes: (a) => a.isAdmin,
  accesos: (a) => a.isAdmin,
  sincronizar: (a) => a.isAdmin,        // botones GHL / Meta del menú y POST /api/sync
  lineas: (a) => a.isAdmin,             // asignar la línea de una campaña (Vida / Comercial / Reclutamiento)
};

export function puede(a: Access | null | undefined, permiso: Permiso): a is Access {
  return !!a && REGLAS[permiso](a);
}

/** Secciones que ve esta cuenta (para el menú). */
export function seccionesPermitidas(a: Access): Permiso[] {
  return (Object.keys(REGLAS) as Permiso[]).filter((p) => REGLAS[p](a));
}

/**
 * La cuenta que mira, si tiene este permiso; si no (o sin sesión), null. Para páginas, Server Actions y
 * API (las rutas /api no pasan por proxy.ts: cada una debe comprobarlo).
 */
export async function accesoA(permiso: Permiso): Promise<Access | null> {
  const access = await myAccess().catch(() => null);
  return puede(access, permiso) ? access : null;
}
