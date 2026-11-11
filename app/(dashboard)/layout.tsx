import { Suspense, type ReactNode } from "react";
import { Sidebar } from "@/app/_components/sidebar";
import { signOut } from "@/app/login/actions";
import { myAccess } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const supabase = await supabaseServer();
  const { data } = await supabase.auth.getUser();
  // Tener sesión no basta: solo entra quien está en `team_members` (se gestiona en /accesos)
  const access = data.user ? await myAccess() : null;
  if (!access) {
    return (
      <main className="flex min-h-screen items-center justify-center px-4">
        <div className="card max-w-sm p-6 text-center">
          <h1 className="text-lg font-semibold text-ink">Sin acceso</h1>
          <p className="mt-2 text-sm text-ink-2">
            Tu cuenta{data.user?.email ? ` (${data.user.email})` : ""} no está en el equipo de este dashboard.
            Pide a un administrador que te dé acceso.
          </p>
          <form action={signOut} className="mt-4">
            <button type="submit" className="rounded-lg bg-ink px-3 py-1.5 text-sm font-medium text-plane hover:opacity-90">Cerrar sesión</button>
          </form>
        </div>
      </main>
    );
  }

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <Suspense>
        <Sidebar email={access.email || null} adsAccess={access.canSeeAds} agentOnly={!!access.agentId} isAdmin={access.isAdmin} />
      </Suspense>
      <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">{children}</div>
      </main>
    </div>
  );
}
