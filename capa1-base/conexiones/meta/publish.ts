import "server-only";
import { z } from "zod";
import { fetchJson, HttpError } from "@base/conexiones/http";
import { logError } from "@base/conexiones/log";
import { supabaseAdmin } from "@base/conexiones/supabase/admin";
import { graphUrl, metaAccountId, metaRetryable } from "@base/conexiones/meta/client";

// Publicar campañas de leads en Meta desde el dashboard (solo admins). Todo se crea EN PAUSA: se revisa
// y se activa con el interruptor de Campañas. Si algo falla a mitad, se borra la campaña creada.

export const CREATIVES_BUCKET = "creatives";

// ---------------------------------------------------------------------------------------------
// Graph API: GET / POST con mensaje de error legible
// ---------------------------------------------------------------------------------------------

/** Mensaje de Meta para mostrar (error_user_msg si viene; si no, message). */
export function metaErrorMessage(error: unknown): string {
  if (error instanceof HttpError) {
    const json = error.message.slice(error.message.indexOf("{"));
    try {
      const e = (JSON.parse(json) as { error?: { message?: string; error_user_title?: string; error_user_msg?: string } }).error;
      if (e) return [e.error_user_title, e.error_user_msg ?? e.message].filter(Boolean).join(": ");
    } catch {
      // el cuerpo se cortó a 500 caracteres: se devuelve tal cual abajo
    }
    return error.message.replace(/access_token=[^&\s]+/g, "access_token=…");
  }
  return error instanceof Error ? error.message : String(error);
}

async function metaGet<T>(path: string, params: Record<string, string> = {}, label = path): Promise<T> {
  return fetchJson<T>(graphUrl(path, params), {}, `Meta GET ${label}`, metaRetryable);
}

/** POST form-encoded. Objetos y arrays van como JSON. Sin reintentos: crear dos veces duplicaría. */
async function metaPost<T>(path: string, params: Record<string, unknown>, label = path): Promise<T> {
  const body = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue;
    body.set(k, typeof v === "string" ? v : JSON.stringify(v));
  }
  return fetchJson<T>(graphUrl(path), {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  }, `Meta POST ${label}`, () => false);
}

// ---------------------------------------------------------------------------------------------
// Opciones para el asistente
// ---------------------------------------------------------------------------------------------

export type PublishOptions = {
  pages: { id: string; name: string; picture?: string | null; instagram: { id: string; username: string | null; picture?: string | null } | null; forms: { id: string; name: string }[]; formsError?: string }[];
  regions: { key: string; name: string }[];
  locales: { key: number; name: string }[];
  pagesError?: string;
};

type PageInfo = {
  id: string; name?: string; access_token?: string; picture?: { data?: { url?: string } };
  instagram_business_account?: { id: string; username?: string; profile_picture_url?: string };
};

