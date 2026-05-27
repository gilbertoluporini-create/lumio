"use client";

import { use, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  ChevronRight,
  Clock,
  CreditCard,
  FileText,
  Mail,
  Mic,
  Rocket,
  Wrench,
} from "lucide-react";
import { AuthGuard } from "@/components/app/auth-guard";
import { AppShell } from "@/components/app/app-shell";
import { Button } from "@/components/ui/button";
import {
  findArticle,
  renderHelpMarkdown,
  type HelpArticle,
  type HelpCategory,
  type HelpCategoryIcon,
} from "@/lib/help-articles";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";
import type { User } from "@/lib/types";

const SUPPORT_EMAIL = "contato@lumioapp.net";

const CATEGORY_ICON_MAP: Record<HelpCategoryIcon, typeof Rocket> = {
  rocket: Rocket,
  mic: Mic,
  file: FileText,
  card: CreditCard,
  tool: Wrench,
};

export default function HelpArticlePage({
  params,
}: {
  params: Promise<{ category: string; article: string }>;
}) {
  const { category: categorySlug, article: articleSlug } = use(params);
  const found = findArticle(categorySlug, articleSlug);
  if (!found) notFound();

  return (
    <AuthGuard>
      {(user) => (
        <AppShell user={user}>
          <HelpArticleView
            user={user}
            category={found.category}
            article={found.article}
          />
        </AppShell>
      )}
    </AuthGuard>
  );
}

function HelpArticleView({
  user: _user,
  category,
  article,
}: {
  user: User;
  category: HelpCategory;
  article: HelpArticle;
}) {
  const Icon = CATEGORY_ICON_MAP[category.icon];

  const html = useMemo(() => renderHelpMarkdown(article.body), [article.body]);

  const related = category.articles
    .filter((a) => a.slug !== article.slug)
    .slice(0, 3);

  // Capa gerada via OpenAI (admin endpoint). RLS read pública → anon client OK.
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!isSupabaseConfigured()) return;
    let cancel = false;
    (async () => {
      try {
        const supabase = createClient();
        const { data } = await supabase
          .from("help_article_covers")
          .select("image_url")
          .eq("slug", article.slug)
          .maybeSingle();
        if (!cancel && data?.image_url) setCoverUrl(data.image_url as string);
      } catch {
        /* sem capa — segue sem renderizar */
      }
    })();
    return () => {
      cancel = true;
    };
  }, [article.slug]);

  return (
    <div className="mx-auto w-full max-w-3xl px-5 py-8">
      {/* Breadcrumb */}
      <nav
        className="flex items-center gap-1 text-xs text-muted-foreground"
        aria-label="breadcrumb"
      >
        <Link href="/help" className="hover:text-foreground transition-colors">
          Ajuda
        </Link>
        <ChevronRight className="h-3 w-3" aria-hidden="true" />
        <Link
          href={`/help/${category.slug}`}
          className="hover:text-foreground transition-colors"
        >
          {category.title}
        </Link>
        <ChevronRight className="h-3 w-3" aria-hidden="true" />
        <span className="text-foreground line-clamp-1">{article.title}</span>
      </nav>

      {/* Header */}
      <header className="mt-4">
        <div className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-background/60 backdrop-blur px-3 py-1 text-xs text-muted-foreground">
          <Icon className="h-3 w-3 text-primary" aria-hidden="true" />
          {category.title}
        </div>
        <h1 className="mt-3 text-3xl md:text-4xl heading-display">
          {article.title}
        </h1>
        <p className="mt-2 text-base text-muted-foreground">
          {article.excerpt}
        </p>
        <div className="mt-3 flex items-center gap-3 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <Clock className="h-3 w-3" aria-hidden="true" />
            {article.readTimeMin} min de leitura
          </span>
        </div>
      </header>

      {/* Capa (se houver) */}
      {coverUrl && (
        <div className="mt-6 overflow-hidden rounded-2xl border border-border/60 bg-card">
          <div className="relative aspect-[3/2] w-full">
            <Image
              src={coverUrl}
              alt={article.title}
              fill
              priority
              sizes="(max-width: 768px) 100vw, 768px"
              className="object-cover"
            />
          </div>
        </div>
      )}

      {/* Body */}
      <article
        className="mt-8 rounded-2xl border border-border/60 bg-card p-6 md:p-8"
        dangerouslySetInnerHTML={{ __html: html }}
      />

      {/* CTA: ainda precisa de ajuda */}
      <div className="mt-8 flex flex-col items-start gap-3 rounded-2xl border border-border/60 bg-gradient-to-br from-primary/8 via-card to-fuchsia-500/5 p-5 md:flex-row md:items-center md:justify-between">
        <div>
          <h3 className="text-sm font-semibold tracking-tight">
            Esse artigo ajudou?
          </h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Se ainda ficou alguma dúvida, fale com a gente — respondemos
            rápido.
          </p>
        </div>
        <Button asChild variant="gradient" size="sm">
          <a
            href={`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(
              `Dúvida sobre: ${article.title}`,
            )}`}
          >
            <Mail className="h-4 w-4" />
            Falar com o suporte
          </a>
        </Button>
      </div>

      {/* Related */}
      {related.length > 0 && (
        <section className="mt-10">
          <h2 className="text-base font-semibold tracking-tight">
            Continue lendo em {category.title}
          </h2>
          <ul className="mt-3 divide-y divide-border/60 rounded-2xl border border-border/60 bg-card">
            {related.map((r) => (
              <li key={r.slug}>
                <Link
                  href={`/help/${category.slug}/${r.slug}`}
                  className="group flex items-center justify-between gap-4 p-4 transition-colors hover:bg-accent/40"
                >
                  <div className="min-w-0">
                    <h3 className="text-sm font-semibold tracking-tight group-hover:text-primary">
                      {r.title}
                    </h3>
                    <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
                      {r.excerpt}
                    </p>
                  </div>
                  <ChevronRight
                    className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary"
                    aria-hidden="true"
                  />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Back link */}
      <Link
        href={`/help/${category.slug}`}
        className="mt-8 inline-flex items-center gap-1 text-sm text-primary hover:underline"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Voltar para {category.title}
      </Link>
    </div>
  );
}
