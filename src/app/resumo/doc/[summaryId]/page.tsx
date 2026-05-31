"use client";

/**
 * /resumo/doc/[summaryId] — visualização de resumo de documento (PDF puro).
 *
 * Esta tela é uma DERIVAÇÃO QUASE-IDÊNTICA da canônica `/lecture/[id]?tab=summary`
 * — mesmo header, mesmo grid, mesmo LiveTranscriptColumn forçado em modo resumo,
 * mesmo SlidesColumn lateral, mesmo ChatColumn lateral, mesma faixa de CTAs
 * (flashcards / quiz / mapa mental).
 *
 * Diferenças vs `/lecture/[id]`:
 *   1. Sem player de áudio (PDF puro não tem áudio).
 *   2. Sem botão "Iniciar gravação" funcional — o callback existe pra manter
 *      a interface do LectureHeader, mas só dispara toast.info explicando.
 *   3. Sem aba "Transcrição revisada/crua" — LiveTranscriptColumn detecta
 *      entries=[] + hasAudio=false e esconde tabs automaticamente.
 *   4. Sem botão "Estruturar transcrição" (não há transcrição pra estruturar).
 *   5. Sem sync de slides com timestamps (não há timestamps em PDF puro).
 *   6. CTAs flashcards/quiz/mindmap abrem o ContentWizard com o documento
 *      desta tela pré-selecionado (em vez de gerar direto, porque os
 *      endpoints /api/flashcards|quiz|mindmap exigem lectureId — sem
 *      lecture aqui, o caminho limpo é via wizard que sabe criar asset
 *      a partir de Document).
 *   7. Chat (ChatColumn) usa endpoint /api/ai/chat-summary (com summaryId)
 *      em vez de /api/chat (que exige lectureId). Mensagens ficam só em
 *      memória local — não há persistência cross-session (limitação
 *      conhecida; o resumo-doc não tem coluna messages no DB).
 */

import { use, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Brain,
  FileText,
  HelpCircle,
  Layers,
  Loader2,
  MessageSquare,
} from "lucide-react";
import { toast } from "sonner";

import { AuthGuard } from "@/components/app/auth-guard";
import { confirmAction } from "@/components/ui/confirm-dialog";
import { AppShell } from "@/components/app/app-shell";
import { Button } from "@/components/ui/button";
import {
  LectureHeader,
  type LectureHeaderView,
} from "@/components/lecture/lecture-header";
import { LiveTranscriptColumn } from "@/components/lecture/live-transcript-column";
import { SlidesColumn } from "@/components/lecture/slides-column";
import { ChatColumn } from "@/components/lecture/chat-column";
import { ContentWizard } from "@/components/ai/content-wizard";
import {
  deleteSummaryAsync,
  getSummaryAsync,
  updateSummaryAsync,
} from "@/lib/summaries";
import { getDocumentAsync } from "@/lib/documents";
import { getSubjectAsync } from "@/lib/db";
import { renderPdfToImages } from "@/lib/pdf-render";
import { COIN_COSTS } from "@/lib/coin-costs";
import { generateId, stripChatFormatting } from "@/lib/utils";
import type {
  ChatMessage,
  Document as LumioDocument,
  Slide,
  Subject,
  Summary,
  TranscriptMarker,
  User,
} from "@/lib/types";

type MarkerFilter = TranscriptMarker | "all";

type AssetKind = "flashcards" | "quiz" | "mindmap";

const SUGGESTED_PROMPTS = [
  "Faz um resumo do material",
  "Quais os pontos principais?",
  "Crie 5 questões pra revisão",
  "Explica de novo a parte mais difícil",
];

export default function ResumoDocPage({
  params,
}: {
  params: Promise<{ summaryId: string }>;
}) {
  const { summaryId } = use(params);
  return (
    <AuthGuard>
      {(user) => (
        <AppShell user={user}>
          <ResumoDocView user={user} summaryId={summaryId} />
        </AppShell>
      )}
    </AuthGuard>
  );
}

