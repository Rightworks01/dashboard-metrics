"use client";

import { useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { LeadFormBuilder } from "./lead-form-builder";

type Options = {
  pages: { id: string; name: string; instagram: { id: string; username: string | null } | null; forms: { id: string; name: string }[]; formsError?: string }[];
  regions: { key: string; name: string }[];
  locales: { key: number; name: string }[];
  pagesError?: string;
};
type Category = "EMPLOYMENT" | "FINANCIAL_PRODUCTS_SERVICES" | "NONE";
type Cta = "SIGN_UP" | "LEARN_MORE" | "APPLY_NOW" | "GET_QUOTE" | "CONTACT_US" | "SUBSCRIBE";
type Ad = {
  key: number; name: string; message: string; headline: string; description: string; cta: Cta;
  media: { kind: "image" | "video"; path: string; preview: string; fileName: string } | null;
  uploading: boolean; uploadError?: string;
};

const CATEGORIES: { value: Category; label: string; hint: string }[] = [
  { value: "EMPLOYMENT", label: "Empleo", hint: "Reclutamiento de agentes. Meta no permite edad, género ni código postal." },
  { value: "FINANCIAL_PRODUCTS_SERVICES", label: "Productos financieros", hint: "Seguros, IUL, créditos. Mismas restricciones de segmentación." },
  { value: "NONE", label: "Ninguna", hint: "Solo si el anuncio no es de empleo ni de productos financieros." },
];
const CTAS: { value: Cta; label: string }[] = [
  { value: "SIGN_UP", label: "Registrarte" }, { value: "LEARN_MORE", label: "Más información" }, { value: "APPLY_NOW", label: "Postularte" },
  { value: "GET_QUOTE", label: "Obtener cotización" }, { value: "CONTACT_US", label: "Contactarnos" }, { value: "SUBSCRIBE", label: "Suscribirte" },
];
const ACCEPT = "image/jpeg,image/png,video/mp4,video/quicktime";
const MAX_MB = 50;

const input = "w-full rounded-lg border border-line bg-surface px-2.5 py-1.5 text-sm text-ink placeholder:text-ink-3 focus:border-accent focus:outline-none";
const label = "mb-1 block text-xs font-medium text-ink-2";

let nextKey = 1;
const newAd = (n: number): Ad => ({ key: nextKey++, name: `Anuncio ${n}`, message: "", headline: "", description: "", cta: "SIGN_UP", media: null, uploading: false });

function Section({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section className="card space-y-4 p-5">
      <h2 className="text-sm font-semibold text-ink"><span className="mr-2 text-accent">{n}.</span>{title}</h2>
      {children}
    </section>
  );
}

export function PublishWizard({ options, apiBase = "/api/meta/publish", embedded = false }: { options: Options; apiBase?: string; embedded?: boolean }) {
  const firstPage = options.pages[0];
  const [campaignName, setCampaignName] = useState("");
  const [category, setCategory] = useState<Category>("EMPLOYMENT");
  const [adsetName, setAdsetName] = useState("");
  const [budget, setBudget] = useState("10");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [allUS, setAllUS] = useState(true);
  const [regions, setRegions] = useState<string[]>([]);
  const [regionFilter, setRegionFilter] = useState("");
  const [locales, setLocales] = useState<number[]>(options.locales.filter((l) => /all|todos/i.test(l.name)).map((l) => l.key).slice(0, 1));
  const [ageMin, setAgeMin] = useState("");
  const [ageMax, setAgeMax] = useState("");
  const [pageId, setPageId] = useState(firstPage?.id ?? "");
  const [facebook, setFacebook] = useState(true);
  const [instagram, setInstagram] = useState(true);
  const [formId, setFormId] = useState(firstPage?.forms[0]?.id ?? "");
  const [ads, setAds] = useState<Ad[]>([newAd(1)]);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ ok: true; campaignId: string; adIds: string[]; managerUrl: string } | { ok: false; error: string } | null>(null);

  const [createdForms, setCreatedForms] = useState<Record<string, { id: string; name: string }[]>>({});
  const [buildingForm, setBuildingForm] = useState(false);
  const basePage = options.pages.find((p) => p.id === pageId);
  const page = basePage && { ...basePage, forms: [...(createdForms[basePage.id] ?? []), ...basePage.forms] };
  const visibleRegions = useMemo(
    () => options.regions.filter((r) => r.name.toLowerCase().includes(regionFilter.toLowerCase())),
    [options.regions, regionFilter],
  );
  const updateAd = (key: number, patch: Partial<Ad>) => setAds((list) => list.map((a) => (a.key === key ? { ...a, ...patch } : a)));

  async function upload(key: number, file: File) {
    if (file.size > MAX_MB * 1024 * 1024) {
      updateAd(key, { uploadError: `El archivo pesa más de ${MAX_MB} MB (límite del plan gratis de Supabase). Comprímelo o usa uno más corto.` });
      return;
    }
    updateAd(key, { uploading: true, uploadError: undefined, media: null });
    try {
      const res = await fetch(`${apiBase}/upload`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: file.name, type: file.type }),
      });
      const body = (await res.json()) as { path?: string; token?: string; error?: string };
      if (!res.ok || !body.path || !body.token) throw new Error(body.error ?? "No se pudo preparar la subida.");
      const { error } = await supabaseBrowser().storage.from("creatives").uploadToSignedUrl(body.path, body.token, file, { contentType: file.type });
      if (error) throw new Error(error.message);
      updateAd(key, {
        uploading: false,
        media: { kind: file.type.startsWith("video") ? "video" : "image", path: body.path, preview: URL.createObjectURL(file), fileName: file.name },
      });
    } catch (e) {
      updateAd(key, { uploading: false, uploadError: e instanceof Error ? e.message : "Falló la subida." });
    }
  }

  const missing: string[] = [];
  if (!campaignName.trim()) missing.push("nombre de la campaña");
  if (!adsetName.trim()) missing.push("nombre del conjunto");
  if (!(Number(budget) >= 1)) missing.push("presupuesto diario");
  if (!pageId) missing.push("página");
  if (!formId) missing.push("formulario");
  if (!facebook && !instagram) missing.push("al menos Facebook o Instagram");
  if (!allUS && regions.length === 0) missing.push("estados");
  ads.forEach((a, i) => {
    if (!a.media) missing.push(`imagen o video del anuncio ${i + 1}`);
    if (!a.message.trim()) missing.push(`texto principal del anuncio ${i + 1}`);
  });
  const uploading = ads.some((a) => a.uploading);

  async function submit() {
    setSending(true);
    setResult(null);
    const payload = {
      campaign: { name: campaignName, specialCategory: category },
      adset: {
        name: adsetName, dailyBudget: Number(budget),
        startTime: start ? new Date(start).toISOString() : undefined,
        endTime: end ? new Date(end).toISOString() : undefined,
        regions: allUS ? [] : regions, locales,
        ageMin: category === "NONE" && ageMin ? Number(ageMin) : undefined,
        ageMax: category === "NONE" && ageMax ? Number(ageMax) : undefined,
        facebook, instagram: instagram && !!page?.instagram, pageId, instagramId: page?.instagram?.id, formId,
      },
      ads: ads.map((a) => ({ name: a.name, media: { kind: a.media!.kind, path: a.media!.path }, message: a.message, headline: a.headline, description: a.description, cta: a.cta })),
    };
    try {
      const res = await fetch(apiBase, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const body = (await res.json()) as { ok?: boolean; error?: string; campaignId?: string; adIds?: string[]; managerUrl?: string };
      setResult(res.ok && body.campaignId ? { ok: true, campaignId: body.campaignId, adIds: body.adIds ?? [], managerUrl: body.managerUrl ?? "" } : { ok: false, error: body.error ?? "Falló la publicación." });
    } catch {
      setResult({ ok: false, error: "Se cortó la conexión. Revisa en Campañas si la campaña se creó antes de reintentar." });
    } finally {
      setSending(false);
    }
  }

  if (result?.ok) {
    return (
      <div className="card space-y-3 p-6">
        <h2 className="text-lg font-semibold text-good-ink">✓ Campaña creada en pausa</h2>
        <p className="text-sm text-ink-2">
          Se creó «{campaignName}» con {result.adIds.length} {result.adIds.length === 1 ? "anuncio" : "anuncios"}. No gasta nada hasta que la actives.
          Revisa la vista previa en el Administrador de anuncios y actívala desde <strong>Campañas</strong> o desde Meta.
          Meta revisa los anuncios antes de publicarlos (suele tardar de minutos a 24 h).
        </p>
        <div className="flex flex-wrap gap-2">
          <a href={result.managerUrl} target="_blank" rel="noopener noreferrer" className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-white hover:opacity-90">Ver en el Administrador de anuncios ↗</a>
          <a href="/campanas?camp=todas" {...(embedded ? { target: "_blank", rel: "noopener noreferrer" } : {})} className="rounded-lg border border-line px-3 py-1.5 text-sm font-medium text-ink-2 hover:bg-surface-2">{embedded ? "Abrir Campañas en el dashboard ↗" : "Ir a Campañas"}</a>
          <button type="button" onClick={() => { setResult(null); setAds([newAd(1)]); setCampaignName(""); setAdsetName(""); }}
            className="rounded-lg border border-line px-3 py-1.5 text-sm font-medium text-ink-2 hover:bg-surface-2">Crear otra</button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {options.pagesError && (
        <div role="alert" className="rounded-xl border border-critical/40 bg-critical-soft px-4 py-3 text-sm text-ink">
          <strong className="text-critical">No se pudieron leer las páginas de Facebook.</strong> Asigna la Página al usuario del sistema
          (Configuración del negocio → Usuarios del sistema → Asignar activos → Páginas, control total). Detalle: {options.pagesError}
        </div>
      )}

      <Section n={1} title="Campaña">
        <div className="grid gap-4 sm:grid-cols-2">
          <div><label className={label} htmlFor="cname">Nombre de la campaña</label>
            <input id="cname" className={input} value={campaignName} onChange={(e) => setCampaignName(e.target.value)} placeholder="Reclutamiento Sin Licencia – Dic 2026" /></div>
          <div><span className={label}>Objetivo</span><p className="py-1.5 text-sm text-ink">Clientes potenciales (formulario instantáneo)</p></div>
        </div>
        <fieldset>
          <legend className={label}>Categoría especial de anuncio (obligatoria según Meta)</legend>
          <div className="grid gap-2 sm:grid-cols-3">
            {CATEGORIES.map((c) => (
              <label key={c.value} className={`flex cursor-pointer gap-2 rounded-lg border px-3 py-2 text-sm ${category === c.value ? "border-accent bg-accent-soft" : "border-line hover:bg-surface-2"}`}>
                <input type="radio" name="category" checked={category === c.value} onChange={() => setCategory(c.value)} className="mt-0.5" />
                <span><span className="font-medium text-ink">{c.label}</span><span className="block text-xs text-ink-3">{c.hint}</span></span>
              </label>
            ))}
          </div>
        </fieldset>
      </Section>

      <Section n={2} title="Conjunto de anuncios: presupuesto, público y formulario">
        <div className="grid gap-4 sm:grid-cols-4">
          <div className="sm:col-span-2"><label className={label} htmlFor="aname">Nombre del conjunto</label>
            <input id="aname" className={input} value={adsetName} onChange={(e) => setAdsetName(e.target.value)} placeholder="EE. UU. – Español" /></div>
          <div><label className={label} htmlFor="budget">Presupuesto diario (USD)</label>
            <input id="budget" className={`${input} tabular-nums`} inputMode="decimal" value={budget} onChange={(e) => setBudget(e.target.value)} /></div>
          <div />
          <div className="sm:col-span-2"><label className={label} htmlFor="start">Inicio (vacío = al activarla)</label>
            <input id="start" type="datetime-local" className={input} value={start} onChange={(e) => setStart(e.target.value)} /></div>
          <div className="sm:col-span-2"><label className={label} htmlFor="end">Fin (opcional)</label>
            <input id="end" type="datetime-local" className={input} value={end} onChange={(e) => setEnd(e.target.value)} /></div>
        </div>

        <fieldset>
          <legend className={label}>Ubicación</legend>
          <label className="mr-4 inline-flex items-center gap-1.5 text-sm"><input type="radio" checked={allUS} onChange={() => setAllUS(true)} /> Todo EE. UU.</label>
          <label className="inline-flex items-center gap-1.5 text-sm"><input type="radio" checked={!allUS} onChange={() => setAllUS(false)} /> Estados específicos {regions.length ? `(${regions.length})` : ""}</label>
          {!allUS && (
            <div className="mt-2 rounded-lg border border-line p-2">
              <input className={`${input} mb-2`} placeholder="Buscar estado…" value={regionFilter} onChange={(e) => setRegionFilter(e.target.value)} />
              <div className="grid max-h-48 grid-cols-2 gap-1 overflow-y-auto text-sm sm:grid-cols-4">
                {visibleRegions.map((r) => (
                  <label key={r.key} className="flex items-center gap-1.5">
                    <input type="checkbox" checked={regions.includes(r.key)}
                      onChange={(e) => setRegions((x) => (e.target.checked ? [...x, r.key] : x.filter((k) => k !== r.key)))} /> {r.name}
                  </label>
                ))}
              </div>
            </div>
          )}
        </fieldset>

        {options.locales.length > 0 && (
          <fieldset>
            <legend className={label}>Idioma del público (vacío = todos)</legend>
            <div className="flex flex-wrap gap-3 text-sm">
              {options.locales.map((l) => (
                <label key={l.key} className="inline-flex items-center gap-1.5">
                  <input type="checkbox" checked={locales.includes(l.key)}
                    onChange={(e) => setLocales((x) => (e.target.checked ? [...x, l.key] : x.filter((k) => k !== l.key)))} /> {l.name}
                </label>
              ))}
            </div>
          </fieldset>
        )}

        {category === "NONE" ? (
          <div className="grid max-w-xs grid-cols-2 gap-3">
            <div><label className={label} htmlFor="amin">Edad mínima</label><input id="amin" className={input} inputMode="numeric" value={ageMin} onChange={(e) => setAgeMin(e.target.value)} placeholder="18" /></div>
            <div><label className={label} htmlFor="amax">Edad máxima</label><input id="amax" className={input} inputMode="numeric" value={ageMax} onChange={(e) => setAgeMax(e.target.value)} placeholder="65" /></div>
          </div>
        ) : (
          <p className="text-xs text-ink-3">Con categoría especial, Meta muestra el anuncio a mayores de 18 sin filtrar por edad ni género.</p>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <div><label className={label} htmlFor="page">Página de Facebook</label>
            <select id="page" className={input} value={pageId} onChange={(e) => { const id = e.target.value; setPageId(id); setBuildingForm(false); setFormId((createdForms[id] ?? options.pages.find((p) => p.id === id)?.forms ?? [])[0]?.id ?? ""); }}>
              {options.pages.length === 0 && <option value="">Sin páginas disponibles</option>}
              {options.pages.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select></div>
          <div><label className={label} htmlFor="form">Formulario instantáneo</label>
            <select id="form" className={input} value={formId} onChange={(e) => setFormId(e.target.value)}>
              {!page?.forms.length && <option value="">Sin formularios activos</option>}
              {page?.forms.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
            {page?.formsError && <p className="mt-1 text-xs text-critical">No se pudieron leer los formularios: {page.formsError}</p>}
            {pageId && !buildingForm && (
              <button type="button" onClick={() => setBuildingForm(true)} className="mt-1 text-sm font-medium text-accent hover:underline">+ Crear formulario nuevo</button>
            )}
          </div>
        </div>
        {buildingForm && pageId && (
          <LeadFormBuilder pageId={pageId} apiBase={apiBase} onCancel={() => setBuildingForm(false)}
            onCreated={(f) => {
              setCreatedForms((x) => ({ ...x, [pageId]: [f, ...(x[pageId] ?? [])] }));
              setFormId(f.id);
              setBuildingForm(false);
            }} />
        )}
        <fieldset className="flex flex-wrap gap-4 text-sm">
          <legend className={label}>Dónde se muestra</legend>
          <label className="inline-flex items-center gap-1.5"><input type="checkbox" checked={facebook} onChange={(e) => setFacebook(e.target.checked)} /> Facebook</label>
          <label className="inline-flex items-center gap-1.5">
            <input type="checkbox" checked={instagram && !!page?.instagram} disabled={!page?.instagram} onChange={(e) => setInstagram(e.target.checked)} />
            Instagram {page?.instagram ? `(@${page.instagram.username ?? page.instagram.id})` : "— la página no tiene Instagram vinculado"}
          </label>
        </fieldset>
      </Section>

      <Section n={3} title={`Anuncios · ${ads.length}`}>
        {ads.map((ad, i) => (
          <div key={ad.key} className="space-y-3 rounded-lg border border-line p-4">
            <div className="flex items-center justify-between gap-2">
              <input className={`${input} max-w-xs font-medium`} value={ad.name} onChange={(e) => updateAd(ad.key, { name: e.target.value })} aria-label="Nombre del anuncio" />
              {ads.length > 1 && <button type="button" onClick={() => setAds((x) => x.filter((a) => a.key !== ad.key))} className="text-sm text-ink-3 hover:text-critical">Quitar</button>}
            </div>
            <div className="grid gap-4 md:grid-cols-[14rem_1fr]">
              <div>
                <span className={label}>Imagen o video</span>
                <label className="flex aspect-square cursor-pointer items-center justify-center overflow-hidden rounded-lg border border-dashed border-line bg-surface-2 text-center text-xs text-ink-3 hover:border-accent">
                  {ad.uploading ? "Subiendo…" : ad.media ? (
                    ad.media.kind === "image"
                      ? <img src={ad.media.preview} alt="" className="size-full object-cover" />
                      : <video src={ad.media.preview} className="size-full object-cover" muted controls />
                  ) : <span className="px-3">JPG, PNG, MP4 o MOV<br />hasta {MAX_MB} MB<br />Recomendado 1080×1080 o 1080×1350</span>}
                  <input type="file" accept={ACCEPT} className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(ad.key, f); }} />
                </label>
                {ad.media && <p className="mt-1 truncate text-xs text-ink-3" title={ad.media.fileName}>{ad.media.fileName}</p>}
                {ad.uploadError && <p className="mt-1 text-xs text-critical">{ad.uploadError}</p>}
              </div>
              <div className="space-y-3">
                <div><label className={label} htmlFor={`msg${ad.key}`}>Texto principal</label>
                  <textarea id={`msg${ad.key}`} rows={5} className={input} value={ad.message} onChange={(e) => updateAd(ad.key, { message: e.target.value })} maxLength={2000} /></div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div><label className={label} htmlFor={`hl${ad.key}`}>Título</label>
                    <input id={`hl${ad.key}`} className={input} value={ad.headline} onChange={(e) => updateAd(ad.key, { headline: e.target.value })} maxLength={255} /></div>
                  <div><label className={label} htmlFor={`cta${ad.key}`}>Botón</label>
                    <select id={`cta${ad.key}`} className={input} value={ad.cta} onChange={(e) => updateAd(ad.key, { cta: e.target.value as Cta })}>
                      {CTAS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                    </select></div>
                </div>
                <div><label className={label} htmlFor={`ds${ad.key}`}>Descripción (opcional)</label>
                  <input id={`ds${ad.key}`} className={input} value={ad.description} onChange={(e) => updateAd(ad.key, { description: e.target.value })} maxLength={255} /></div>
              </div>
            </div>
            {i === ads.length - 1 && ads.length < 10 && (
              <button type="button" onClick={() => setAds((x) => [...x, { ...newAd(x.length + 1), message: ad.message, headline: ad.headline, description: ad.description, cta: ad.cta }])}
                className="text-sm font-medium text-accent hover:underline">+ Agregar otro anuncio (copia los textos de este)</button>
            )}
          </div>
        ))}
      </Section>

      <div className="card flex flex-wrap items-center justify-between gap-3 p-5">
        <p className="text-sm text-ink-2">
          {missing.length ? <>Falta: {missing.join(", ")}.</> : <>Se creará <strong>en pausa</strong>: no gasta hasta que la actives.</>}
        </p>
        <button type="button" disabled={missing.length > 0 || uploading || sending} onClick={submit}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50">
          {sending ? "Creando en Meta… (puede tardar con videos)" : "Crear campaña en pausa"}
        </button>
        {result && !result.ok && <p role="alert" className="w-full text-sm text-critical">{result.error}</p>}
      </div>
    </div>
  );
}
