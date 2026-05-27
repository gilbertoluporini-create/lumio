"use client";

import { useEffect } from "react";
import {
  BookOpen,
  ChevronRight,
  Compass,
  Gift,
  LifeBuoy,
  Rocket,
  Sparkles,
  Tag,
  type LucideIcon,
} from "lucide-react";
import { trackEvent } from "@/lib/analytics";
import { appendUtm, type LinksChannel } from "./utm";
import {
  InstagramIcon,
  LinkedInIcon,
  TikTokIcon,
  XTwitterIcon,
} from "./social-icons";

type CardDef = {
  id: string;
  title: string;
  href: string; // raw, sem UTM — appendUtm aplica no click
  icon: LucideIcon;
  primary?: boolean;
  external?: boolean; // mailto/links externos não levam UTM
};

const CARDS: CardDef[] = [
  {
    id: "signup",
    title: "Começar grátis",
    href: "/signup?ref=bio",
    icon: Rocket,
    primary: true,
  },
  {
    id: "how_it_works",
    title: "Ver como funciona",
    href: "/",
    icon: Compass,
  },
  {
    id: "pricing",
    title: "Planos",
    href: "/pricing",
    icon: Tag,
  },
  {
    id: "lead_magnet",
    title: "Guia grátis: como revisar pra prova",
    href: "/guia-revisao",
    icon: Sparkles,
  },
  {
    id: "blog",
    title: "Blog",
    href: "/blog",
    icon: BookOpen,
  },
  {
    id: "embaixador",
    title: "Vire embaixador (Pro grátis)",
    href: "/account/embaixador",
    icon: Gift,
  },
  {
    id: "support",
    title: "Suporte",
    href: "mailto:contato@lumioapp.net",
    icon: LifeBuoy,
    external: true,
  },
];

// Placeholders — substituir quando criar perfis oficiais.
const SOCIALS: Array<{
  id: string;
  label: string;
  href: string;
  Icon: (props: { className?: string; size?: number }) => React.ReactElement;
}> = [
  {
    id: "instagram",
    label: "Instagram",
    href: "https://www.instagram.com/lumioapp.br/",
    Icon: InstagramIcon,
  },
  {
    id: "tiktok",
    label: "TikTok",
    href: "https://www.tiktok.com/@lumioapp",
    Icon: TikTokIcon,
  },
  {
    id: "linkedin",
    label: "LinkedIn",
    href: "https://www.linkedin.com/company/lumioapp-br/",
    Icon: LinkedInIcon,
  },
  {
    id: "twitter",
    label: "X / Twitter",
    href: "https://x.com/lumioapp_br",
    Icon: XTwitterIcon,
  },
];

export function LinksCards({ channel }: { channel: LinksChannel }) {
  // Page view: dispara uma vez por mount.
  useEffect(() => {
    trackEvent("links_page_view", { channel });
  }, [channel]);

  function handleClick(card: CardDef, finalUrl: string) {
    trackEvent("links_card_click", {
      card_id: card.id,
      target_url: finalUrl,
      channel,
    });
  }

  function handleSocialClick(socialId: string, href: string) {
    trackEvent("links_social_click", {
      social: socialId,
      target_url: href,
      channel,
    });
  }

  return (
    <>
      <ul className="flex w-full flex-col gap-2">
        {CARDS.map((card) => {
          const finalUrl = card.external
            ? card.href
            : appendUtm(card.href, channel);
          const Icon = card.icon;
          const isPrimary = card.primary === true;

          const baseClasses =
            "group flex w-full items-center gap-3 rounded-2xl px-4 py-4 text-left text-[15px] font-medium transition-all duration-200 active:scale-[0.985]";
          const skin = isPrimary
            ? "bg-primary text-primary-foreground shadow-lumio hover:shadow-lumio-lg"
            : "bg-card text-foreground border border-border/70 hover:border-primary/40 hover:bg-accent/40 shadow-lumio-sm";

          return (
            <li key={card.id}>
              <a
                href={finalUrl}
                onClick={() => handleClick(card, finalUrl)}
                className={`${baseClasses} ${skin}`}
                aria-label={card.title}
              >
                <span
                  className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
                    isPrimary
                      ? "bg-white/15 text-primary-foreground"
                      : "bg-accent/60 text-primary"
                  }`}
                  aria-hidden="true"
                >
                  <Icon className="h-4 w-4" />
                </span>
                <span className="flex-1 leading-snug">{card.title}</span>
                <ChevronRight
                  className={`h-4 w-4 shrink-0 transition-transform duration-200 group-hover:translate-x-0.5 ${
                    isPrimary ? "text-primary-foreground/80" : "text-muted-foreground"
                  }`}
                  aria-hidden="true"
                />
              </a>
            </li>
          );
        })}
      </ul>

      <div className="mt-8 flex items-center justify-center gap-2">
        {SOCIALS.map(({ id, label, href, Icon }) => (
          <a
            key={id}
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => handleSocialClick(id, href)}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-border/60 bg-card/70 text-muted-foreground transition-all hover:border-primary/40 hover:text-primary hover:bg-accent/40"
            aria-label={label}
          >
            <Icon size={16} />
          </a>
        ))}
      </div>

      {/* sr-only: dá contexto pra leitor de tela sem poluir visual */}
      <p className="sr-only">
        Página de links oficiais do Lumio. Origem do tráfego: {channel}.
      </p>

      <a
        href={appendUtm("/", channel)}
        onClick={() =>
          trackEvent("links_card_click", {
            card_id: "wordmark_footer",
            target_url: appendUtm("/", channel),
            channel,
          })
        }
        className="mt-6 block text-center text-[10px] font-semibold tracking-[0.22em] text-muted-foreground/70 hover:text-primary transition-colors"
      >
        LUMIOAPP.NET
      </a>
    </>
  );
}
