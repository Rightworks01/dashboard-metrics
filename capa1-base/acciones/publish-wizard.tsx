"use client";

import { useMemo, useState } from "react";
import { supabaseBrowser } from "@base/conexiones/supabase/browser";
import { LeadFormBuilder } from "@base/acciones/lead-form-builder";
import { LimitHint } from "@visual/componentes/limit-hint";
import { AdPreview } from "@visual/componentes/meta/ad-preview";
import { Avatar, Icon, LevelHeader, MetaCard, MetaTree, type TreeItem } from "@visual/componentes/meta/meta-ui";

// Lo que Meta muestra antes de cortar con "Ver más" (no rechaza textos más largos).
const SHOWN = { message: 125, headline: 40, description: 30 };
const MAX_VARIANTS = 5;

type Options = {
  pages: { id: string; name: string; picture?: string | null; instagram: { id: string; username: string | null; picture?: string | null } | null; forms: { id: string; name: string }[]; formsError?: string }[];
  regions: { key: string; name: string }[];
  locales: { key: number; name: string }[];
  pagesError?: string;
};
type Category = "EMPLOYMENT" | "FINANCIAL_PRODUCTS_SERVICES" | "NONE";
type Cta = "SIGN_UP" | "LEARN_MORE" | "APPLY_NOW" | "GET_QUOTE" | "CONTACT_US" | "SUBSCRIBE";
type Ad = {
  key: number; name: string; messages: string[]; headlines: string[]; description: string; cta: Cta;
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
const newAd = (n: number): Ad => ({ key: nextKey++, name: `Anuncio ${n}`, messages: [""], headlines: [""], description: "", cta: "SIGN_UP", media: null, uploading: false });

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
  // key 0 fija para el primero: el contador global difiere entre servidor y navegador (hidratación)
  const [ads, setAds] = useState<Ad[]>(() => [{ ...newAd(1), key: 0 }]);
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
    if (!a.messages.some((m) => m.trim())) missing.push(`texto principal del anuncio ${i + 1}`);
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
      ads: ads.map((a) => ({ name: a.name, media: { kind: a.media!.kind, path: a.media!.path }, messages: a.messages, headlines: a.headlines, description: a.description, cta: a.cta })),
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

  const ctaLabel = (c: Cta) => CTAS.find((x) => x.value === c)?.label ?? c;
  const campaignDone = !!campaignName.trim();
  const adsetDone = !!adsetName.trim() && Number(budget) >= 1 && !!pageId && !!formId && (facebook || instagram) && (allUS || regions.length > 0);
  const tree: TreeItem[] = [
    { id: "campana", level: 0, label: campaignName, placeholder: "Nueva campaña de clientes potenciales", done: campaignDone },
    { id: "conjunto", level: 1, label: adsetName, placeholder: "Nuevo conjunto de anuncios", done: adsetDone },
    ...ads.map((a): TreeItem => ({ id: `anuncio-${a.key}`, level: 2, label: a.name, placeholder: "Nuevo anuncio", done: !!a.media && a.messages.some((m) => m.trim()) })),
  ];
  const publishButton = (
    <button type="button" disabled={missing.length > 0 || uploading || sending} onClick={submit}
      className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50">
      {sending ? "Publicando en Meta… (puede tardar con videos)" : "Publicar"}
    </button>
  );

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-[15rem_minmax(0,1fr)]">
      <aside className="space-y-3 lg:sticky lg:top-4 lg:self-start">
        <MetaTree items={tree} />
        <p className="px-1 text-xs text-ink-3">Todo se crea <strong className="text-ink-2">en pausa</strong>: no gasta hasta que lo actives.</p>
      </aside>

      <div className="min-w-0 space-y-8">
        {options.pagesError && (
          <div role="alert" className="rounded-xl border border-critical/40 bg-critical-soft px-4 py-3 text-sm text-ink">
            <strong className="text-critical">No se pudieron leer las páginas de Facebook.</strong> Asigna la Página al usuario del sistema
            (Configuración del negocio → Usuarios del sistema → Asignar activos → Páginas, control total). Detalle: {options.pagesError}
          </div>
        )}

        {/* ── Campaña ── */}
        <div id="campana" className="scroll-mt-4 space-y-3">
          <LevelHeader level={0} title={campaignName.trim() || "Nueva campaña de clientes potenciales"} />
          <MetaCard title="Nombre de la campaña">
            <input id="cname" aria-label="Nombre de la campaña" className={input} value={campaignName} onChange={(e) => setCampaignName(e.target.value)} placeholder="Reclutamiento Sin Licencia – Dic 2026" />
          </MetaCard>
          <MetaCard title="Categorías especiales de anuncios"
            help="Declara si tus anuncios ofrecen empleo o productos financieros. Meta lo exige y limita la segmentación.">
            <div className="grid gap-2 sm:grid-cols-3">
              {CATEGORIES.map((c) => (
                <label key={c.value} className={`flex cursor-pointer gap-2 rounded-lg border px-3 py-2 text-sm ${category === c.value ? "border-accent bg-accent-soft" : "border-line hover:bg-surface-2"}`}>
                  <input type="radio" name="category" checked={category === c.value} onChange={() => setCategory(c.value)} className="mt-0.5" />
                  <span><span className="font-medium text-ink">{c.label}</span><span className="block text-xs text-ink-3">{c.hint}</span></span>
                </label>
              ))}
            </div>
          </MetaCard>
          <MetaCard title="Detalles de la campaña">
            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              <div><dt className={label}>Tipo de compra</dt><dd className="text-ink">Subasta</dd></div>
              <div><dt className={label}>Objetivo de la campaña</dt><dd className="text-ink">Clientes potenciales</dd></div>
            </dl>
          </MetaCard>
        </div>

        {/* ── Conjunto de anuncios ── */}
        <div id="conjunto" className="scroll-mt-4 space-y-3">
          <LevelHeader level={1} title={adsetName.trim() || "Nuevo conjunto de anuncios"} />
          <MetaCard title="Nombre del conjunto de anuncios">
            <input id="aname" aria-label="Nombre del conjunto de anuncios" className={input} value={adsetName} onChange={(e) => setAdsetName(e.target.value)} placeholder="EE. UU. – Español" />
          </MetaCard>

          <MetaCard title="Ubicación de la conversión" help="Formularios instantáneos: la persona deja sus datos sin salir de Facebook o Instagram.">
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
                  <button type="button" onClick={() => setBuildingForm(true)} className="mt-1 text-sm font-medium text-accent hover:underline">+ Crear formulario</button>
                )}
              </div>
            </div>
            {buildingForm && pageId && (
              <LeadFormBuilder pageId={pageId} pageName={page?.name ?? ""} pageAvatar={page?.picture} apiBase={apiBase} onCancel={() => setBuildingForm(false)}
                onCreated={(f) => {
                  setCreatedForms((x) => ({ ...x, [pageId]: [f, ...(x[pageId] ?? [])] }));
                  setFormId(f.id);
                  setBuildingForm(false);
                }} />
            )}
          </MetaCard>

          <MetaCard title="Presupuesto y calendario">
            <div className="grid gap-4 sm:grid-cols-2">
              <div><label className={label} htmlFor="budget">Presupuesto diario</label>
                <div className="relative"><span className="pointer-events-none absolute inset-y-0 left-2.5 flex items-center text-sm text-ink-3">$</span>
                  <input id="budget" className={`${input} pl-6 tabular-nums`} inputMode="decimal" value={budget} onChange={(e) => setBudget(e.target.value)} /></div>
                <p className="mt-1 text-xs text-ink-3">USD. Meta puede gastar un poco más algunos días y menos otros.</p></div>
              <div />
              <div><label className={label} htmlFor="start">Fecha de inicio</label>
                <input id="start" type="datetime-local" className={input} value={start} onChange={(e) => setStart(e.target.value)} />
                <p className="mt-1 text-xs text-ink-3">Vacío = empieza cuando lo actives.</p></div>
              <div><label className={label} htmlFor="end">Fecha de finalización (opcional)</label>
                <input id="end" type="datetime-local" className={input} value={end} onChange={(e) => setEnd(e.target.value)} /></div>
            </div>
          </MetaCard>

          <MetaCard title="Público">
            <fieldset>
              <legend className={label}>Ubicaciones</legend>
              <label className="mr-4 inline-flex items-center gap-1.5 text-sm"><input type="radio" checked={allUS} onChange={() => setAllUS(true)} /> Estados Unidos</label>
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
            {category === "NONE" ? (
              <div className="grid max-w-xs grid-cols-2 gap-3">
                <div><label className={label} htmlFor="amin">Edad mínima</label><input id="amin" className={input} inputMode="numeric" value={ageMin} onChange={(e) => setAgeMin(e.target.value)} placeholder="18" /></div>
                <div><label className={label} htmlFor="amax">Edad máxima</label><input id="amax" className={input} inputMode="numeric" value={ageMax} onChange={(e) => setAgeMax(e.target.value)} placeholder="65+" /></div>
              </div>
            ) : (
              <div><span className={label}>Edad</span><p className="text-sm text-ink">18 - 65+</p>
                <p className="text-xs text-ink-3">Con categoría especial, Meta no permite filtrar por edad ni género.</p></div>
            )}
            {options.locales.length > 0 && (
              <fieldset>
                <legend className={label}>Idiomas (vacío = todos)</legend>
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
          </MetaCard>

          <MetaCard title="Ubicaciones" help="Ubicaciones manuales: elige en qué plataformas se muestra el anuncio.">
            <fieldset className="flex flex-wrap gap-4 text-sm">
              <legend className="sr-only">Plataformas</legend>
              <label className="inline-flex items-center gap-1.5"><input type="checkbox" checked={facebook} onChange={(e) => setFacebook(e.target.checked)} /> Facebook</label>
              <label className="inline-flex items-center gap-1.5">
                <input type="checkbox" checked={instagram && !!page?.instagram} disabled={!page?.instagram} onChange={(e) => setInstagram(e.target.checked)} />
                Instagram {page?.instagram ? `(@${page.instagram.username ?? page.instagram.id})` : <span className="text-ink-3">— la página no tiene Instagram vinculado</span>}
              </label>
            </fieldset>
          </MetaCard>
        </div>

        {/* ── Anuncios ── */}
        {ads.map((ad, i) => (
          <div key={ad.key} id={`anuncio-${ad.key}`} className="scroll-mt-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <LevelHeader level={2} title={ad.name.trim() || "Nuevo anuncio"} />
              {ads.length > 1 && <button type="button" onClick={() => setAds((x) => x.filter((a) => a.key !== ad.key))} className="text-sm text-ink-3 hover:text-critical">Eliminar anuncio</button>}
            </div>
            <div className="grid grid-cols-[minmax(0,1fr)] gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
              <div className="min-w-0 space-y-3">
                <MetaCard title="Nombre del anuncio">
                  <input className={input} value={ad.name} onChange={(e) => updateAd(ad.key, { name: e.target.value })} aria-label="Nombre del anuncio" />
                </MetaCard>
                <MetaCard title="Identidad">
                  <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
                    <span className="inline-flex items-center gap-2"><Avatar src={page?.picture} name={page?.name ?? "?"} className="size-6" />{page?.name ?? "Sin página"}</span>
                    <span className="inline-flex items-center gap-2 text-ink-2">
                      {page?.instagram
                        ? <><Avatar src={page.instagram.picture} name={page.instagram.username ?? "IG"} className="size-6" />@{page.instagram.username ?? page.instagram.id}</>
                        : "Instagram: usa la página de Facebook"}
                    </span>
                  </div>
                </MetaCard>
                <MetaCard title="Contenido multimedia" help="Recomendado: 1080×1080 (cuadrado) o 1080×1350 (vertical). JPG, PNG, MP4 o MOV.">
                  <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-dashed border-line bg-surface-2 p-3 text-sm hover:border-accent">
                    <span className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-md bg-surface text-ink-3">
                      {ad.media
                        ? (ad.media.kind === "image" ? <img src={ad.media.preview} alt="" className="size-full object-cover" /> : <video src={ad.media.preview} className="size-full object-cover" muted />)
                        : <Icon name="image" className="size-6" />}
                    </span>
                    <span className="min-w-0">
                      <span className="block font-medium text-accent">{ad.uploading ? "Subiendo…" : ad.media ? "Cambiar imagen o video" : "Agregar imagen o video"}</span>
                      <span className="block truncate text-xs text-ink-3">{ad.media ? ad.media.fileName : `Hasta ${MAX_MB} MB`}</span>
                    </span>
                    <input type="file" accept={ACCEPT} className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(ad.key, f); }} />
                  </label>
                  {ad.uploadError && <p className="text-xs text-critical">{ad.uploadError}</p>}
                </MetaCard>
                <MetaCard title="Texto principal" help="Agrega hasta 5 opciones. Meta combina textos y títulos y muestra a cada persona la que mejor le funciona.">
                  <Variants title="Texto principal" values={ad.messages} multiline shown={SHOWN.message} idPrefix={`msg${ad.key}`}
                    onChange={(messages) => updateAd(ad.key, { messages })} />
                </MetaCard>
                <MetaCard title="Título">
                  <Variants title="Título" values={ad.headlines} shown={SHOWN.headline} idPrefix={`hl${ad.key}`}
                    onChange={(headlines) => updateAd(ad.key, { headlines })} />
                </MetaCard>
                <MetaCard title="Descripción" help="Opcional.">
                  <input id={`ds${ad.key}`} aria-label="Descripción" className={input} value={ad.description} onChange={(e) => updateAd(ad.key, { description: e.target.value })} />
                  <LimitHint value={ad.description} limit={SHOWN.description} kind="soft" />
                </MetaCard>
                <MetaCard title="Llamada a la acción">
                  <select id={`cta${ad.key}`} aria-label="Llamada a la acción" className={`${input} sm:max-w-xs`} value={ad.cta} onChange={(e) => updateAd(ad.key, { cta: e.target.value as Cta })}>
                    {CTAS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                  </select>
                </MetaCard>
                {i === ads.length - 1 && ads.length < 10 && (
                  <button type="button" onClick={() => setAds((x) => [...x, { ...newAd(x.length + 1), messages: [...ad.messages], headlines: [...ad.headlines], description: ad.description, cta: ad.cta }])}
                    className="text-sm font-medium text-accent hover:underline">+ Duplicar anuncio (copia los textos de este)</button>
                )}
              </div>
              <div className="xl:sticky xl:top-4 xl:self-start">
                <div className="card p-4">
                  <AdPreview pageName={page?.name ?? "Tu página"} pageAvatar={page?.picture}
                    instagramUsername={page?.instagram?.username} instagramAvatar={page?.instagram?.picture}
                    messages={ad.messages} headlines={ad.headlines} description={ad.description} ctaLabel={ctaLabel(ad.cta)}
                    media={ad.media ? { kind: ad.media.kind, src: ad.media.preview } : null}
                    facebook={facebook} instagram={instagram && !!page?.instagram} />
                </div>
              </div>
            </div>
          </div>
        ))}

        {/* Barra inferior como la de Ads Manager */}
        <div className="card sticky bottom-3 z-10 flex flex-wrap items-center justify-between gap-3 p-4">
          <p className="min-w-0 flex-1 text-sm text-ink-2">
            {missing.length ? <>Falta: {missing.join(", ")}.</> : <>Listo para publicar. Se creará <strong>en pausa</strong>.</>}
          </p>
          {publishButton}
          {result && !result.ok && <p role="alert" className="w-full text-sm text-critical">{result.error}</p>}
        </div>
      </div>
    </div>
  );
}