export async function getPublishOptions(): Promise<PublishOptions> {
  const out: PublishOptions = { pages: [], regions: [], locales: [] };
  const [pages, regions, locales] = await Promise.allSettled([
    metaGet<{ data: { id: string; name: string }[] }>(`act_${metaAccountId()}/promote_pages`, { fields: "id,name", limit: "50" }, "promote_pages"),
    metaGet<{ data: { key: string; name: string }[] }>("search", {
      type: "adgeolocation", location_types: JSON.stringify(["region"]), country_code: "US", limit: "100",
    }, "search regions"),
    metaGet<{ data: { key: number; name: string }[] }>("search", { type: "adlocale", q: "Spanish" }, "search locales"),
  ]);
  if (regions.status === "fulfilled") out.regions = regions.value.data.map((r) => ({ key: String(r.key), name: r.name })).sort((a, b) => a.name.localeCompare(b.name));
  if (locales.status === "fulfilled") out.locales = locales.value.data;
  if (pages.status === "rejected") {
    out.pagesError = metaErrorMessage(pages.reason);
    logError("meta.publish.options.pages", pages.reason);
    return out;
  }
  for (const p of pages.value.data) {
    const page: PublishOptions["pages"][number] = { id: p.id, name: p.name, instagram: null, forms: [] };
    try {
      const info = await metaGet<PageInfo>(p.id, { fields: "name,access_token,picture.type(large){url},instagram_business_account{id,username,profile_picture_url}" }, "page");
      page.picture = info.picture?.data?.url ?? null; // para la vista previa del anuncio
      if (info.instagram_business_account) {
        const ig = info.instagram_business_account;
        page.instagram = { id: ig.id, username: ig.username ?? null, picture: ig.profile_picture_url ?? null };
      }
      if (!info.access_token) throw new Error("la página no está asignada al usuario del sistema (sin access_token de página)");
      // Los formularios se leen con el token de la página
      const version = process.env.META_API_VERSION ?? "v23.0";
      const forms = await fetchJson<{ data: { id: string; name: string; status: string }[] }>(
        `https://graph.facebook.com/${version}/${p.id}/leadgen_forms?${new URLSearchParams({ fields: "id,name,status", limit: "100", access_token: info.access_token })}`,
        {}, "Meta GET leadgen_forms", metaRetryable,
      );
      page.forms = forms.data.filter((f) => f.status === "ACTIVE").map((f) => ({ id: f.id, name: f.name }));
    } catch (error) {
      page.formsError = metaErrorMessage(error);
      logError("meta.publish.options.page", error, { pageId: p.id });
    }
    out.pages.push(page);
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Publicación
// ---------------------------------------------------------------------------------------------

export const SPECIAL_CATEGORIES = {
  EMPLOYMENT: "Empleo (reclutamiento)",
  FINANCIAL_PRODUCTS_SERVICES: "Productos financieros (seguros, créditos)",
  NONE: "Ninguna",
} as const;

export const CTAS = {
  SIGN_UP: "Registrarte",
  LEARN_MORE: "Más información",
  APPLY_NOW: "Postularte",
  GET_QUOTE: "Obtener cotización",
  CONTACT_US: "Contactarnos",
  SUBSCRIBE: "Suscribirte",
} as const;

const adSchema = z.object({
  name: z.string().trim().min(1).max(200),
  media: z.object({ kind: z.enum(["image", "video"]), path: z.string().min(3).max(300) }),
  // Hasta 5 textos principales y 5 títulos: Meta prueba las combinaciones y muestra la que mejor rinde a cada persona
  messages: z.array(z.string().trim().max(5000)).transform((x) => x.filter(Boolean)).pipe(z.array(z.string()).min(1).max(5)),
  headlines: z.array(z.string().trim().max(5000)).default([]).transform((x) => x.filter(Boolean)).pipe(z.array(z.string()).max(5)),
  description: z.string().trim().max(255).default(""),
  cta: z.enum(Object.keys(CTAS) as [keyof typeof CTAS, ...(keyof typeof CTAS)[]]),
});

export const publishSchema = z.object({
  campaign: z.object({
    name: z.string().trim().min(1).max(200),
    specialCategory: z.enum(["EMPLOYMENT", "FINANCIAL_PRODUCTS_SERVICES", "NONE"]),
  }),
  adset: z.object({
    name: z.string().trim().min(1).max(200),
    dailyBudget: z.number().min(1).max(10_000),
    startTime: z.string().optional(),            // ISO; vacío = ya
    endTime: z.string().optional(),
    regions: z.array(z.string().regex(/^\d+$/)).max(60).default([]), // vacío = todo EE. UU.
    locales: z.array(z.number().int()).max(10).default([]),
    ageMin: z.number().int().min(18).max(65).optional(),
    ageMax: z.number().int().min(18).max(65).optional(),
    facebook: z.boolean().default(true),
    instagram: z.boolean().default(true),
    pageId: z.string().regex(/^\d+$/),
    instagramId: z.string().regex(/^\d+$/).optional(),
    formId: z.string().regex(/^\d+$/),
  }),
  ads: z.array(adSchema).min(1).max(10),
});
export type PublishInput = z.infer<typeof publishSchema>;

export type PublishResult = { campaignId: string; adsetId: string; adIds: string[]; managerUrl: string };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Sube una imagen del bucket a la cuenta publicitaria y devuelve su hash. */
async function uploadImage(path: string): Promise<string> {
  const { data, error } = await supabaseAdmin().storage.from(CREATIVES_BUCKET).download(path);
  if (error || !data) throw new Error(`no se pudo leer la imagen ${path}: ${error?.message}`);
  const bytes = Buffer.from(await data.arrayBuffer()).toString("base64");
  const res = await metaPost<{ images: Record<string, { hash: string }> }>(`act_${metaAccountId()}/adimages`, { bytes }, "adimages");
  const first = Object.values(res.images)[0];
  if (!first?.hash) throw new Error("Meta no devolvió el hash de la imagen");
  return first.hash;
}

/** Sube un video (Meta lo descarga de una URL firmada del bucket) y espera a que esté listo. */
async function uploadVideo(path: string, name: string, deadline: number): Promise<{ videoId: string; thumbnail: string }> {
  const { data, error } = await supabaseAdmin().storage.from(CREATIVES_BUCKET).createSignedUrl(path, 3600);
  if (error || !data) throw new Error(`no se pudo firmar el video ${path}: ${error?.message}`);
  const { id } = await metaPost<{ id: string }>(`act_${metaAccountId()}/advideos`, { file_url: data.signedUrl, name }, "advideos");
  while (Date.now() < deadline) {
    const v = await metaGet<{ status?: { video_status?: string } }>(id, { fields: "status" }, "video status");
    const status = v.status?.video_status;
    if (status === "ready") break;
    if (status === "error") throw new Error("Meta no pudo procesar el video (formato o tamaño no válido)");
    await sleep(5000);
  }
  const thumbs = await metaGet<{ data: { uri: string; is_preferred?: boolean }[] }>(`${id}/thumbnails`, {}, "video thumbnails");
  const thumb = thumbs.data.find((t) => t.is_preferred) ?? thumbs.data[0];
  if (!thumb) throw new Error("el video todavía se está procesando en Meta; vuelve a intentar en unos minutos");
  return { videoId: id, thumbnail: thumb.uri };
}

export async function publishCampaign(input: PublishInput, deadline: number): Promise<PublishResult> {
  const acct = `act_${metaAccountId()}`;
  const special = input.campaign.specialCategory === "NONE" ? [] : [input.campaign.specialCategory];
  let campaignId: string | null = null;
  try {
    // 1. Campaña (en pausa; presupuesto en el conjunto)
    ({ id: campaignId } = await metaPost<{ id: string }>(`${acct}/campaigns`, {
      name: input.campaign.name,
      objective: "OUTCOME_LEADS",
      status: "PAUSED",
      buying_type: "AUCTION",
      special_ad_categories: special,
      special_ad_category_country: special.length ? ["US"] : undefined,
      is_adset_budget_sharing_enabled: false,
    }, "campaigns"));

    // 2. Conjunto de anuncios (formulario instantáneo de la página)
    const a = input.adset;
    const platforms = [a.facebook && "facebook", a.instagram && a.instagramId && "instagram"].filter(Boolean) as string[];
    const targeting: Record<string, unknown> = {
      geo_locations: a.regions.length ? { regions: a.regions.map((key) => ({ key })) } : { countries: ["US"] },
      publisher_platforms: platforms.length ? platforms : ["facebook"],
      targeting_automation: { advantage_audience: 0 },
    };
    if (a.locales.length) targeting.locales = a.locales;
    // Con categoría especial Meta no permite edad ni género: solo se mandan si no hay categoría
    if (!special.length) {
      if (a.ageMin) targeting.age_min = a.ageMin;
      if (a.ageMax) targeting.age_max = a.ageMax;
    }
    const { id: adsetId } = await metaPost<{ id: string }>(`${acct}/adsets`, {
      name: a.name,
      campaign_id: campaignId,
      status: "PAUSED",
      daily_budget: Math.round(a.dailyBudget * 100),
      billing_event: "IMPRESSIONS",
      optimization_goal: "LEAD_GENERATION",
      bid_strategy: "LOWEST_COST_WITHOUT_CAP",
      destination_type: "ON_AD",
      promoted_object: { page_id: a.pageId },
      targeting,
      start_time: a.startTime || undefined,
      end_time: a.endTime || undefined,
    }, "adsets");

    // 3. Creativos y anuncios
    const adIds: string[] = [];
    for (const ad of input.ads) {
      const cta = { type: ad.cta, value: { lead_gen_form_id: a.formId } };
      const actor = { page_id: a.pageId, ...(a.instagram && a.instagramId ? { instagram_user_id: a.instagramId } : {}) };
      let objectStorySpec: Record<string, unknown>;
      if (ad.media.kind === "image") {
        const hash = await uploadImage(ad.media.path);
        objectStorySpec = {
          ...actor,
          link_data: {
            image_hash: hash, message: ad.messages[0], link: "https://fb.me/",
            ...(ad.headlines[0] ? { name: ad.headlines[0] } : {}), ...(ad.description ? { description: ad.description } : {}),
            call_to_action: cta,
          },
        };
      } else {
        const { videoId, thumbnail } = await uploadVideo(ad.media.path, ad.name, deadline - 60_000);
        objectStorySpec = {
          ...actor,
          video_data: {
            video_id: videoId, image_url: thumbnail, message: ad.messages[0],
            ...(ad.headlines[0] ? { title: ad.headlines[0] } : {}), ...(ad.description ? { link_description: ad.description } : {}),
            call_to_action: cta,
          },
        };
      }
      // Varias opciones de texto (como "Agregar opciones de texto" en Ads Manager): el creativo lleva el primer texto
      // y asset_feed_spec con todas las variantes; DEGREES_OF_FREEDOM = no es creativo dinámico, el conjunto no cambia.
      const variants = ad.messages.length > 1 || ad.headlines.length > 1;
      const assetFeedSpec = variants ? {
        bodies: ad.messages.map((text) => ({ text })),
        ...(ad.headlines.length ? { titles: ad.headlines.map((text) => ({ text })) } : {}),
        ...(ad.description ? { descriptions: [{ text: ad.description }] } : {}),
        optimization_type: "DEGREES_OF_FREEDOM",
      } : undefined;
      const { id: creativeId } = await metaPost<{ id: string }>(`${acct}/adcreatives`, {
        name: ad.name, object_story_spec: objectStorySpec, ...(assetFeedSpec ? { asset_feed_spec: assetFeedSpec } : {}),
      }, "adcreatives");
      const { id: adId } = await metaPost<{ id: string }>(`${acct}/ads`, { name: ad.name, adset_id: adsetId, creative: { creative_id: creativeId }, status: "PAUSED" }, "ads");
      adIds.push(adId);
    }

    return {
      campaignId, adsetId, adIds,
      managerUrl: `https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=${metaAccountId()}&selected_campaign_ids=${campaignId}`,
    };
  } catch (error) {
    // No dejar campañas a medias: se borra lo creado (conjuntos y anuncios caen con la campaña)
    if (campaignId) {
      await fetchJson(graphUrl(campaignId), { method: "DELETE" }, "Meta DELETE campaign", metaRetryable)
        .catch((e) => logError("meta.publish.cleanup", e, { campaignId }));
    }
    throw error;
  }
}

/** Borra del bucket los archivos ya subidos a Meta. */
export async function removeCreatives(paths: string[]): Promise<void> {
  if (!paths.length) return;
  const { error } = await supabaseAdmin().storage.from(CREATIVES_BUCKET).remove(paths);
  if (error) logError("meta.publish.removeCreatives", error, { count: paths.length });
}

// ---------------------------------------------------------------------------------------------
// Formularios instantáneos (leadgen_forms de la página). Se crean con el token de la página: el token
// del usuario del sistema necesita pages_manage_ads (y la página asignada con control total).
// ---------------------------------------------------------------------------------------------

export const STANDARD_FIELDS = {
  FULL_NAME: "Nombre completo",
  PHONE: "Teléfono",
  EMAIL: "Email",
  STATE: "Estado",
  CITY: "Ciudad",
  ZIP: "Código postal",
} as const;

// Sin límites propios de largo en los textos (a pedido): Meta aplica los suyos; 5000 es solo un tope de seguridad.
export const leadFormSchema = z.object({
  pageId: z.string().regex(/^\d+$/),
  name: z.string().trim().min(1).max(5000),
  locale: z.enum(["ES_LA", "ES_ES", "EN_US"]).default("ES_LA"),
  highIntent: z.boolean().default(false),
  intro: z.object({ headline: z.string().trim().max(5000).default(""), description: z.string().trim().max(5000).default("") }),
  standard: z.array(z.enum(Object.keys(STANDARD_FIELDS) as [keyof typeof STANDARD_FIELDS, ...(keyof typeof STANDARD_FIELDS)[]])).min(1),
  custom: z.array(z.object({
    label: z.string().trim().min(1).max(5000),
    options: z.array(z.string().trim().min(1).max(5000)).max(20).default([]), // vacío = respuesta corta
  })).max(10).default([]),
  privacyUrl: z.url(),
  privacyText: z.string().trim().max(5000).default("Política de privacidad"),
  thankYou: z.object({
    title: z.string().trim().min(1).max(5000),
    body: z.string().trim().max(5000).default(""),
    buttonText: z.string().trim().min(1).max(5000),
    websiteUrl: z.url(),
  }),
});
export type LeadFormInput = z.infer<typeof leadFormSchema>;

async function pageAccessToken(pageId: string): Promise<string> {
  const info = await metaGet<{ access_token?: string }>(pageId, { fields: "access_token" }, "page token");
  if (!info.access_token) throw new Error("La página no está asignada al usuario del sistema de Meta (sin token de página).");
  return info.access_token;
}

export async function createLeadForm(f: LeadFormInput): Promise<{ id: string; name: string }> {
  const token = await pageAccessToken(f.pageId);
  const questions: Record<string, unknown>[] = f.standard.map((type) => ({ type }));
  f.custom.forEach((q, i) => {
    questions.push({
      type: "CUSTOM",
      key: `pregunta_${i + 1}`,
      label: q.label,
      ...(q.options.length ? { options: q.options.map((value, j) => ({ value, key: `p${i + 1}_op${j + 1}` })) } : {}),
    });
  });
  const params: Record<string, unknown> = {
    name: f.name,
    locale: f.locale,
    questions,
    privacy_policy: { url: f.privacyUrl, link_text: f.privacyText },
    thank_you_page: {
      title: f.thankYou.title,
      body: f.thankYou.body || undefined,
      button_type: "VIEW_WEBSITE",
      button_text: f.thankYou.buttonText,
      website_url: f.thankYou.websiteUrl,
    },
    is_optimized_for_quality: f.highIntent,
  };
  if (f.intro.headline || f.intro.description) {
    params.context_card = { title: f.intro.headline || f.name, style: "PARAGRAPH_STYLE", content: [f.intro.description || f.intro.headline] };
  }
  const body = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined) body.set(k, typeof v === "string" ? v : JSON.stringify(v));
  body.set("access_token", token);
  const version = process.env.META_API_VERSION ?? "v23.0";
  const res = await fetchJson<{ id: string }>(`https://graph.facebook.com/${version}/${f.pageId}/leadgen_forms`, {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body,
  }, "Meta POST leadgen_forms", () => false);
  return { id: res.id, name: f.name };
}
