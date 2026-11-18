import { signOut } from "@cuentas/login/actions";

/** Tiene sesión pero no está en `team_members`: no ve nada del dashboard. */
export function NotInTeam({ email }: { email: string | null }) {
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="card max-w-sm p-6 text-center">
        <h1 className="text-lg font-semibold text-ink">Sin acceso</h1>
        <p className="mt-2 text-sm text-ink-2">
          Tu cuenta{email ? ` (${email})` : ""} no está en el equipo de este dashboard.
          Pide a un administrador que te dé acceso.
        </p>
        <form action={signOut} className="mt-4">
          <button type="submit" className="rounded-lg bg-ink px-3 py-1.5 text-sm font-medium text-plane hover:opacity-90">Cerrar sesión</button>
        </form>
      </div>
    </main>
  );
}
