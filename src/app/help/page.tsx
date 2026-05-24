"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  Book,
  BookOpen,
  Clock,
  CreditCard,
  FileText,
  HelpCircle,
  Mail,
  MessageSquare,
  Mic,
  Plus,
  Rocket,
  Search,
  Shield,
  Sparkles,
  Wrench,
} from "lucide-react";
import { toast } from "sonner";
import { AuthGuard } from "@/components/app/auth-guard";
import { AppShell } from "@/components/app/app-shell";
import { LumiCharacter, LumiScene } from "@/components/brand/lumi";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { LumiSceneKey } from "@/components/brand/lumi";
import type { User } from "@/lib/types";

const SUPPORT_EMAIL = "contato@lumioapp.net";

type FaqCategory = {
  id: string;
  title: string;
  description: string;
  count: number;
  icon: typeof Rocket;
  keywords: string[];
};

const FAQ_CATEGORIES: FaqCategory[] = [
  {
    id: "primeiros-passos",
    title: "Primeiros passos",
    description: "Comece sua jornada no Lumio.",
    count: 8,
    icon: Rocket,
    keywords: [
      "começar",
      "comecar",
      "iniciar",
      "onboarding",
      "novo",
      "primeira",
      "tutorial",
      "início",
      "inicio",
    ],
  },
  {
    id: "gravacoes",
    title: "Gravações",
    description: "Grave, organize e revise suas aulas.",
    count: 10,
    icon: Mic,
    keywords: [
      "gravar",
      "gravação",
      "gravacao",
      "audio",
      "áudio",
      "aula",
      "transcrever",
      "transcrição",
      "microfone",
    ],
  },
  {
    id: "resumos",
    title: "Resumos",
    description: "Crie, edite e aprimore seus resumos.",
    count: 9,
    icon: FileText,
    keywords: [
      "resumo",
      "resumos",
      "ia",
      "claude",
      "flashcards",
      "quiz",
      "mapa mental",
      "editar",
    ],
  },
  {
    id: "planos",
    title: "Planos",
    description: "Recursos, limites e gerenciamento.",
    count: 6,
    icon: CreditCard,
    keywords: [
      "plano",
      "planos",
      "starter",
      "pro",
      "power",
      "assinatura",
      "pagamento",
      "preço",
      "preco",
      "cobrança",
      "cobranca",
      "fatura",
      "coins",
    ],
  },
  {
    id: "solucao-problemas",
    title: "Solução de problemas",
    description: "Resolva dúvidas e problemas comuns.",
    count: 12,
    icon: Wrench,
    keywords: [
      "problema",
      "erro",
      "bug",
      "não funciona",
      "nao funciona",
      "ajuda",
      "suporte",
      "travou",
      "lento",
    ],
  },
];

type GuideCard = {
  id: string;
  title: string;
  description: string;
  badge: string;
  readTime: string;
  scene: LumiSceneKey;
};

const GUIDES: GuideCard[] = [
  {
    id: "comece-em-minutos",
    title: "Comece em poucos minutos",
    description:
      "Um guia rápido para você criar sua primeira aula e resumo.",
    badge: "Guia rápido",
    readTime: "5 min de leitura",
    scene: "writing-notes",
  },
  {
    id: "gravar-organizar",
    title: "Como gravar e organizar aulas",
    description:
      "Aprenda a gravar, renomear e organizar suas aulas.",
    badge: "Passo a passo",
    readTime: "7 min de leitura",
    scene: "calendar",
  },
  {
    id: "resumos-ia",
    title: "Resumos com IA",
    description:
      "Descubra como a IA do Lumio transforma suas aulas em resumos de alta qualidade.",
    badge: "Tutorial",
    readTime: "6 min de leitura",
    scene: "funnel-summary",
  },
];

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return "Bom dia";
  if (hour >= 12 && hour < 18) return "Boa tarde";
  return "Boa noite";
}

function firstName(name: string | null | undefined): string {
  if (!name) return "";
  return name.trim().split(/\s+/)[0] ?? "";
}

export default function HelpPage() {
  return (
    <AuthGuard>
      {(user) => (
        <AppShell user={user}>
          <HelpView user={user} />
        </AppShell>
      )}
    </AuthGuard>
  );
}

