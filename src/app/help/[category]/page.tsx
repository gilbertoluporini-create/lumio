"use client";

import { use, useMemo, useState } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  ChevronRight,
  Clock,
  CreditCard,
  FileText,
  Mic,
  Rocket,
  Search,
  Wrench,
} from "lucide-react";
import { AuthGuard } from "@/components/app/auth-guard";
import { AppShell } from "@/components/app/app-shell";
import {
  findCategory,
  type HelpCategory,
  type HelpCategoryIcon,
} from "@/lib/help-articles";
import type { User } from "@/lib/types";

const CATEGORY_ICON_MAP: Record<HelpCategoryIcon, typeof Rocket> = {
  rocket: Rocket,
  mic: Mic,
  file: FileText,
  card: CreditCard,
  tool: Wrench,
};

export default function HelpCategoryPage({
  params,
}: {
  params: Promise<{ category: string }>;
}) {
  const { category: categorySlug } = use(params);
  const category = findCategory(categorySlug);
  if (!category) notFound();

  return (
    <AuthGuard>
      {(user) => (
        <AppShell user={user}>
          <HelpCategoryView user={user} category={category} />
        </AppShell>
      )}
    </AuthGuard>
  );
}

function HelpCategoryView({
  user: _user,
  category,
}: {
  user: User;
  category: HelpCategory;
}) {
  const [query, setQuery] = useState("");
  const Icon = CATEGORY_ICON_MAP[category.icon];

  const filteredArticles = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return category.articles;
    return category.articles.filter((article) => {
      const haystack = [article.title, article.excerpt, article.body]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [category.articles, query]);

  return (
    <div className="mx-auto w-full max-w-5xl px-5 py-8">
      {/* Breadcrumb */}
      <nav
        className="flex items-center gap-1 text-xs text-muted-foreground"
        aria-label="breadcrumb"
      >
        <Link href="/help" className="hover:text-foreground transition-colors">
          Ajuda
        </Link>
        <ChevronRight className="h-3 w-3" aria-hidden="true" />
        <span className="text-foreground">{category.title}</span>
      </nav>

      {/* Header */}
      <div className="mt-4 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <Icon className="h-6 w-6" aria-hidden="true" />
            </div>
            <div>
              <h1 className="text-3xl heading-display">
                {category.title}
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                {category.description}
              </p>
            </div>
          </div>
        </div>
        <Link
          href="/help"
          className="hidden md:inline-flex items-center gap-1 rounded-full border border-border/60 bg-background/60 px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground hover:border-border"
        >
          <ArrowLeft className="h-3 w-3" aria-hidden="true" />
          Voltar à central
        </Link>
      </div>

      {/* Search */}
      <div className="mt-6 rounded-2xl border border-border/60 bg-card p-2 shadow-sm">
        <div className="flex items-center gap-3 rounded-xl bg-background/60 px-4 py-2.5">
          <Search
            className="h-4 w-4 shrink-0 text-muted-foreground"
            aria-hidden="true"
          />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={`Buscar em ${category.title.toLowerCase()}...`}
            className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            aria-label={`Buscar em ${category.title}`}
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Limpar
            </button>
          )}
        </div>
      </div>

      {/* Articles list */}
      <div className="mt-6">
        <h2 className="text-sm font-medium text-muted-foreground">
          {filteredArticles.length}{" "}
          {filteredArticles.length === 1 ? "artigo" : "artigos"}
        </h2>

        {filteredArticles.length === 0 ? (
          <div className="mt-4 rounded-2xl border border-dashed border-border/60 bg-card/60 p-8 text-center">
            <p className="text-sm text-muted-foreground">
              Nenhum artigo encontrado para{" "}
              <span className="font-medium text-foreground">“{query}”</span>.
            </p>
          </div>
        ) : (
          <ul className="mt-4 divide-y divide-border/60 rounded-2xl border border-border/60 bg-card">
            {filteredArticles.map((article) => (
              <li key={article.slug}>
                <Link
                  href={`/help/${category.slug}/${article.slug}`}
                  className="group flex items-center justify-between gap-4 p-5 transition-colors hover:bg-accent/40"
                >
                  <div className="min-w-0">
                    <h3 className="text-base font-semibold tracking-tight group-hover:text-primary">
                      {article.title}
                    </h3>
                    <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                      {article.excerpt}
                    </p>
                    <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        <Clock className="h-3 w-3" aria-hidden="true" />
                        {article.readTimeMin} min de leitura
                      </span>
                    </div>
                  </div>
                  <ChevronRight
                    className="h-5 w-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary"
                    aria-hidden="true"
                  />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Back link mobile */}
      <Link
        href="/help"
        className="mt-6 inline-flex items-center gap-1 text-sm text-primary hover:underline md:hidden"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Voltar à central
      </Link>
    </div>
  );
}