function ResumoDocView({
  user,
  summaryId,
}: {
  user: User;
  summaryId: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [doc, setDoc] = useState<LumioDocument | null>(null);
  const [subject, setSubject] = useState<Subject | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);

  // ContentWizard pode rodar em dois fluxos:
  //  - regenerar o RESUMO atual (mode = "summary")
  //  - criar novo asset (flashcards / quiz / mindmap) ancorado no doc
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardMode, setWizardMode] = useState<
    "summary" | "flashcards" | "quiz" | "mindmap"
  >("summary");

  // Loading dos CTAs (apenas pra mostrar spinner ao abrir wizard).
  // Cada CTA fica num estado de "preparando..." entre o click e o open
  // do wizard pra dar feedback visual instantâneo.
  const [actionLoading, setActionLoading] = useState<AssetKind | null>(null);

  // Header view state. Inicia em "summary" porque a aba relevante aqui é só
  // resumo. LiveTranscriptColumn esconde tabs de transcrição automaticamente
  // (entries=[] + hasAudio=false).
  const [view, setView] = useState<LectureHeaderView>("summary");

  // Props que o LiveTranscriptColumn exige mas que aqui não fazem nada útil.
  const [search, setSearch] = useState("");
  const [activeFilter, setActiveFilter] = useState<MarkerFilter>("all");

  // ===== PDF viewer state =====
  const [slides, setSlides] = useState<Slide[] | undefined>(undefined);
  const [currentSlideIdx, setCurrentSlideIdx] = useState(0);
  const [renderingPdf, setRenderingPdf] = useState(false);
  // Default: mostra PDF ao lado em desktop quando há PDF disponível. Toggle
  // permite esconder pra ganhar largura no resumo.
  const [showPdfBesides, setShowPdfBesides] = useState(true);

  // ===== Chat state =====
  // Default: chat fechado. User abre quando quer perguntar. Evita poluir a
  // tela de leitura passiva.
  const [showChat, setShowChat] = useState(false);
  // Messages vivem só em memória local — não há coluna `messages` na tabela
  // `summaries` (diferente de `lectures.messages`). Limitação conhecida:
  // recarregar a página perde o histórico. Pra resolver de verdade, seria
  // necessário criar uma tabela summary_messages ou estender summaries com
  // jsonb messages — fora do escopo desta refatoração.
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [streamingReply, setStreamingReply] = useState("");

  // `?from=<rota>` define pra onde Voltar leva — espelhando /lecture/[id].
  // Valores aceitos: "resumos" (default), "planos/<planId>", "documentos".
  const fromParam = searchParams.get("from");
  const backHref =
    fromParam && fromParam.startsWith("planos/")
      ? `/${fromParam}`
      : fromParam === "documentos"
        ? "/documentos"
        : "/resumos";

  useEffect(() => {
    let active = true;
    (async () => {
      const sm = await getSummaryAsync(user.id, summaryId);
      if (!active) return;
      if (!sm) {
        toast.info("Esse resumo não existe mais.");
        router.replace("/resumos");
        return;
      }
      setSummary(sm);
      const [d, sj] = await Promise.all([
        sm.source.kind === "document"
          ? getDocumentAsync(user.id, sm.source.documentId)
          : null,
        sm.subjectId ? getSubjectAsync(user.id, sm.subjectId) : null,
      ]);
      if (!active) return;
      setDoc(d);
      setSubject(sj);
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [user.id, summaryId, router]);

  // ===== Renderiza PDF do doc em slides assim que o doc carrega =====
  // Decisão: SlidesColumn espera `Slide[]` com `imageDataUrl`. Como o doc
  // só tem `sourceUrl` (PDF no Storage), fetchamos o arquivo e rodamos
  // renderPdfToImages (mesma função usada em /lecture pra extrair slides).
  // Acontece em background — se falhar, o painel some silenciosamente
  // (usuário fica só com o resumo + chat).
  useEffect(() => {
    if (!doc?.sourceUrl || doc.sourceKind !== "pdf") return;
    let active = true;
    setRenderingPdf(true);
    (async () => {
      try {
        const res = await fetch(doc.sourceUrl as string);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const blob = await res.blob();
        const file = new File([blob], doc.title || "document.pdf", {
          type: "application/pdf",
        });
        const rendered = await renderPdfToImages(file);
        if (!active) return;
        const asSlides: Slide[] = rendered.map((r) => ({
          pageNumber: r.pageNumber,
          imageDataUrl: r.imageDataUrl,
          text: "",
        }));
        setSlides(asSlides);
      } catch (err) {
        console.warn("[resumo/doc] render pdf failed", err);
        if (active) setSlides(undefined);
      } finally {
        if (active) setRenderingPdf(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [doc?.sourceUrl, doc?.sourceKind, doc?.title]);

  async function handleRename(nextTitle: string) {
    if (!summary || nextTitle === summary.title) return;
    try {
      const updated = await updateSummaryAsync(user.id, summary.id, {
        title: nextTitle,
      });
      if (updated) {
        setSummary(updated);
        toast.success("Título atualizado.");
      }
    } catch (err) {
      toast.error(`Erro ao renomear: ${(err as Error).message}`);
    }
  }

  function handleShare() {
    if (typeof window === "undefined") return;
    navigator.clipboard
      .writeText(window.location.href)
      .then(() => toast.success("Link copiado."))
      .catch(() => toast.error("Não consegui copiar o link."));
  }

  function handleExportPdf() {
    // Placeholder — export PDF ainda não implementado pra resumo-doc canônico.
    // Mantém paridade com versão anterior (que tinha botão `disabled`).
    toast.info("Export PDF em breve nessa tela.");
  }

  async function handleDelete() {
    if (!summary) return;
    const confirmed = await confirmAction({
      title: `Excluir o resumo "${summary.title}"?`,
      description: "O documento original será mantido.",
      destructive: true,
      confirmText: "Excluir resumo",
    });
    if (!confirmed) return;
    setDeleting(true);
    try {
      await deleteSummaryAsync(user.id, summary.id);
      toast.success("Resumo excluído.");
      router.push("/resumos");
    } catch (err) {
      toast.error(`Erro ao excluir: ${(err as Error).message}`);
      setDeleting(false);
    }
  }

  // ===== Handler dos CTAs (flashcards/quiz/mindmap) =====
  // Paridade com /lecture/[id]: chama endpoint direto (sem passar pelo wizard).
  // Os 3 endpoints (/api/flashcards, /api/quiz, /api/mindmap) aceitam
  // documentId além de lectureId desde a refatoração paralela — usamos
  // documentId aqui.
  async function handleNextAction(kind: AssetKind) {
    if (!doc) {
      toast.error("Documento original não encontrado pra gerar este conteúdo.");
      return;
    }
    if (!summary) return;
    const endpoint =
      kind === "flashcards"
        ? "/api/flashcards"
        : kind === "quiz"
          ? "/api/quiz"
          : "/api/mindmap";
    const label =
      kind === "flashcards"
        ? "flashcards"
        : kind === "quiz"
          ? "quiz"
          : "mapa mental";
    const targetRoute =
      kind === "flashcards"
        ? "/flashcards"
        : kind === "quiz"
          ? "/quiz"
          : "/documentos";
    setActionLoading(kind);
    const t = toast.loading(`Gerando ${label}...`);
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          documentId: doc.id,
          lectureTitle: doc.title || summary.title,
          subject: subject?.name ?? "Geral",
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = (data as { error?: string })?.error || `HTTP ${res.status}`;
        toast.error(`Erro ao gerar ${label}: ${msg}`, { id: t });
        return;
      }
      toast.success(
        `${label.charAt(0).toUpperCase() + label.slice(1)} gerado.`,
        {
          id: t,
          action: {
            label: "Ver",
            onClick: () => router.push(targetRoute),
          },
        },
      );
    } catch (err) {
      toast.error(`Erro ao gerar ${label}: ${(err as Error).message}`, {
        id: t,
      });
    } finally {
      setActionLoading(null);
    }
  }

  // ===== Chat handler =====
  // Usa /api/ai/chat-summary com stream:true (SSE), que aceita summaryId
  // direto — endpoint já busca o resumo, monta o system prompt com o
  // conteúdo e cobra 1 coin por mensagem. Igual ao fluxo de /lecture/[id]
  // visualmente, só muda o endpoint underneath.
  const sendMessage = useCallback(async () => {
    const text = input.trim();
    if (!text || sending || !summary) return;
    const userMsg: ChatMessage = {
      id: generateId(),
      role: "user",
      content: text,
      createdAt: new Date().toISOString(),
    };
    const nextMessages = [...messages, userMsg];
    setMessages(nextMessages);
    setInput("");
    setSending(true);
    setStreamingReply("");

    try {
      const res = await fetch("/api/ai/chat-summary", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          summaryId: summary.id,
          message: text,
          history: messages.map((m) => ({ role: m.role, content: m.content })),
          stream: true,
        }),
      });
      if (!res.ok) {
        // Resposta SSE não-OK vem como JSON normal (ex.: 402 saldo).
        const data = await res.json().catch(() => ({}));
        const msg = data?.error ?? `HTTP ${res.status}`;
        throw new Error(msg);
      }
      if (!res.body) throw new Error("Resposta vazia.");

      // Parser SSE: cada evento é "data: {json}\n\n". `delta` é o token,
      // `done: true` fecha o stream com `reply` final.
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let acc = "";
      let finalReply: string | undefined;

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        // Processa eventos completos (\n\n separa)
        let sepIdx: number;
        while ((sepIdx = buffer.indexOf("\n\n")) !== -1) {
          const rawEvent = buffer.slice(0, sepIdx);
          buffer = buffer.slice(sepIdx + 2);
          // Linhas que começam com "data: "
          for (const line of rawEvent.split("\n")) {
            if (!line.startsWith("data:")) continue;
            const payload = line.slice(5).trim();
            if (!payload) continue;
            try {
              const obj = JSON.parse(payload) as {
                delta?: string;
                done?: boolean;
                reply?: string;
                error?: string;
              };
              if (obj.error) throw new Error(obj.error);
              if (typeof obj.delta === "string") {
                acc += obj.delta;
                setStreamingReply(acc);
              }
              if (obj.done && typeof obj.reply === "string") {
                finalReply = obj.reply;
              }
            } catch (parseErr) {
              // Linha inválida ou error do server — propaga
              if (parseErr instanceof Error) throw parseErr;
            }
          }
        }
      }

      const replyText = (finalReply ?? acc).trim();
      if (!replyText) throw new Error("Resposta vazia do Lumi.");

      const assistantMsg: ChatMessage = {
        id: generateId(),
        role: "assistant",
        content: stripChatFormatting(replyText),
        createdAt: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, assistantMsg]);
      setStreamingReply("");
    } catch (err) {
      console.error("[resumo/doc] chat failed", err);
      toast.error(`Erro ao conversar com o Lumi: ${(err as Error).message}`);
      // Remove a mensagem do user se a IA não respondeu — evita ficar
      // com pergunta pendurada sem resposta.
      setMessages((prev) => prev.filter((m) => m.id !== userMsg.id));
    } finally {
      setSending(false);
    }
  }, [input, sending, summary, messages]);

  // Suggestions estáticas (não temos keyTerms aqui — resumo-doc não tem
  // transcript-insights). Podemos enriquecer com highlights do summary
  // pra ficar mais ancorado no conteúdo.
  const suggestions = useMemo(() => {
    const highlights = summary?.content?.highlights;
    if (highlights && highlights.length >= 2) {
      const top = highlights.slice(0, 2);
      return [
        `Explique melhor: ${top[0]}`,
        `Como ${top[1]} se conecta ao resto?`,
        SUGGESTED_PROMPTS[2],
        SUGGESTED_PROMPTS[3],
      ];
    }
    return SUGGESTED_PROMPTS;
  }, [summary?.content?.highlights]);

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!summary) return null;

  const hasPdf = !!doc?.sourceUrl && doc.sourceKind === "pdf";
  const showSlidesColumn = hasPdf && showPdfBesides;
  // Grid columns. Só ativa colunas extras no md+ pra preservar mobile sem
  // scroll horizontal — mobile vê só o resumo (toggles ficam ocultos).
  const gridCols =
    showSlidesColumn && showChat
      ? "md:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)_380px]"
      : showSlidesColumn
        ? "md:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]"
        : showChat
          ? "md:grid-cols-[minmax(0,1fr)_400px]"
          : "md:grid-cols-1";

  // CTAs igual à canônica /lecture/[id]/page.tsx (linhas ~1285-1338).
  // Mantém ordem, ícones, cores e formato de copy.
  const ctaItems = [
    {
      id: "flashcards" as const,
      label: "Criar flashcards",
      icon: Layers,
      cost: COIN_COSTS.flashcards,
      iconColor: "text-emerald-500",
    },
    {
      id: "quiz" as const,
      label: "Gerar quiz",
      icon: HelpCircle,
      cost: COIN_COSTS.quiz,
      iconColor: "text-amber-500",
    },
    {
      id: "mindmap" as const,
      label: "Mapa mental",
      icon: Brain,
      cost: COIN_COSTS.mindmap,
      iconColor: "text-rose-500",
    },
  ];

  return (
    <>
      <LectureHeader
        title={summary.title}
        subjectName={subject?.name}
        subjectColor={subject?.color}
        isLive={false}
        durationSec={0}
        view={view}
        hasSummary={true}
        generatingSummary={false}
        onTitleChange={handleRename}
        onToggleRecording={() => {
          // Não há gravação nessa rota (resumo de PDF puro). Botão "Iniciar
          // gravação" do header fica visível por consistência, mas no-op aqui.
          toast.info(
            "Essa tela é só de leitura. Pra gravar aula, vá em Gravações.",
          );
        }}
        onChangeView={(v) => setView(v)}
        onSave={() => {
          // Nada pra salvar — não há transcrição. No-op.
        }}
        onShare={handleShare}
        onExportPdf={handleExportPdf}
        onDelete={handleDelete}
        onBack={() => router.push(backHref)}
      />

      <div className="mx-auto max-w-[1600px] px-4 py-5 space-y-5">
        {/* Toolbar de toggles — só desktop. Mobile fica no resumo simples. */}
        <div className="hidden md:flex items-center gap-2 flex-wrap">
          {hasPdf && (
            <Button
              type="button"
              variant={showPdfBesides ? "default" : "outline"}
              size="sm"
              onClick={() => setShowPdfBesides((v) => !v)}
              className="gap-1.5"
            >
              <FileText className="h-3.5 w-3.5" />
              {showPdfBesides ? "Esconder PDF" : "Mostrar PDF ao lado"}
              {renderingPdf && (
                <Loader2 className="h-3 w-3 animate-spin opacity-60" />
              )}
            </Button>
          )}
          <Button
            type="button"
            variant={showChat ? "default" : "outline"}
            size="sm"
            onClick={() => setShowChat((v) => !v)}
            className="gap-1.5"
          >
            <MessageSquare className="h-3.5 w-3.5" />
            {showChat ? "Esconder chat" : "Perguntar ao Lumi"}
          </Button>
          {hasPdf && renderingPdf && !slides && (
            <span className="text-[11px] text-muted-foreground inline-flex items-center gap-1.5">
              <Loader2 className="h-3 w-3 animate-spin" />
              Carregando PDF original…
            </span>
          )}
        </div>

        {/* Faixa de CTAs — flashcards / quiz / mapa mental.
            Mesmo grid 3-col da canônica /lecture/[id] (linhas 1285-1338).
            Diferença: como não há áudio aqui, ocupa a largura inteira em
            todos os breakpoints (não compete com o player de áudio). */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {ctaItems.map((a) => {
            const Icon = a.icon;
            const isLoading = actionLoading === a.id;
            const anyLoading = !!actionLoading;
            const disabled = anyLoading || !doc;
            return (
              <button
                key={a.id}
                type="button"
                onClick={() => handleNextAction(a.id)}
                disabled={disabled}
                className="group flex items-center gap-3 rounded-xl border border-border/60 bg-card hover:bg-secondary/50 px-3 py-2.5 text-left transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <div className="h-9 w-9 shrink-0 rounded-lg bg-secondary/60 flex items-center justify-center">
                  {isLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  ) : (
                    <Icon className={`h-4 w-4 ${a.iconColor}`} />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-semibold truncate leading-tight">
                    {isLoading ? "Abrindo…" : a.label}
                  </div>
                  <div className="text-[10px] text-muted-foreground font-mono mt-0.5">
                    {a.cost} coins
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        <div className={`grid gap-6 grid-cols-1 ${gridCols}`}>
          <LiveTranscriptColumn
            entries={[]}
            interim=""
            isLive={false}
            keyTerms={summary.content.highlights?.slice(0, 8) ?? []}
            topics={[]}
            hasAudio={false}
            search={search}
            activeFilter={activeFilter}
            summary={summary.content}
            generatingSummary={false}
            onGenerateSummary={() => {
              setWizardMode("summary");
              setWizardOpen(true);
            }}
            summaryImages={summary.images}
            onSearchChange={setSearch}
            onFilterChange={setActiveFilter}
            initialViewMode="summary"
          />

          {showSlidesColumn && (
            <div className="hidden md:block min-w-0 md:sticky md:top-4 md:self-start">
              <SlidesColumn
                slides={slides}
                attaching={renderingPdf}
                showPdfBesides={showPdfBesides}
                onTogglePdfBesides={setShowPdfBesides}
                currentIdx={currentSlideIdx}
                onSelect={setCurrentSlideIdx}
                // No-ops aqui — o PDF vem do doc, user não anexa nem remove
                // por essa tela (gerencia em /document/[id]).
                onAttachClick={() => {
                  toast.info("Pra trocar o PDF, edite o documento original.");
                }}
                onRemove={() => {
                  toast.info("Pra remover, exclua o documento em /documentos.");
                }}
              />
            </div>
          )}

          {showChat && (
            <div className="hidden md:block min-w-0 md:sticky md:top-4 md:self-start">
              <ChatColumn
                messages={messages}
                streamingReply={streamingReply}
                suggestions={suggestions}
                input={input}
                onInputChange={setInput}
                onSend={sendMessage}
                sending={sending}
              />
            </div>
          )}
        </div>
      </div>

      <ContentWizard
        open={wizardOpen}
        onOpenChange={(open) => {
          setWizardOpen(open);
          if (!open) {
            // Reset pra "summary" — fluxo de gerar resumo é o default da tela.
            setWizardMode("summary");
          }
        }}
        mode={wizardMode}
        userId={user.id}
        // Ancora o wizard no doc desta tela. Quando o user dispara um CTA
        // (flashcards/quiz/mindmap), o wizard já abre com o PDF certo
        // pré-selecionado, sem precisar buscar de novo na lista.
        initialSourceDocumentId={
          doc?.id && summary.source.kind === "document" ? doc.id : undefined
        }
        initialSubjectId={summary.subjectId || undefined}
        onCreated={({ summaryId: newId, mode }) => {
          // Resumo regerado: navega pra nova URL (id muda).
          if (mode === "summary" && newId && newId !== summaryId) {
            router.push(`/resumo/doc/${newId}`);
          }
          // Para flashcards/quiz/mindmap o wizard já mostra toast e redireciona
          // sozinho — nada a fazer aqui.
        }}
      />

      {/* Marker de loading no delete pra evitar duplo clique enquanto navega */}
      {deleting && (
        <div className="fixed inset-0 bg-background/40 backdrop-blur-sm flex items-center justify-center z-50">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}
    </>
  );
}
