"use client";

import { useState } from "react";
import { Avatar, Icon } from "@visual/componentes/meta/meta-ui";

// Vista previa del formulario instantáneo con el aspecto de Meta, pantalla por pantalla, dentro de un teléfono.

export type LeadFormPreviewProps = {
  pageName: string;
  pageAvatar?: string | null;
  english: boolean;
  highIntent: boolean;
  headline: string;
  description: string;
  fields: string[];                                   // etiquetas de los datos de contacto
  questions: { label: string; options: string[] }[];
  privacyText: string;
  thankYou: { title: string; body: string; button: string };
};

type Step = "intro" | "questions" | "review" | "end";

const T = {
  es: { next: "Siguiente", submit: "Enviar", contact: "Información de contacto", prefill: "Meta rellena estos datos con el perfil de la persona.",
    review: "Revisa tu información", reviewHelp: "Asegúrate de que tus datos sean correctos antes de enviarlos.", edit: "Editar",
    privacy: (page: string) => `Al hacer clic en Enviar, aceptas que ${page} reciba tu información según su política de privacidad.`,
    answer: "Escribe tu respuesta", choose: "Selecciona una opción",
    steps: { intro: "Introducción", questions: "Preguntas", review: "Revisión", end: "Finalización" } },
  en: { next: "Next", submit: "Submit", contact: "Contact information", prefill: "Meta prefills these from the person's profile.",
    review: "Review your info", reviewHelp: "Make sure your info is correct before you submit.", edit: "Edit",
    privacy: (page: string) => `By clicking Submit, you agree to send your info to ${page} who agrees to use it according to their privacy policy.`,
    answer: "Enter your answer", choose: "Select an option",
    steps: { intro: "Intro", questions: "Questions", review: "Review", end: "Completion" } },
};

export function LeadFormPreview(p: LeadFormPreviewProps) {
  const t = p.english ? T.en : T.es;
  const steps: Step[] = [...(p.headline.trim() || p.description.trim() ? ["intro" as const] : []), "questions", ...(p.highIntent ? ["review" as const] : []), "end"];
  const [step, setStep] = useState<Step>("questions");
  const current = steps.includes(step) ? step : steps[0];
  const idx = steps.indexOf(current);
  const go = (d: number) => setStep(steps[Math.min(steps.length - 1, Math.max(0, idx + d))]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-sm font-semibold text-ink">Vista previa del formulario</h4>
        <span className="text-xs text-ink-3">{idx + 1} / {steps.length}</span>
      </div>
      <div className="flex flex-wrap gap-1" role="tablist" aria-label="Pantallas del formulario">
        {steps.map((s) => (
          <button key={s} type="button" role="tab" aria-selected={s === current} onClick={() => setStep(s)}
            className={`rounded-full px-2.5 py-0.5 text-xs ${s === current ? "bg-accent text-white" : "bg-surface-2 text-ink-2 hover:bg-surface"}`}>
            {t.steps[s]}
          </button>
        ))}
      </div>

      {/* Teléfono */}
      <div className="mx-auto w-full max-w-[18rem] rounded-[2rem] bg-stage p-2 shadow-[var(--shadow)]">
        <div className="flex h-[30rem] flex-col overflow-hidden rounded-[1.6rem] bg-surface text-ink">
          <div className="flex items-center justify-between px-4 pb-1 pt-3 text-ink-2">
            <span className="h-1 w-10 rounded-full bg-line" /><Icon name="close" className="size-4" />
          </div>
          <div className="flex-1 overflow-y-auto px-4 pb-3">
            {current === "intro" && (
              <div className="space-y-3 pt-4 text-center">
                <Avatar src={p.pageAvatar} name={p.pageName} className="mx-auto size-14" />
                <p className="text-xs text-ink-3">{p.pageName}</p>
                <p className="text-lg font-semibold leading-tight">{p.headline || p.pageName}</p>
                {p.description && <p className="whitespace-pre-line text-left text-sm text-ink-2">{p.description}</p>}
              </div>
            )}
            {current === "questions" && (
              <div className="space-y-4 pt-2">
                <div className="flex items-center gap-2">
                  <Avatar src={p.pageAvatar} name={p.pageName} className="size-7" /><span className="text-xs text-ink-3">{p.pageName}</span>
                </div>
                {p.fields.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-sm font-semibold">{t.contact}</p>
                    <p className="text-xs text-ink-3">{t.prefill}</p>
                    {p.fields.map((f) => (
                      <div key={f}><p className="text-xs text-ink-2">{f}</p><div className="mt-0.5 h-8 rounded-md border border-line bg-surface-2" /></div>
                    ))}
                  </div>
                )}
                {p.questions.map((q, i) => (
                  <div key={i} className="space-y-1.5">
                    <p className="text-sm font-semibold">{q.label || <span className="text-ink-3">Pregunta {i + 1}</span>}</p>
                    {q.options.length
                      ? q.options.map((o) => (
                        <div key={o} className="flex items-center gap-2 rounded-md border border-line px-2.5 py-1.5 text-sm">
                          <span className="size-3.5 rounded-full border border-ink-3" />{o}
                        </div>
                      ))
                      : <div className="flex h-8 items-center rounded-md border border-line bg-surface-2 px-2.5 text-xs text-ink-3">{t.answer}</div>}
                  </div>
                ))}
                {!p.highIntent && <p className="text-[0.7rem] leading-snug text-ink-3">{t.privacy(p.pageName)} <span className="text-accent">{p.privacyText}</span></p>}
              </div>
            )}
            {current === "review" && (
              <div className="space-y-3 pt-2">
                <p className="text-lg font-semibold leading-tight">{t.review}</p>
                <p className="text-sm text-ink-2">{t.reviewHelp}</p>
                {[...p.fields, ...p.questions.map((q) => q.label)].filter(Boolean).map((f) => (
                  <div key={f} className="flex items-center justify-between border-b border-line pb-1.5 text-sm">
                    <span className="text-ink-2">{f}</span><span className="text-accent">{t.edit}</span>
                  </div>
                ))}
                <p className="text-[0.7rem] leading-snug text-ink-3">{t.privacy(p.pageName)} <span className="text-accent">{p.privacyText}</span></p>
              </div>
            )}
            {current === "end" && (
              <div className="space-y-3 pt-10 text-center">
                <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-good-soft text-good-ink"><Icon name="check" className="size-6" /></span>
                <p className="text-lg font-semibold leading-tight">{p.thankYou.title}</p>
                {p.thankYou.body && <p className="whitespace-pre-line text-sm text-ink-2">{p.thankYou.body}</p>}
              </div>
            )}
          </div>
          <div className="border-t border-line p-3">
            <button type="button" onClick={() => go(1)} className="w-full rounded-md bg-accent py-2 text-sm font-semibold text-white hover:opacity-90">
              {current === "end" ? p.thankYou.button || "…" : (current === "questions" && !p.highIntent) || current === "review" ? t.submit : t.next}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
