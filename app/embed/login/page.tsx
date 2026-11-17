import { PasswordInput } from "@/app/login/password-input";
import { signInEmbed } from "../actions";
import { EmbedBlocked } from "../blocked";
import { embedCheck } from "../context";

export const dynamic = "force-dynamic";
export const metadata = { title: "Entrar · Publicar · Right Works" };

const ERRORS: Record<string, string> = {
  invalid: "Escribe un email válido y la contraseña.",
  credentials: "Email o contraseña incorrectos.",
};

export default async function EmbedLoginPage({ searchParams }: { searchParams: Promise<{ location?: string; error?: string }> }) {
  const { location, error } = await searchParams;
  const check = await embedCheck(location);
  if (!check.ok) return <EmbedBlocked reason={check.reason} />;
  const message = error ? (ERRORS[error] ?? ERRORS.credentials) : null;
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <form action={signInEmbed} className="card w-full max-w-sm space-y-4 p-6">
        <input type="hidden" name="location" value={check.location} />
        <div className="text-center">
          <h1 className="text-lg font-semibold text-ink">Publicar campañas</h1>
          <p className="mt-0.5 text-xs text-ink-3">Entra con tu usuario administrador del dashboard de Right Works.</p>
        </div>
        <label className="block text-sm">
          <span className="text-xs font-medium text-ink-2">Email</span>
          <input name="email" type="email" required autoComplete="email"
            className="mt-1 w-full rounded-lg border border-line bg-surface-2 px-3 py-2 text-ink outline-none focus:border-accent" />
        </label>
        <label className="block text-sm">
          <span className="text-xs font-medium text-ink-2">Contraseña</span>
          <PasswordInput />
        </label>
        {message && <p className="rounded-lg bg-critical-soft px-3 py-2 text-sm text-critical" role="alert">{message}</p>}
        <button type="submit" className="w-full rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white hover:opacity-90">Entrar</button>
        <p className="text-center text-xs text-ink-3">
          Si después de entrar te vuelve a pedir el login (pasa en Safari, que bloquea las sesiones dentro del CRM),{" "}
          <a href="/publicar" target="_blank" rel="noopener noreferrer" className="font-medium text-accent hover:underline">ábrela en una pestaña nueva ↗</a>.
        </p>
      </form>
    </main>
  );
}