function HelpView({ user }: { user: User }) {
  const [query, setQuery] = useState("");

  const greeting = useMemo(() => getGreeting(), []);
  const first = firstName(user.name) || "estudante";

  const normalizedQuery = query.trim().toLowerCase();

  const filteredCategories = useMemo(() => {
    if (!normalizedQuery) return FAQ_CATEGORIES;
    return FAQ_CATEGORIES.filter((cat) => {
      const haystack = [
        cat.title,
        cat.description,
        ...cat.keywords,
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(normalizedQuery);
    });
  }, [normalizedQuery]);

  function handleComingSoon(label?: string) {
    toast("Em breve", {
      description: label
        ? `${label} estará disponível em breve.`
        : "Este conteúdo estará disponível em breve.",
    });
  }

  return (
    <div className="mx-auto w-full max-w-7xl px-5 py-8">
      {/* Header */}
      <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <div className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-background/60 backdrop-blur px-3 py-1 text-xs mb-3">
            <HelpCircle className="h-3 w-3 text-primary" />
            Central de ajuda
          </div>
          <p className="text-sm text-muted-foreground">
            {greeting}, {first}{" "}
            <span aria-hidden="true">👋</span>
          </p>
          <h1 className="mt-1 text-3xl md:text-4xl font-semibold tracking-tight">
            Ajuda e suporte
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Estamos aqui para ajudar você a aproveitar ao máximo o Lumio.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 md:flex-nowrap">
          <Button asChild variant="outline" size="sm">
            <Link href="/dashboard">
              <Plus className="h-4 w-4" />
              Nova matéria
            </Link>
          </Button>
          <Button asChild variant="gradient" size="sm">
            <Link href="/dashboard">
              <Mic className="h-4 w-4" />
              Nova aula
            </Link>
          </Button>
        </div>
      </div>

      {/* Search bar */}
      <div className="mt-6 rounded-2xl border border-border/60 bg-card p-2 shadow-sm">
        <div className="flex items-center gap-3 rounded-xl bg-background/60 px-4 py-3">
          <Search
            className="h-5 w-5 shrink-0 text-muted-foreground"
            aria-hidden="true"
          />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Como podemos te ajudar hoje?"
            className="w-full bg-transparent text-base outline-none placeholder:text-muted-foreground"
            aria-label="Buscar artigos de ajuda"
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

      {/* FAQ Section */}
      <section className="mt-10">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-xl md:text-2xl font-semibold tracking-tight">
            Perguntas frequentes
          </h2>
          <button
            type="button"
            onClick={() => handleComingSoon("A lista completa de perguntas")}
            className="text-sm text-primary hover:underline"
          >
            Ver todas as perguntas →
          </button>
        </div>

        {filteredCategories.length === 0 ? (
          <div className="mt-5 rounded-2xl border border-dashed border-border/60 bg-card/60 p-8 text-center">
            <p className="text-sm text-muted-foreground">
              Nenhuma categoria encontrada para{" "}
              <span className="font-medium text-foreground">
                “{query}”
              </span>
              . Tente outra palavra-chave ou{" "}
              <a
                href={`mailto:${SUPPORT_EMAIL}?subject=Dúvida sobre ${encodeURIComponent(
                  query,
                )}`}
                className="text-primary hover:underline"
              >
                fale com o suporte
              </a>
              .
            </p>
          </div>
        ) : (
          <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {filteredCategories.map((cat) => {
              const Icon = cat.icon;
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => handleComingSoon(cat.title)}
                  className="group flex h-full flex-col items-start rounded-2xl border border-border/60 bg-card p-5 text-left transition-all hover:border-primary/40 hover:shadow-md hover:shadow-primary/5 hover:-translate-y-0.5"
                >
                  <div className="flex h-11 w-11 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <Icon className="h-5 w-5" aria-hidden="true" />
                  </div>
                  <h3 className="mt-4 text-base font-semibold tracking-tight">
                    {cat.title}
                  </h3>
                  <p className="mt-1.5 text-sm text-muted-foreground line-clamp-2">
                    {cat.description}
                  </p>
                  <span className="mt-auto pt-4 text-xs font-medium text-primary group-hover:underline">
                    {cat.count} artigos →
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </section>

      {/* Guides Section */}
      <section className="mt-12">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-xl md:text-2xl font-semibold tracking-tight">
            Guias e tutoriais
          </h2>
          <button
            type="button"
            onClick={() => handleComingSoon("Todos os guias")}
            className="text-sm text-primary hover:underline"
          >
            Ver todos os guias →
          </button>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-3">
          {GUIDES.map((guide) => (
            <button
              key={guide.id}
              type="button"
              onClick={() => handleComingSoon(guide.title)}
              className="group flex h-full flex-col overflow-hidden rounded-2xl border border-border/60 bg-card text-left transition-all hover:border-primary/40 hover:shadow-md hover:shadow-primary/5 hover:-translate-y-0.5"
            >
              <div className="relative flex h-40 items-center justify-center bg-gradient-to-br from-primary/10 via-fuchsia-500/5 to-transparent">
                <div className="w-32 md:w-36">
                  <LumiScene scene={guide.scene} />
                </div>
              </div>
              <div className="flex flex-1 flex-col p-5">
                <h3 className="text-base font-semibold tracking-tight">
                  {guide.title}
                </h3>
                <p className="mt-1.5 text-sm text-muted-foreground line-clamp-2">
                  {guide.description}
                </p>
                <div className="mt-auto flex items-center justify-between gap-2 pt-4">
                  <Badge variant="secondary" className="font-normal">
                    {guide.badge}
                  </Badge>
                  <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                    <Clock className="h-3 w-3" aria-hidden="true" />
                    {guide.readTime}
                  </span>
                </div>
              </div>
            </button>
          ))}
        </div>
      </section>

      {/* Support & Contacts */}
      <section className="mt-12">
        <h2 className="text-xl md:text-2xl font-semibold tracking-tight">
          Suporte e contatos
        </h2>

        <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-3">
          {/* Big card: Falar com suporte */}
          <div className="md:col-span-1 lg:col-span-1 flex h-full flex-col rounded-2xl border border-border/60 bg-gradient-to-br from-primary/8 via-card to-fuchsia-500/5 p-6 md:flex-row md:items-center md:gap-5">
            <div className="relative flex h-24 w-24 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary/20 to-fuchsia-500/15 ring-1 ring-primary/20">
              <LumiCharacter mood="thinking" size="md" float />
              <span
                className="absolute -bottom-1 -right-1 inline-flex h-7 w-7 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-md"
                aria-hidden="true"
              >
                <Sparkles className="h-3.5 w-3.5" />
              </span>
            </div>
            <div className="mt-4 flex min-w-0 flex-1 flex-col md:mt-0">
              <h3 className="text-base font-semibold tracking-tight">
                Ainda precisa de ajuda?
              </h3>
              <p className="mt-1.5 text-sm text-muted-foreground">
                Nossa equipe de suporte está pronta para te atender sempre
                que você precisar.
              </p>
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <Button asChild variant="gradient" size="sm">
                  <a
                    href={`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(
                      "Preciso de ajuda no Lumio",
                    )}`}
                  >
                    <Mail className="h-4 w-4" />
                    Falar com o suporte
                  </a>
                </Button>
                <span className="text-xs text-muted-foreground">
                  Tempo médio de resposta: 2h
                </span>
              </div>
            </div>
          </div>

          {/* Central de ajuda */}
          <button
            type="button"
            onClick={() => handleComingSoon("Central de ajuda")}
            className="group flex h-full flex-col items-start rounded-2xl border border-border/60 bg-card p-6 text-left transition-all hover:border-primary/40 hover:shadow-md hover:shadow-primary/5 hover:-translate-y-0.5"
          >
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Book className="h-5 w-5" aria-hidden="true" />
            </div>
            <h3 className="mt-4 text-base font-semibold tracking-tight">
              Central de ajuda
            </h3>
            <p className="mt-1.5 text-sm text-muted-foreground">
              Explore todos os artigos e tutoriais detalhados sobre o Lumio.
            </p>
            <span className="mt-auto pt-4 text-sm font-medium text-primary group-hover:underline">
              Acessar central →
            </span>
          </button>

          {/* Enviar feedback */}
          <a
            href={`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(
              "Feedback Lumio",
            )}`}
            className="group flex h-full flex-col items-start rounded-2xl border border-border/60 bg-card p-6 text-left transition-all hover:border-primary/40 hover:shadow-md hover:shadow-primary/5 hover:-translate-y-0.5"
          >
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-primary/10 text-primary">
              <MessageSquare className="h-5 w-5" aria-hidden="true" />
            </div>
            <h3 className="mt-4 text-base font-semibold tracking-tight">
              Enviar feedback
            </h3>
            <p className="mt-1.5 text-sm text-muted-foreground">
              Sua opinião é essencial para melhorarmos cada vez mais.
            </p>
            <span className="mt-auto pt-4 text-sm font-medium text-primary group-hover:underline">
              Enviar feedback →
            </span>
          </a>
        </div>
      </section>

      {/* Security strip */}
      <section className="mt-12 mb-2">
        <div className="flex flex-col items-start gap-4 rounded-2xl border border-border/60 bg-gradient-to-r from-emerald-500/5 via-card to-card p-5 md:flex-row md:items-center md:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <Shield className="h-5 w-5" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-semibold tracking-tight">
                Sua segurança é nossa prioridade
              </h3>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Seus dados são protegidos com criptografia de ponta a ponta
                e nunca são compartilhados.
              </p>
            </div>
          </div>
          <Link
            href="/privacy"
            className="inline-flex shrink-0 items-center gap-1 text-sm font-medium text-primary hover:underline"
          >
            <BookOpen className="h-4 w-4" aria-hidden="true" />
            Saiba mais sobre segurança →
          </Link>
        </div>
      </section>
    </div>
  );
}
