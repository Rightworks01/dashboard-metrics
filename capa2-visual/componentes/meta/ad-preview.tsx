"use client";

import { useState } from "react";
import { Avatar, Icon } from "@visual/componentes/meta/meta-ui";

// Vista previa del anuncio con el aspecto de Facebook / Instagram (como la columna derecha de Ads Manager).
// Solo dibuja: recibe textos, imagen y nombres por props. Las combinaciones de textos y títulos son las que
// Meta rota cuando hay varias opciones de texto.

export type AdPreviewProps = {
  pageName: string;
  pageAvatar?: string | null;
  instagramUsername?: string | null;
  instagramAvatar?: string | null;
  messages: string[];
  headlines: string[];
  description: string;
  ctaLabel: string;
  media: { kind: "image" | "video"; src: string } | null;
  facebook: boolean;
  instagram: boolean;
};

type Placement = "fb_feed" | "ig_feed" | "stories";
const PLACEMENTS: { value: Placement; label: string; needs: "facebook" | "instagram" | null }[] = [
  { value: "fb_feed", label: "Feed de Facebook", needs: "facebook" },
  { value: "ig_feed", label: "Feed de Instagram", needs: "instagram" },
  { value: "stories", label: "Historias y Reels", needs: null },
];
const SHOWN = 125; // caracteres antes de "Ver más" en el feed

export function AdPreview(p: AdPreviewProps) {
  const available = PLACEMENTS.filter((x) => x.needs === null || p[x.needs]);
  const [placement, setPlacement] = useState<Placement>(available[0]?.value ?? "fb_feed");
  const [combo, setCombo] = useState(0);
  const [expanded, setExpanded] = useState(false);

  const messages = p.messages.map((m) => m.trim()).filter(Boolean);
  const headlines = p.headlines.map((h) => h.trim()).filter(Boolean);
  const msgs = messages.length ? messages : [""];
  const hls = headlines.length ? headlines : [""];
  const total = msgs.length * hls.length;
  const i = combo % total;
  const message = msgs[Math.floor(i / hls.length)];
  const headline = hls[i % hls.length];
  const current = available.some((x) => x.value === placement) ? placement : available[0]?.value ?? "fb_feed";
  const igName = p.instagramUsername ?? p.pageName;
  const igAvatar = p.instagramUsername ? p.instagramAvatar : p.pageAvatar;
  const move = (d: number) => { setCombo((c) => (c + d + total) % total); setExpanded(false); };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-ink">Vista previa del anuncio</h3>
        <select aria-label="Ubicación de la vista previa" value={current} onChange={(e) => setPlacement(e.target.value as Placement)}
          className="rounded-md border border-line bg-surface px-2 py-1 text-xs text-ink focus:border-accent focus:outline-none">
          {available.map((x) => <option key={x.value} value={x.value}>{x.label}</option>)}
        </select>
      </div>

      {total > 1 && (
        <div className="flex items-center justify-between rounded-lg bg-surface-2 px-2 py-1 text-xs text-ink-2">
          <button type="button" onClick={() => move(-1)} className="rounded px-2 py-0.5 hover:bg-surface" aria-label="Combinación anterior">‹</button>
          <span>Opción de texto {i + 1} de {total}</span>
          <button type="button" onClick={() => move(1)} className="rounded px-2 py-0.5 hover:bg-surface" aria-label="Combinación siguiente">›</button>
        </div>
      )}

      <div className="mx-auto w-full max-w-[22rem] overflow-hidden rounded-xl border border-line bg-surface text-ink shadow-[var(--shadow)]">
        {current === "fb_feed" && (
          <FacebookFeed {...p} message={message} headline={headline} expanded={expanded} onExpand={() => setExpanded(true)} />
        )}
        {current === "ig_feed" && (
          <InstagramFeed media={p.media} name={igName} avatar={igAvatar} message={message} ctaLabel={p.ctaLabel} expanded={expanded} onExpand={() => setExpanded(true)} />
        )}
        {current === "stories" && <Stories media={p.media} name={p.pageName} avatar={p.pageAvatar} ctaLabel={p.ctaLabel} message={message} />}
      </div>
      {current === "ig_feed" && !p.instagramUsername && (
        <p className="text-center text-xs text-ink-3">Sin cuenta de Instagram vinculada: Meta usa el nombre de la página.</p>
      )}
      <p className="text-center text-xs text-ink-3">Aproximada: Meta puede ajustar el recorte y el texto según el dispositivo.</p>
    </div>
  );
}

function Media({ media, aspect = "aspect-square" }: { media: AdPreviewProps["media"]; aspect?: string }) {
  if (!media) {
    return (
      <div className={`${aspect} flex w-full flex-col items-center justify-center gap-1 bg-surface-2 text-xs text-ink-3`}>
        <Icon name="image" className="size-8" />Tu imagen o video
      </div>
    );
  }
  return media.kind === "image"
    ? <img src={media.src} alt="" className={`${aspect} w-full object-cover`} />
    : <video src={media.src} className={`${aspect} w-full object-cover`} muted loop autoPlay playsInline />;
}