/** Hasta 5 variantes de un texto (textos principales o títulos), como "Agregar opciones de texto" de Ads Manager. */
function Variants({ title, hint, values, onChange, multiline = false, shown, idPrefix }: {
  title: string; hint?: string; values: string[]; onChange: (v: string[]) => void; multiline?: boolean; shown: number; idPrefix: string;
}) {
  const set = (i: number, v: string) => onChange(values.map((x, j) => (j === i ? v : x)));
  return (
    <fieldset className="space-y-2">
      <legend className="sr-only">{title}</legend>
      {values.map((v, i) => (
        <div key={i}>
          <div className="flex items-start gap-2">
            {multiline
              ? <textarea id={`${idPrefix}-${i}`} rows={i === 0 ? 5 : 3} className={input} value={v} onChange={(e) => set(i, e.target.value)}
                  aria-label={`${title} ${i + 1}`} placeholder={i === 0 ? "" : `Opción ${i + 1}`} />
              : <input id={`${idPrefix}-${i}`} className={input} value={v} onChange={(e) => set(i, e.target.value)}
                  aria-label={`${title} ${i + 1}`} placeholder={i === 0 ? "" : `Opción ${i + 1}`} />}
            {values.length > 1 && (
              <button type="button" onClick={() => onChange(values.filter((_, j) => j !== i))}
                className="px-1 py-1.5 text-sm text-ink-3 hover:text-critical" aria-label={`Quitar ${title.toLowerCase()} ${i + 1}`}>✕</button>
            )}
          </div>
          <LimitHint value={v} limit={shown} kind="soft" />
        </div>
      ))}
      {values.length < MAX_VARIANTS && (
        <button type="button" onClick={() => onChange([...values, ""])} className="text-sm font-medium text-accent hover:underline">
          + Agregar otra opción de {title.toLowerCase()} ({values.length}/{MAX_VARIANTS})
        </button>
      )}
      {hint && values.length > 1 && <p className="text-xs text-ink-3">{hint}</p>}
    </fieldset>
  );
}
