import Image from "next/image";
import { ThemeToggle } from "@visual/componentes/theme-toggle";
import { signIn } from "@cuentas/login/actions";
import { PasswordInput } from "@cuentas/login/password-input";
import { InFrameNote } from "@cuentas/login/in-frame-note";
import { GhlSso } from "@cuentas/login/ghl-sso";

const ERRORS: Record<string, string> = {
  invalid: "Escribe un email válido y la contraseña.",
  credentials: "Email o contraseña incorrectos.",
};

export const metadata = { title: "Entrar · Right Works" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string; ghl?: string }> }) {
  const { error, ghl } = await searchParams;
  const message = error ? (ERRORS[error] ?? ERRORS.credentials) : null;

  return (
    <main className="relative flex min-h-screen items-center justify-center px-4">
      <div className="absolute right-4 top-4"><ThemeToggle /></div>
      <form action={signIn} className="card w-full max-w-sm space-y-5 p-7">
        <div className="flex flex-col items-center text-center">
          <Image src="/logo-mark.png" alt="" width={96} height={96} priority
            className="size-24 rounded-2xl object-cover shadow-md ring-1 ring-line" />
          <h1 className="mt-4 text-lg font-semibold tracking-tight text-ink">Right Works</h1>
          <p className="mt-0.5 text-xs text-ink-3">Dashboard de métricas · entra con tu cuenta del equipo</p>
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
        {process.env.GHL_SSO_KEY && <GhlSso />}
        {message && <p className="rounded-lg bg-critical-soft px-3 py-2 text-sm text-critical" role="alert">{message}</p>}
        <button type="submit" className="w-full rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white shadow-sm hover:opacity-90">
          Entrar
        </button>
        <InFrameNote fromGhl={ghl === "1"} />
      </form>
    </main>
  );
}
