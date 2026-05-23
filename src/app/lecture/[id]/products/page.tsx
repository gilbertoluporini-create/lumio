"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ChevronRight, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { AuthGuard } from "@/components/app/auth-guard";
import { AppShell } from "@/components/app/app-shell";
import { LumiCharacter } from "@/components/brand/lumi";
import { LumiIcon, type LumiIconName } from "@/components/brand/lumi-icon";
import { LumioCoin } from "@/components/brand/lumio-coin";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  FlashcardsView,
  type FlashcardsAsset,
} from "@/components/app/flashcards-view";
import { QuizView, type QuizAsset } from "@/components/app/quiz-view";
import {
  LectureSummaryView,
} from "@/components/app/lecture-summary-view";
import { getLectureAsync, getSubjectAsync } from "@/lib/db";
import type {
  Lecture,
  LectureSummary,
  Subject,
  User,
} from "@/lib/types";
import { cn } from "@/lib/utils";

const COSTS = {
  summary: 10,
  flashcards: 12,
  quiz: 15,
  mindmap: 20,
};

type AssetRow = {
  id: string;
  kind: "summary" | "flashcards" | "quiz" | "mindmap";
  payload: unknown;
  coins_spent: number;
  created_at: string;
  updated_at: string;
};

export default function ProductsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  return (
    <AuthGuard>
      {(user) => (
        <AppShell user={user}>
          <ProductsView user={user} lectureId={id} />
        </AppShell>
      )}
    </AuthGuard>
  );
}

