import { notFound, redirect } from "next/navigation";
import { LINEAS, parseLinea } from "@base/util/lineas";
import { LeadsView, type LeadsSearchParams } from "../leads-view";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ linea: string }> }) {
  const linea = parseLinea((await params).linea);
  return { title: `${linea ? LINEAS[linea].label : "Leads"} · Right Works` };
}

/** /leads/vida, /leads/comercial y /leads/reclutamiento (menú lateral). */
export default async function LeadsLineaPage({ params, searchParams }: {
  params: Promise<{ linea: string }>; searchParams: LeadsSearchParams;
}) {
  const raw = (await params).linea;
  // La pestaña "Insurance" de antes ahora es "Vida": se conserva el enlace
  if (raw === "insurance") {
    const q = new URLSearchParams(Object.entries(await searchParams).filter((e): e is [string, string] => typeof e[1] === "string"));
    redirect(`/leads/vida${q.size ? `?${q}` : ""}`);
  }
  const linea = parseLinea(raw);
  if (!linea) notFound();
  return <LeadsView searchParams={searchParams} linea={linea} />;
}
