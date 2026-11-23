import { notFound } from "next/navigation";
import { LINEAS, parseLinea } from "@base/util/lineas";
import { LeadsView, type LeadsSearchParams } from "../leads-view";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ linea: string }> }) {
  const linea = parseLinea((await params).linea);
  return { title: `${linea ? LINEAS[linea].label : "Leads"} · Right Works` };
}

/** /leads/insurance y /leads/reclutamiento (menú lateral). */
export default async function LeadsLineaPage({ params, searchParams }: {
  params: Promise<{ linea: string }>; searchParams: LeadsSearchParams;
}) {
  const linea = parseLinea((await params).linea);
  if (!linea) notFound();
  return <LeadsView searchParams={searchParams} linea={linea} />;
}
