import { Suspense, type ReactNode } from "react";
import { ghlIntegrationsUrl, metaLinkHealth } from "@base/datos/meta-link-health";
import { MetaLinkBanner } from "@visual/componentes/meta-link-banner";
import { Sidebar } from "@visual/componentes/sidebar";
import { signOut } from "@cuentas/login/actions";
import { NotInTeam } from "@cuentas/pantallas/sin-equipo";
import { puede, seccionesPermitidas } from "@cuentas/roles";
import { SyncButtons } from "@base/acciones/sync-buttons";
import { myAccess } from "@cuentas/auth";
import { supabaseServer } from "@base/conexiones/supabase/server";

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const supabase = await supabaseServer();
  const { data } = await supabase.auth.getUser();
  // Tener sesión no basta: solo entra quien está en `team_members` (se gestiona en /accesos)
  const access = data.user ? await myAccess() : null;
  if (!access) {
    return <NotInTeam email={data.user?.email ?? null} />;
  }

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <Suspense>
        <Sidebar email={access.email || null} allowed={seccionesPermitidas(access)} signOut={signOut}
          tools={puede(access, "sincronizar") ? <SyncButtons /> : null} />
      </Suspense>
      <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          {/* Solo quien ve todo: un miembro limitado a un agente no ve todos los contactos (daría falsa alarma) */}
          {!access.agentId && <Suspense><MetaLinkBannerLoader /></Suspense>}
          {children}
        </div>
      </main>
    </div>
  );
}

/** Capa 1 (¿se cortó Facebook → GHL?) → Capa 2 (banner). Aparte, para no frenar la página (Suspense). */
async function MetaLinkBannerLoader() {
  return <MetaLinkBanner health={await metaLinkHealth()} href={ghlIntegrationsUrl()} />;
}