function Message({ text, expanded, onExpand, prefix }: { text: string; expanded: boolean; onExpand: () => void; prefix?: React.ReactNode }) {
  const long = text.length > SHOWN;
  const shown = long && !expanded ? `${text.slice(0, SHOWN).trimEnd()}…` : text;
  return (
    <p className="whitespace-pre-line text-[0.9rem] leading-snug">
      {prefix}
      {shown || <span className="text-ink-3">Tu texto principal</span>}
      {long && !expanded && <> <button type="button" onClick={onExpand} className="font-semibold text-ink-3 hover:underline">Ver más</button></>}
    </p>
  );
}

function FacebookFeed(p: AdPreviewProps & { message: string; headline: string; expanded: boolean; onExpand: () => void }) {
  return (
    <div>
      <div className="flex items-start gap-2 px-3 pt-3">
        <Avatar src={p.pageAvatar} name={p.pageName} className="size-10" />
        <div className="min-w-0 flex-1 leading-tight">
          <p className="truncate text-sm font-semibold">{p.pageName}</p>
          <p className="flex items-center gap-1 text-xs text-ink-3">Publicidad · <Icon name="globe" className="size-3" /></p>
        </div>
        <span className="text-ink-2"><Icon name="dots" className="size-5" /></span>
        <span className="text-ink-2"><Icon name="close" className="size-5" /></span>
      </div>
      <div className="px-3 py-2"><Message text={p.message} expanded={p.expanded} onExpand={p.onExpand} /></div>
      <Media media={p.media} />
      <div className="flex items-center gap-3 bg-surface-2 px-3 py-2.5">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[0.7rem] uppercase tracking-wide text-ink-3">Formulario en Facebook</p>
          <p className="truncate text-[0.95rem] font-semibold leading-tight">{p.headline || <span className="text-ink-3">Tu título</span>}</p>
          {p.description.trim() && <p className="truncate text-xs text-ink-3">{p.description}</p>}
        </div>
        <span className="shrink-0 rounded-md border border-line bg-surface px-3 py-1.5 text-sm font-semibold">{p.ctaLabel}</span>
      </div>
      <div className="mx-3 flex justify-around border-t border-line py-1.5 text-sm font-medium text-ink-2">
        <span className="flex items-center gap-1.5"><Icon name="like" className="size-4" />Me gusta</span>
        <span className="flex items-center gap-1.5"><Icon name="comment" className="size-4" />Comentar</span>
        <span className="flex items-center gap-1.5"><Icon name="share" className="size-4" />Compartir</span>
      </div>
    </div>
  );
}

function InstagramFeed({ media, name, avatar, message, ctaLabel, expanded, onExpand }: {
  media: AdPreviewProps["media"]; name: string; avatar?: string | null; message: string; ctaLabel: string; expanded: boolean; onExpand: () => void;
}) {
  return (
    <div>
      <div className="flex items-center gap-2 px-3 py-2">
        <Avatar src={avatar} name={name} className="size-8" ring />
        <div className="min-w-0 flex-1 leading-tight">
          <p className="truncate text-sm font-semibold">{name}</p>
          <p className="text-xs text-ink-3">Publicidad</p>
        </div>
        <Icon name="dots" className="size-5 text-ink-2" />
      </div>
      <Media media={media} />
      <div className="flex items-center justify-between bg-accent px-3 py-2 text-sm font-semibold text-white">
        <span>{ctaLabel}</span><span aria-hidden>›</span>
      </div>
      <div className="flex items-center gap-3 px-3 pt-2.5 text-ink">
        <Icon name="heart" className="size-6" /><Icon name="comment" className="size-6" /><Icon name="send" className="size-6" />
        <Icon name="bookmark" className="ml-auto size-6" />
      </div>
      <div className="px-3 pb-3 pt-1.5">
        <Message text={message} expanded={expanded} onExpand={onExpand} prefix={<span className="mr-1 font-semibold">{name}</span>} />
      </div>
    </div>
  );
}

function Stories({ media, name, avatar, ctaLabel, message }: { media: AdPreviewProps["media"]; name: string; avatar?: string | null; ctaLabel: string; message: string }) {
  return (
    <div className="relative aspect-[9/16] w-full bg-stage text-on-stage">
      <div className="absolute inset-0 flex items-center"><Media media={media} aspect="aspect-auto max-h-full" /></div>
      <div className="absolute inset-x-0 top-0 space-y-2 bg-gradient-to-b from-stage/70 to-transparent p-3">
        <div className="h-0.5 rounded bg-on-stage/40"><div className="h-full w-1/3 rounded bg-on-stage" /></div>
        <div className="flex items-center gap-2">
          <Avatar src={avatar} name={name} className="size-8" />
          <div className="leading-tight"><p className="text-sm font-semibold">{name}</p><p className="text-xs opacity-80">Publicidad</p></div>
        </div>
      </div>
      <div className="absolute inset-x-0 bottom-0 space-y-3 bg-gradient-to-t from-stage/80 to-transparent p-4 text-center">
        {message && <p className="line-clamp-3 text-sm">{message}</p>}
        <span className="inline-flex flex-col items-center text-sm font-semibold">
          <span aria-hidden>︿</span>
          <span className="rounded-full bg-on-stage px-4 py-1.5 text-stage">{ctaLabel}</span>
        </span>
      </div>
    </div>
  );
}
