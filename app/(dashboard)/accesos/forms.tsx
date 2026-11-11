"use client";

// Client Component: formularios con respuesta de la Server Action (errores y la contraseña generada,
// que se muestra una sola vez y no viaja en la URL).
import { useActionState, useState } from "react";
import { CopyButton } from "@/app/_components/copy-button";
import { LocalTime } from "@/app/_components/local-time";
import type { Agent, Member } from "@/lib/access-admin";
import { addMember, removeMember, resetPassword, updateMember, type ActionState } from "./actions";

const input = "rounded-lg border border-line bg-surface-2 px-2.5 py-1.5 text-sm text-ink outline-none focus:border-accent";
const primary = "rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-white shadow-sm hover:opacity-90 disabled:opacity-50";
const secondary = "rounded-lg border border-line px-2.5 py-1.5 text-xs font-medium text-ink-2 hover:bg-surface-2 hover:text-ink disabled:opacity-50";

function Result({ state }: { state: ActionState }) {
  if (state.error) return <p role="alert" className="text-xs text-critical">{state.error}</p>;
  if (!state.ok) return null;
  return (
    <p role="status" className="flex flex-wrap items-center gap-1.5 text-xs text-good-ink">
      {state.ok}
      {state.password && (
        <>
          {!state.ok.endsWith(":") && <span className="text-ink-2">Contraseña:</span>}
          <code className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-ink">{state.password}</code>
          <CopyButton value={state.password} label="Copiar contraseña" />
          <span className="text-ink-3">Guárdala ahora: no se vuelve a mostrar.</span>
        </>
      )}
    </p>
  );
}

function LevelSelect({ agents, value, onChange, id }: { agents: Agent[]; value: string; onChange: (v: string) => void; id?: string }) {
  return (
    <select id={id} name="level" value={value} onChange={(e) => onChange(e.target.value)} className={`${input} min-w-0`}>
      <option value="all">Todo el dashboard</option>
      <optgroup label="Solo los leads de un agente">
        {agents.map((a) => <option key={a.id} value={a.id}>Solo {a.name}</option>)}
      </optgroup>
    </select>
  );
}

function Check({ name, label, defaultChecked, disabled, clearWhenDisabled, hint }: {
  name: string; label: string; defaultChecked?: boolean; disabled?: boolean; clearWhenDisabled?: boolean; hint?: string;
}) {
  const clear = disabled && clearWhenDisabled;
  return (
    <label className={`flex items-center gap-1.5 text-sm ${disabled ? "text-ink-3" : "text-ink-2"}`} title={hint}>
      {/* key: con clearWhenDisabled, al deshabilitarse se desmarca (un miembro limitado a un agente no ve anuncios) */}
      <input key={String(clear)} type="checkbox" name={name} defaultChecked={clear ? false : defaultChecked} disabled={disabled}
        className="size-4 accent-[var(--accent)]" />
      {label}
    </label>
  );
}

export function AddMemberForm({ agents, defaultEmail = "" }: { agents: Agent[]; defaultEmail?: string }) {
  const [state, action, pending] = useActionState(addMember, {});
  const [level, setLevel] = useState("all");
  return (
    <form action={action} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr]">
        <label className="block">
          <span className="text-xs font-medium text-ink-2">Email</span>
          <input name="email" type="email" required defaultValue={defaultEmail} autoComplete="off" className={`${input} mt-1 w-full`} />
        </label>
        <label className="block">
          <span className="text-xs font-medium text-ink-2">Contraseña (opcional)</span>
          <input name="password" type="text" minLength={8} autoComplete="new-password" placeholder="Se genera si la dejas vacía"
            className={`${input} mt-1 w-full`} />
        </label>
        <label className="block">
          <span className="text-xs font-medium text-ink-2">Qué ve</span>
          <div className="mt-1 grid"><LevelSelect agents={agents} value={level} onChange={setLevel} /></div>
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-4">
        <Check name="ads" label="Campañas y Anuncios" disabled={level !== "all"} clearWhenDisabled
          hint={level !== "all" ? "Quien ve solo un agente no puede ver anuncios" : undefined} />
        <Check name="admin" label="Administrador (gestiona accesos)" />
        <button type="submit" disabled={pending} className={`${primary} ml-auto`}>{pending ? "Guardando…" : "Dar acceso"}</button>
      </div>
      <p className="text-xs text-ink-3">
        Si el email no tiene cuenta, se crea. Si ya la tiene, se le da acceso y, si escribes una contraseña, se le cambia.
      </p>
      <Result state={state} />
    </form>
  );
}

export function MemberRow({ member, agents, isSelf }: { member: Member; agents: Agent[]; isSelf: boolean }) {
  const [saveState, save, saving] = useActionState(updateMember, {});
  const [removeState, remove, removing] = useActionState(removeMember, {});
  const [pwState, reset, resetting] = useActionState(resetPassword, {});
  const [level, setLevel] = useState(member.agentId ?? "all");

  return (
    <li className="space-y-2 px-5 py-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <p className="min-w-0 truncate font-medium text-ink">
          {member.email}
          {isSelf && <span className="ml-1.5 rounded bg-accent-soft px-1.5 py-0.5 text-[11px] font-medium text-accent">Tú</span>}
        </p>
        <p className="text-xs text-ink-3">
          {member.lastSignIn ? <>Último acceso: <LocalTime iso={member.lastSignIn} /></> : "Nunca ha entrado"}
        </p>
      </div>

      <form action={save} className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <input type="hidden" name="userId" value={member.userId} />
        <div className="grid min-w-0 max-w-full"><LevelSelect agents={agents} value={level} onChange={setLevel} /></div>
        <Check name="ads" label="Campañas y Anuncios" defaultChecked={member.canSeeAds} disabled={level !== "all"} clearWhenDisabled
          hint={level !== "all" ? "Quien ve solo un agente no puede ver anuncios" : undefined} />
        <Check name="admin" label="Administrador" defaultChecked={member.isAdmin} disabled={isSelf}
          hint={isSelf ? "No puedes quitarte el rol a ti mismo" : undefined} />
        {/* Un checkbox deshabilitado no se envía: el propio admin conserva su rol */}
        {isSelf && <input type="hidden" name="admin" value="on" />}
        <button type="submit" disabled={saving} className={secondary}>{saving ? "Guardando…" : "Guardar"}</button>
      </form>

      <div className="flex flex-wrap items-center gap-2">
        <form action={reset} onSubmit={(e) => { if (!confirm(`¿Poner una contraseña nueva a ${member.email}? La actual dejará de funcionar.`)) e.preventDefault(); }}>
          <input type="hidden" name="userId" value={member.userId} />
          <button type="submit" disabled={resetting} className={secondary}>{resetting ? "…" : "Nueva contraseña"}</button>
        </form>
        {!isSelf && (
          <form action={remove} onSubmit={(e) => { if (!confirm(`¿Quitar el acceso al dashboard a ${member.email}?`)) e.preventDefault(); }}>
            <input type="hidden" name="userId" value={member.userId} />
            <button type="submit" disabled={removing} className={`${secondary} text-critical hover:text-critical`}>{removing ? "…" : "Quitar acceso"}</button>
          </form>
        )}
      </div>
      <Result state={saveState} />
      <Result state={pwState} />
      <Result state={removeState} />
    </li>
  );
}
