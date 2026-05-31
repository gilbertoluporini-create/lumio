/**
 * SEO helpers — Open Graph + Twitter + canonical URLs.
 *
 * Padrão: toda página chama `buildPageMetadata({ ... })` ou `ogImage({ ... })`
 * pra montar a metadata sem repetir boilerplate em cada arquivo.
 */
import type { Metadata } from "next";

export const SITE_URL =
  process.env.NEXT_PUBLIC_APP_URL ?? "https://www.lumioapp.net";

export const SITE_NAME = "Lumio";

/**
 * Monta a URL absoluta de `/api/og?...` com params encodados.
 * Usar SEMPRE absoluto (WhatsApp/X exigem URL completa pra preview).
 */
export function ogImage(params: {
  title: string;
  subtitle?: string;
  type?: "default" | "blog" | "landing" | "persona";
  persona?: string;
}): string {
  const qs = new URLSearchParams();
  qs.set("title", params.title);
  if (params.subtitle) qs.set("subtitle", params.subtitle);
  if (params.type) qs.set("type", params.type);
  if (params.persona) qs.set("persona", params.persona);
  return `${SITE_URL}/api/og?${qs.toString()}`;
}

export type PageMetaInput = {
  /** Title da aba — formato "X · Lumio" recomendado (máx 60 chars) */
  title: string;
  /** Meta description (140-160 chars ideal) */
  description: string;
  /** Path absoluto a partir da raiz, ex. "/blog/foo" — vira canonical */
  path: string;
  /** Override do título OG/Twitter (default: usa `title`) */
  ogTitle?: string;
  /** Override da descrição OG/Twitter (default: usa `description`) */
  ogDescription?: string;
  /** Tipo OG: website (default) | article */
  ogType?: "website" | "article";
  /** ISO date — required quando ogType=article */
  publishedTime?: string;
  /** Lista de tags pra ogType=article */
  tags?: string[];
  /** Override completo da imagem OG (default: usa /api/og dinâmico) */
  ogImageUrl?: string;
  /** Tipo de layout do OG dinâmico (default: "default") */
  ogImageType?: "default" | "blog" | "landing" | "persona";
  ogImagePersona?: string;
  /** Robots meta — default index,follow */
  noindex?: boolean;
};

/**
 * Builder único pra metadata de página.
 * Garante OG + Twitter + canonical + robots consistentes.
 */
export function buildPageMetadata(input: PageMetaInput): Metadata {
  const {
    title,
    description,
    path,
    ogTitle = title,
    ogDescription = description,
    ogType = "website",
    publishedTime,
    tags,
    ogImageUrl,
    ogImageType = "default",
    ogImagePersona,
    noindex = false,
  } = input;

  const canonical = path.startsWith("http") ? path : `${SITE_URL}${path}`;

  const image =
    ogImageUrl ??
    ogImage({
      title: ogTitle,
      subtitle: ogDescription,
      type: ogImageType,
      persona: ogImagePersona,
    });

  const imageAlt = `${title} — Lumio`;

  const robots = noindex
    ? { index: false, follow: false, nocache: true }
    : {
        index: true,
        follow: true,
        googleBot: {
          index: true,
          follow: true,
          "max-image-preview": "large" as const,
          "max-snippet": -1 as const,
          "max-video-preview": -1 as const,
        },
      };

  return {
    title,
    description,
    alternates: { canonical },
    robots,
    openGraph: {
      title: ogTitle,
      description: ogDescription,
      url: canonical,
      siteName: SITE_NAME,
      locale: "pt_BR",
      type: ogType,
      ...(ogType === "article" && publishedTime
        ? { publishedTime, authors: ["Equipe Lumio"], tags }
        : {}),
      images: [
        {
          url: image,
          width: 1200,
          height: 630,
          alt: imageAlt,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: ogTitle,
      description: ogDescription,
      images: [image],
    },
  };
}
