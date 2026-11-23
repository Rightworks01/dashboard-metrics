import { redirect } from "next/navigation";
import { supabaseServer } from "@base/conexiones/supabase/server";
import { SsoGate } from "@cuentas/login/sso-gate";

export const dynamic = "force-dynamic";
export const metadata = { title: "Entrando · Right Works" };

/** Entrada desde la app de GHL (página personalizada de la app): https://dashboard.rightworksinsurance.com/sso */
export default async function SsoPage() {
  if (!process.env.GHL_SSO_KEY) redirect("/login");
  const { data } = await (await supabaseServer()).auth.getUser();
  return <SsoGate hasSession={!!data.user} />;
}
