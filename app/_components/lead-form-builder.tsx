"use client";

import { useState } from "react";
import { LimitHint } from "./limit-hint";

// Límites de Meta para formularios instantáneos (los mismos que pone Ads Manager).
const LIM = { name: 200, introTitle: 60, introText: 800, question: 80, option: 80, tyTitle: 60, tyBody: 160, tyButton: 60 };

type Std = "FULL_NAME" | "PHONE" | "EMAIL" | "STATE" | "CITY" | "ZIP";
const STANDARD: { value: Std; label: string }[] = [
  { value: "FULL_NAME", label: "Nombre completo" }, { value: "PHONE", label: "Teléfono" }, { value: "EMAIL", label: "Email" },
  { value: "STATE", label: "Estado" }, { value: "CITY", label: "Ciudad" }, { value: "ZIP", label: "Código postal" },
];
type Custom = { key: number; label: string; options: string };

const input = "w-full rounded-lg border border-line bg-surface px-2.5 py-1.5 text-sm text-ink placeholder:text-ink-3 focus:border-accent focus:outline-none";
const label = "mb-1 block text-xs font-medium text-ink-2";
let k = 1;

/** Crea un formulario instantáneo en la página elegida y lo devuelve para seleccionarlo. */
export function LeadFormBuilder({ pageId, apiBase, onCreated, onCancel }: {
  pageId: string; apiBase: string;
  onCreated: (form: { id: string; name: string }) => void; onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const [locale, setLocale] = useState<"ES_LA" | "EN_US">("ES_LA");
  const [highIntent, setHighIntent] = useState(false);
  const [headline, setHeadline] = useState("");
  const [description, setDescription] = useState("");
  const [standard, setStandard] = useState<Std[]>(["FULL_NAME", "PHONE", "EMAIL"]);
  const [custom, setCustom] = useState<Custom[]>([
    { key: k++, label: "¿En qué estado vives?", options: "" },
    { key: k++, label: "¿En qué rango de edad te encuentras?", options: "18 - 30, 30 - 40, 40 - 50, 50+" },
  ]);
  const [privacyUrl, setPrivacyUrl] = useState("");
  const [tyTitle, setTyTitle] = useState("¡Gracias! Recibimos tus datos");
  const [tyBody, setTyBody] = useState("Un asesor te va a contactar muy pronto.");
  const [tyButton, setTyButton] = useState("Visitar sitio web");
  const [tyUrl, setTyUrl] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const missing = [
    !name.trim() && "nombre",
    standard.length === 0 && "al menos un campo",
    !/^https?:\/\/\S+\.\S+/.test(privacyUrl) && "URL de política de privacidad",
    !/^https?:\/\/\S+\.\S+/.test(tyUrl) && "URL del botón final",
    custom.some((c) => !c.label.trim()) && "texto de las preguntas",
    (!tyTitle.trim() || !tyButton.trim()) && "título y botón de la pantalla final",
  ].filter(Boolean) as string[];

  const over = name.trim().length > LIM.name || headline.trim().length > LIM.introTitle || description.trim().length > LIM.introText
    || tyTitle.trim().length > LIM.tyTitle || tyBody.trim().length > LIM.tyBody || tyButton.trim().length > LIM.tyButton
    || custom.some((c) => c.label.trim().length > LIM.question || c.options.split(",").some((o) => o.trim().length > LIM.option));

  async function create() {
    setSending(true);
    setError(null);
    try {
      const res = await fetch(`${apiBase}/form`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pageId, name, locale, highIntent, intro: { headline, description }, standard,
          custom: custom.map((c) => ({ label: c.label, options: c.options.split(",").map((o) => o.trim()).filter(Boolean) })),
          privacyUrl, thankYou: { title: tyTitle, body: tyBody, buttonText: tyButton, websiteUrl: tyUrl },
        }),
      });
      const body = (await res.json()) as { form?: { id: string; name: string }; error?: string };
      if (!res.ok || !body.form) throw new Error(body.error ?? "No se pudo crear el formulario.");
      onCreated(body.form);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo crear el formulario.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="space-y-4 rounded-lg border border-accent/40 bg-accent-soft/40 p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-ink">Nuevo formulario instantáneo</h3>
        <button type="button" onClick={onCancel} className="text-sm text-ink-3 hover:text-ink">Cancelar</button>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="sm:col-span-2"><label className={label} htmlFor="fname">Nombre del formulario</label>
          <input id="fname" className={input} value={name} onChange={(e) => setName(e.target.value)} placeholder="V5 - RightWorks - Reclutamiento - Dic 2026" /><LimitHint value={name} limit={LIM.name} /></div>
        <div><label className={label} htmlFor="flocale">Idioma</label>
          <select id="flocale" className={input} value={locale} onChange={(e) => setLocale(e.target.value as "ES_LA" | "EN_US")}>
            <option value="ES_LA">Español</option><option value="EN_US">Inglés</option>
          </select></div>
      </div>
      <fieldset className="flex flex-wrap gap-4 text-sm">
        <legend className={label}>Tipo</legend>
        <label className="inline-flex items-center gap-1.5"><input type="radio" checked={!highIntent} onChange={() => setHighIntent(false)} /> Más volumen</label>
        <label className="inline-flex items-center gap-1.5"><input type="radio" checked={highIntent} onChange={() => setHighIntent(true)} /> Mayor intención (agrega un paso para confirmar los datos)</label>
      </fieldset>
      <div className="grid gap-3 sm:grid-cols-2">
        <div><label className={label} htmlFor="fhl">Introducción: título (opcional)</label>
          <input id="fhl" className={input} value={headline} onChange={(e) => setHeadline(e.target.value)} /><LimitHint value={headline} limit={LIM.introTitle} /></div>
        <div><label className={label} htmlFor="fdesc">Introducción: texto (opcional)</label>
          <textarea id="fdesc" rows={3} className={input} value={description} onChange={(e) => setDescription(e.target.value)} /><LimitHint value={description} limit={LIM.introText} /></div>
      </div>
      <fieldset>
        <legend className={label}>Datos de contacto (Meta los rellena con el perfil)</legend>
        <div className="flex flex-wrap gap-4 text-sm">
          {STANDARD.map((s) => (
            <label key={s.value} className="inline-flex items-center gap-1.5">
              <input type="checkbox" checked={standard.includes(s.value)}
                onChange={(e) => setStandard((x) => (e.target.checked ? [...x, s.value] : x.filter((v) => v !== s.value)))} /> {s.label}
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset className="space-y-2">
        <legend className={label}>Preguntas personalizadas (opciones separadas por coma; vacío = respuesta libre)</legend>
        {custom.map((c) => (
          <div key={c.key} className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
            <div><input className={input} value={c.label} placeholder="Pregunta"
              onChange={(e) => setCustom((x) => x.map((q) => (q.key === c.key ? { ...q, label: e.target.value } : q)))} />
              <LimitHint value={c.label} limit={LIM.question} />
              {c.options.split(",").some((o) => o.trim().length > LIM.option) && (
                <p className="text-xs text-warning-ink">Alguna opción pasa de {LIM.option} caracteres: Meta podría rechazarla.</p>
              )}</div>
            <input className={input} value={c.options} placeholder="Opción 1, Opción 2… (opcional)"
              onChange={(e) => setCustom((x) => x.map((q) => (q.key === c.key ? { ...q, options: e.target.value } : q)))} />
            <button type="button" onClick={() => setCustom((x) => x.filter((q) => q.key !== c.key))} className="px-2 text-sm text-ink-3 hover:text-critical">✕</button>
          </div>
        ))}
        {custom.length < 10 && (
          <button type="button" onClick={() => setCustom((x) => [...x, { key: k++, label: "", options: "" }])} className="text-sm font-medium text-accent hover:underline">+ Agregar pregunta</button>
        )}
      </fieldset>
      <div><label className={label} htmlFor="fpriv">URL de la política de privacidad (obligatoria para Meta)</label>
        <input id="fpriv" className={input} value={privacyUrl} onChange={(e) => setPrivacyUrl(e.target.value)} placeholder="https://rightworksinsurance.com/privacidad" /></div>
      <fieldset className="grid gap-3 sm:grid-cols-2">
        <legend className={label}>Pantalla final</legend>
        <div><input className={input} value={tyTitle} onChange={(e) => setTyTitle(e.target.value)} aria-label="Título final" /><LimitHint value={tyTitle} limit={LIM.tyTitle} /></div>
        <div className="sm:col-span-2"><textarea rows={3} className={input} value={tyBody} onChange={(e) => setTyBody(e.target.value)} aria-label="Texto final" /><LimitHint value={tyBody} limit={LIM.tyBody} /></div>
        <div><input className={input} value={tyButton} onChange={(e) => setTyButton(e.target.value)} aria-label="Texto del botón" /><LimitHint value={tyButton} limit={LIM.tyButton} /></div>
        <div><input className={input} value={tyUrl} onChange={(e) => setTyUrl(e.target.value)} placeholder="https://rightworksinsurance.com" aria-label="URL del botón" /></div>
      </fieldset>
      <p className="text-xs text-ink-3">
        Después de crearlo, mapéalo en GHL (Settings → Integrations → Facebook → mapeo de formularios) para que las respuestas
        lleguen a los campos correctos, por ejemplo el estado a <code>contact.estado</code>.
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" disabled={missing.length > 0 || sending} onClick={create}
          className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50">
          {sending ? "Creando en Meta…" : "Crear formulario"}
        </button>
        {missing.length > 0 && <span className="text-xs text-ink-3">Falta: {missing.join(", ")}.</span>}
        {over && <span className="text-xs text-warning-ink">Hay textos que pasan el límite de Meta (en ámbar): puedes intentarlo, pero Meta probablemente lo rechace.</span>}
        {error && <span role="alert" className="text-sm text-critical">{error}</span>}
      </div>
    </div>
  );
}