function ProductsView({
  user,
  lectureId,
}: {
  user: User;
  lectureId: string;
}) {
  const [lecture, setLecture] = useState<Lecture | null>(null);
  const [subject, setSubject] = useState<Subject | null>(null);
  const [assets, setAssets] = useState<AssetRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [generatingKind, setGeneratingKind] = useState<string | null>(null);
  const [activeAsset, setActiveAsset] = useState<AssetRow | null>(null);

  async function refresh() {
    const l = await getLectureAsync(user.id, lectureId);
    if (!l) return;
    setLecture(l);
    const s = await getSubjectAsync(user.id, l.subjectId);
    setSubject(s);
    const res = await fetch(`/api/lectures/${lectureId}/assets`, {
      cache: "no-store",
    });
    if (res.ok) {
      const data = await res.json();
      setAssets(data.assets ?? []);
    }
  }

  useEffect(() => {
    refresh().finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lectureId]);

  async function generateSummary() {
    if (!lecture || !subject) return;
    setGeneratingKind("summary");
    const t = toast.loading("Gerando resumo estruturado…");
    try {
      const res = await fetch("/api/correlate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          lectureTitle: lecture.title,
          subject: subject.name,
          transcript: lecture.transcript,
          slides: lecture.slides,
          messages: lecture.messages,
          lectureId,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data?.error ?? "Erro ao gerar resumo.", { id: t });
        return;
      }
      toast.success("Resumo gerado!", { id: t });
      await refresh();
    } catch (err) {
      toast.error(`Erro: ${(err as Error).message}`, { id: t });
    } finally {
      setGeneratingKind(null);
    }
  }

  async function generateFlashcards() {
    if (!lecture || !subject) return;
    setGeneratingKind("flashcards");
    const t = toast.loading("Gerando flash cards…");
    try {
      const res = await fetch("/api/flashcards", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          lectureTitle: lecture.title,
          subject: subject.name,
          transcript: lecture.transcript,
          slides: lecture.slides,
          messages: lecture.messages,
          lectureId,
          count: 10,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data?.error ?? "Erro ao gerar flash cards.", { id: t });
        return;
      }
      toast.success("Flash cards gerados!", { id: t });
      await refresh();
    } catch (err) {
      toast.error(`Erro: ${(err as Error).message}`, { id: t });
    } finally {
      setGeneratingKind(null);
    }
  }

  async function generateQuiz() {
    if (!lecture || !subject) return;
    setGeneratingKind("quiz");
    const t = toast.loading("Montando o quiz…");
    try {
      const res = await fetch("/api/quiz", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          lectureTitle: lecture.title,
          subject: subject.name,
          transcript: lecture.transcript,
          slides: lecture.slides,
          messages: lecture.messages,
          lectureId,
          count: 8,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data?.error ?? "Erro ao gerar quiz.", { id: t });
        return;
      }
      toast.success("Quiz gerado!", { id: t });
      await refresh();
    } catch (err) {
      toast.error(`Erro: ${(err as Error).message}`, { id: t });
    } finally {
      setGeneratingKind(null);
    }
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-5xl px-5 py-8">
        <div className="h-6 w-32 rounded-md bg-secondary/40 animate-pulse mb-4" />
        <div className="h-10 w-72 rounded-md bg-secondary/50 animate-pulse mb-2" />
        <div className="grid gap-3 md:grid-cols-2 mt-8">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="h-32 rounded-xl bg-secondary/30 animate-pulse"
            />
          ))}
        </div>
      </div>
    );
  }

  if (!lecture) {
    return (
      <div className="mx-auto max-w-5xl px-5 py-16 text-center">
        <LumiCharacter mood="confused" size="lg" />
        <h1 className="mt-4 text-xl font-semibold">Aula não encontrada</h1>
        <Button asChild variant="outline" className="mt-4">
          <Link href="/dashboard">
            <ArrowLeft className="h-4 w-4" /> Voltar
          </Link>
        </Button>
      </div>
    );
  }

  const hasTranscript = lecture.transcript.trim().length > 0;
  const summaryAsset = assets.find((a) => a.kind === "summary");
  const flashcardsAsset = assets.find((a) => a.kind === "flashcards");
  const quizAsset = assets.find((a) => a.kind === "quiz");

  // Se está vendo um asset, mostra o viewer
  if (activeAsset) {
    return (
      <div className="mx-auto max-w-5xl px-5 py-8">
        <div className="mb-5 flex items-center gap-1.5 text-sm text-muted-foreground">
          <button
            onClick={() => setActiveAsset(null)}
            className="hover:text-foreground transition-colors inline-flex items-center gap-1"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Produtos
          </button>
          <ChevronRight className="h-3.5 w-3.5" />
          <span className="text-foreground font-medium">
            {KIND_LABEL[activeAsset.kind]}
          </span>
        </div>
        {activeAsset.kind === "summary" && lecture && (
          <LectureSummaryView
            lecture={lecture}
            subject={subject}
            slides={lecture.slides}
            summary={activeAsset.payload as LectureSummary}
          />
        )}
        {activeAsset.kind === "flashcards" && (
          <FlashcardsView
            asset={activeAsset.payload as FlashcardsAsset}
          />
        )}
        {activeAsset.kind === "quiz" && (
          <QuizView asset={activeAsset.payload as QuizAsset} />
        )}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-5 py-8">
      {/* Breadcrumb */}
      <div className="flex items-center gap-1.5 text-sm text-muted-foreground mb-5 flex-wrap">
        <Link
          href="/dashboard"
          className="hover:text-foreground transition-colors"
        >
          Dashboard
        </Link>
        {subject && (
          <>
            <ChevronRight className="h-3.5 w-3.5" />
            <Link
              href={`/subject/${subject.id}`}
              className="hover:text-foreground transition-colors truncate"
            >
              {subject.name}
            </Link>
          </>
        )}
        <ChevronRight className="h-3.5 w-3.5" />
        <Link
          href={`/lecture/${lectureId}`}
          className="hover:text-foreground transition-colors truncate"
        >
          {lecture.title}
        </Link>
        <ChevronRight className="h-3.5 w-3.5" />
        <span className="text-foreground font-medium">Produtos</span>
      </div>

      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-semibold tracking-tight mb-1">
          Produtos gerados
        </h1>
        <p className="text-sm text-muted-foreground">
          Cada produto é um asset salvo na subpasta da aula. Você pode gerar
          quantos quiser.
        </p>
      </div>

      {!hasTranscript && (
        <div className="mb-6 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-amber-800 dark:text-amber-200">
          <strong>Sem transcrição.</strong> Grave a aula primeiro pra gerar
          produtos baseados no conteúdo.
        </div>
      )}

      {/* Grid de produtos */}
      <div className="grid gap-4 md:grid-cols-2">
        <ProductCard
          icon="document"
          title="Resumo estruturado"
          desc="Resumo por slide ou bloco lógico, com bullets e dúvidas do chat correlacionadas."
          coins={COSTS.summary}
          existing={summaryAsset}
          generating={generatingKind === "summary"}
          disabled={!hasTranscript || generatingKind !== null}
          onGenerate={generateSummary}
          onOpen={() => summaryAsset && setActiveAsset(summaryAsset)}
        />

        <ProductCard
          icon="layers"
          title="Flash cards"
          desc="10 cartões pergunta-resposta pra revisão ativa. Atalhos: ← → espaço."
          coins={COSTS.flashcards}
          existing={flashcardsAsset}
          generating={generatingKind === "flashcards"}
          disabled={!hasTranscript || generatingKind !== null}
          onGenerate={generateFlashcards}
          onOpen={() => flashcardsAsset && setActiveAsset(flashcardsAsset)}
        />

        <ProductCard
          icon="trophy"
          title="Quiz interativo"
          desc="8 questões de múltipla escolha com correção comentada. Atalhos: 1-4 e Enter."
          coins={COSTS.quiz}
          existing={quizAsset}
          generating={generatingKind === "quiz"}
          disabled={!hasTranscript || generatingKind !== null}
          onGenerate={generateQuiz}
          onOpen={() => quizAsset && setActiveAsset(quizAsset)}
        />

        <ProductCard
          icon="sparkle"
          title="Mapa mental"
          desc="Mapa visual conectando os conceitos da aula. Em breve."
          coins={COSTS.mindmap}
          existing={undefined}
          generating={false}
          disabled
          soon
          onGenerate={() => {}}
          onOpen={() => {}}
        />
      </div>

      {/* Histórico de assets gerados */}
      {assets.length > 0 && (
        <div className="mt-10">
          <h2 className="text-sm font-medium uppercase tracking-wider text-muted-foreground mb-3">
            Histórico
          </h2>
          <div className="rounded-xl border border-border/60 bg-card overflow-hidden divide-y divide-border/40">
            {assets.map((a) => (
              <button
                key={a.id}
                onClick={() => setActiveAsset(a)}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-secondary/30 transition-colors text-left"
              >
                <LumiIcon name={KIND_ICON[a.kind]} size={28} />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium">
                    {KIND_LABEL[a.kind]}
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    Gerado em{" "}
                    {new Date(a.created_at).toLocaleString("pt-BR", {
                      day: "2-digit",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}{" "}
                    · {a.coins_spent} coins
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

const KIND_LABEL: Record<AssetRow["kind"], string> = {
  summary: "Resumo estruturado",
  flashcards: "Flash cards",
  quiz: "Quiz",
  mindmap: "Mapa mental",
};

const KIND_ICON: Record<AssetRow["kind"], LumiIconName> = {
  summary: "document",
  flashcards: "layers",
  quiz: "trophy",
  mindmap: "sparkle",
};

function ProductCard({
  icon,
  title,
  desc,
  coins,
  existing,
  generating,
  disabled,
  soon,
  onGenerate,
  onOpen,
}: {
  icon: LumiIconName;
  title: string;
  desc: string;
  coins: number;
  existing: AssetRow | undefined;
  generating: boolean;
  disabled?: boolean;
  soon?: boolean;
  onGenerate: () => void;
  onOpen: () => void;
}) {
  return (
    <div
      className={cn(
        "relative rounded-2xl border bg-card p-5 transition-all",
        existing
          ? "border-primary/40 shadow-sm hover:shadow-md"
          : "border-border/60",
        disabled && !soon && "opacity-60",
      )}
    >
      <div className="flex items-start gap-3 mb-3">
        <LumiIcon name={icon} size={44} className="shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-semibold tracking-tight">{title}</h3>
            {existing && (
              <Badge variant="default" className="gap-1 text-[10px]">
                <Sparkles className="h-2.5 w-2.5" /> Gerado
              </Badge>
            )}
            {soon && (
              <Badge variant="secondary" className="text-[10px]">
                Em breve
              </Badge>
            )}
          </div>
          <div className="inline-flex items-center gap-1 mt-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-mono font-medium text-primary">
            <LumioCoin size={11} /> {coins}
          </div>
        </div>
      </div>
      <p className="text-sm text-muted-foreground leading-relaxed mb-4">
        {desc}
      </p>
      <div className="flex gap-2">
        {existing && (
          <Button variant="outline" size="sm" onClick={onOpen}>
            Abrir
          </Button>
        )}
        <Button
          variant={existing ? "default" : "gradient"}
          size="sm"
          onClick={onGenerate}
          disabled={disabled || generating}
          className="ml-auto"
        >
          {generating ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Gerando…
            </>
          ) : existing ? (
            <>Regerar</>
          ) : (
            <>
              <Sparkles className="h-3.5 w-3.5" /> Gerar
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
