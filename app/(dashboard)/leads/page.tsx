import { LeadsView, type LeadsSearchParams } from "./leads-view";

export const dynamic = "force-dynamic";
export const metadata = { title: "Leads · Right Works" };

/** Todos los leads (las dos líneas): adonde llegan los enlaces de reportes y Resumen. */
export default async function LeadsPage({ searchParams }: { searchParams: LeadsSearchParams }) {
  return <LeadsView searchParams={searchParams} linea={null} />;
}
