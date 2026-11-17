import { PublishWizard } from "@/app/_components/publish-wizard";
import { ErrorNote, NoAccessNote } from "@/app/_components/ui";
import { myAccess } from "@/lib/auth";
import { logError } from "@/lib/log";
import { getPublishOptions, type PublishOptions } from "@/lib/meta/publish";

export const dynamic = "force-dynamic";
export const metadata = { title: "Publicar campaña · Right Works" };

export default async function PublicarPage() {
  const access = await myAccess();
  if (!access?.isAdmin) return <NoAccessNote what="Publicar campañas" />;
  let options: PublishOptions;
  try {
    options = await getPublishOptions();
  } catch (error) {
    logError("dashboard.publicar", error);
    return <ErrorNote scope="dashboard.publicar" what="las opciones de Meta" />;
  }
  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-xl font-semibold tracking-tight text-ink">Publicar campaña</h1>
        <p className="mt-0.5 text-sm text-ink-3">
          Campaña de clientes potenciales con formulario instantáneo. Se crea en pausa en la cuenta de Meta; la revisas y la activas en Campañas.
        </p>
      </header>
      <PublishWizard options={options} />
    </div>
  );
}
