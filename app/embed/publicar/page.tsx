import { PublishWizard } from "@/app/_components/publish-wizard";
import { myAccess } from "@/lib/auth";
import { logError } from "@/lib/log";
import { getPublishOptions, type PublishOptions } from "@/lib/meta/publish";
import { EmbedBlocked } from "../blocked";
import { embedCheck } from "../context";

export const dynamic = "force-dynamic";
export const metadata = { title: "Publicar campaña · Right Works" };

/** Pestaña Publicar dentro de GHL (Custom Menu Link): …/embed/publicar?location={{location.id}} */
export default async function EmbedPublicarPage({ searchParams }: { searchParams: Promise<{ location?: string }> }) {
  const { location } = await searchParams;
  const check = await embedCheck(location);
  if (!check.ok) return <EmbedBlocked reason={check.reason} />;

  const access = await myAccess().catch(() => null);
  if (!access?.isAdmin) {
    return (
      <main className="flex min-h-screen items-center justify-center px-4">
        <div className="card max-w-sm p-6 text-center">
          <h1 className="text-lg font-semibold text-ink">Sin acceso</h1>
          <p className="mt-2 text-sm text-ink-2">Solo un administrador del dashboard puede publicar campañas.</p>
        </div>
      </main>
    );
  }

  let options: PublishOptions;
  try {
    options = await getPublishOptions();
  } catch (error) {
    logError("embed.publicar", error);
    return <main className="p-6 text-sm text-critical">No se pudieron leer las opciones de Meta. Revisa los logs de Vercel (embed.publicar).</main>;
  }
  return (
    <main className="mx-auto max-w-5xl space-y-5 px-4 py-6">
      <header>
        <h1 className="text-xl font-semibold tracking-tight text-ink">Publicar campaña</h1>
        <p className="mt-0.5 text-sm text-ink-3">Se crea en pausa en Meta. Sesión: {access.email}</p>
      </header>
      <PublishWizard options={options} apiBase="/embed/api/publish" embedded />
    </main>
  );
}
