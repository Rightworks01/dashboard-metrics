import { accesoA } from "@cuentas/roles";
import { LocalTime } from "@visual/componentes/local-time";
import { Card, ErrorNote, NoAccessNote } from "@visual/componentes/ui";
import { listAccess, listAgents } from "@cuentas/access-admin";
import { myAccess } from "@cuentas/auth";
import { logError } from "@base/conexiones/log";
import { AddMemberForm, MemberRow } from "@cuentas/accesos/forms";

export const dynamic = "force-dynamic";
export const metadata = { title: "Accesos · Right Works" };

export default async function AccesosPage() {
  const me = await accesoA("accesos");
  if (!me) return <NoAccessNote what="Accesos" />;

  try {
    const agents = await listAgents();
    const { members, withoutAccess } = await listAccess(agents);
    return (
      <div className="space-y-5">
        <header>
          <h1 className="text-xl font-semibold tracking-tight text-ink">Accesos</h1>
          <p className="mt-0.5 text-sm text-ink-3">Quién entra al dashboard y qué ve. Los cambios aplican en la siguiente página que abra cada persona.</p>
        </header>

        <Card title="Dar acceso">
          <AddMemberForm agents={agents} />
        </Card>

        <Card title={`Equipo · ${members.length}`} flush
          subtitle="«Solo un agente»: ve Leads, Audiencia y Respuesta únicamente con los leads de ese agente.">
          <ul className="divide-y divide-line border-t border-line">
            {members.map((m) => <MemberRow key={m.userId} member={m} agents={agents} isSelf={m.userId === me.userId} />)}
          </ul>
        </Card>

        {withoutAccess.length > 0 && (
          <Card title={`Cuentas sin acceso · ${withoutAccess.length}`}
            subtitle="Tienen cuenta en Supabase pero no entran al dashboard. Para darles acceso, usa su email en «Dar acceso».">
            <ul className="space-y-1 text-sm">
              {withoutAccess.map((a) => (
                <li key={a.userId} className="flex justify-between gap-3">
                  <span className="truncate text-ink">{a.email}</span>
                  <span className="shrink-0 text-xs text-ink-3">Creada <LocalTime iso={a.createdAt} withTime={false} /></span>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>
    );
  } catch (error) {
    logError("dashboard.accesos", error);
    return <ErrorNote scope="dashboard.accesos" what="los accesos" />;
  }
}
