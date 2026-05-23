"use client";

import { use, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  Bot,
  Check,
  ChevronLeft,
  Layers,
  Loader2,
  Mic,
  MicOff,
  Paperclip,
  Save,
  Send,
  Sparkles,
  Trash2,
  User as UserIcon,
} from "lucide-react";
import { toast } from "sonner";
import { AuthGuard } from "@/components/app/auth-guard";
import { AppShell } from "@/components/app/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  LectureSummaryView,
  summaryToMarkdown,
} from "@/components/app/lecture-summary-view";
import {
  appendMessage,
  deleteLecture,
  getLecture,
  getSubject,
  updateLecture,
} from "@/lib/storage";
import type {
  ChatMessage,
  Lecture,
  LectureSummary,
  Slide,
  Subject,
  User,
} from "@/lib/types";
import { renderPdfToImages } from "@/lib/pdf-render";
import { cn, formatDuration, generateId } from "@/lib/utils";
import {
  isSpeechRecognitionSupported,
  useSpeechRecognition,
} from "@/hooks/use-speech-recognition";

export default function LecturePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <AuthGuard>
      {(user) => (
        <AppShell user={user}>
          <LectureView user={user} lectureId={id} />
        </AppShell>
      )}
    </AuthGuard>
  );
}

function LectureView({ user, lectureId }: { user: User; lectureId: string }) {
  const router = useRouter();
  const [lecture, setLecture] = useState<Lecture | null>(null);
  const [subject, setSubject] = useState<Subject | null>(null);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const [interim, setInterim] = useState("");
  const [transcript, setTranscript] = useState("");
  const [durationSec, setDurationSec] = useState(0);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [streamingReply, setStreamingReply] = useState("");
  const [slides, setSlides] = useState<Slide[] | undefined>(undefined);
  const [slidesFileName, setSlidesFileName] = useState<string | undefined>(undefined);
  const [attaching, setAttaching] = useState(false);
  const [summary, setSummary] = useState<LectureSummary | undefined>(undefined);
  const [generatingSummary, setGeneratingSummary] = useState(false);
  const [view, setView] = useState<"live" | "summary">("live");
  const slidesInputRef = useRef<HTMLInputElement>(null);
  const timerRef = useRef<number | null>(null);
  const sessionStartRef = useRef<number | null>(null);
  const transcriptBoxRef = useRef<HTMLDivElement>(null);
  const chatBoxRef = useRef<HTMLDivElement>(null);

  const [browserSupported, setBrowserSupported] = useState(true);
  useEffect(() => {
    setBrowserSupported(isSpeechRecognitionSupported());
  }, []);

  const speech = useSpeechRecognition({
    lang: "pt-BR",
    onFinal: (text) => {
      setTranscript((prev) => {
        const next = (prev ? prev + " " : "") + text.trim();
        return next.replace(/\s+/g, " ");
      });
      setInterim("");
    },
    onInterim: (text) => setInterim(text),
  });

  useEffect(() => {
    const l = getLecture(user.id, lectureId);
    if (!l) {
      toast.error("Aula não encontrada.");
      router.replace("/dashboard");
      return;
    }
    setLecture(l);
    setTitleDraft(l.title);
    setTranscript(l.transcript || "");
    setDurationSec(l.durationSec || 0);
    setMessages(l.messages || []);
    setSlides(l.slides);
    setSlidesFileName(l.slidesFileName);
    setSummary(l.summary);
    const s = getSubject(user.id, l.subjectId);
    setSubject(s);
  }, [user.id, lectureId, router]);

  useEffect(() => {
    if (speech.state === "listening") {
      sessionStartRef.current = Date.now();
      timerRef.current = window.setInterval(() => {
        if (sessionStartRef.current) {
          const elapsed = Math.floor((Date.now() - sessionStartRef.current) / 1000);
          setDurationSec((base) => base + (elapsed > 0 ? 1 : 0));
        }
      }, 1000);
    } else if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
      sessionStartRef.current = null;
    }
    return () => {
      if (timerRef.current) {
        window.clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [speech.state]);

  useEffect(() => {
    if (transcriptBoxRef.current) {
      transcriptBoxRef.current.scrollTop = transcriptBoxRef.current.scrollHeight;
    }
  }, [transcript, interim]);

  useEffect(() => {
    if (chatBoxRef.current) {
      chatBoxRef.current.scrollTop = chatBoxRef.current.scrollHeight;
    }
  }, [messages, streamingReply]);

  const persist = (patch: Partial<Lecture>) => {
    if (!lecture) return;
    const updated = updateLecture(user.id, lecture.id, patch);
    if (updated) setLecture(updated);
  };

  function toggleRecording() {
    if (speech.state === "listening") {
      speech.stop();
      persist({
        transcript,
        durationSec,
        status: "completed",
      });
      const hasContent = transcript.trim().length > 50;
      const hasSlides = !!slides && slides.length > 0;
      if (hasContent && (hasSlides || messages.length > 0)) {
        toast.success("Aula salva. Gerando resumo automaticamente…");
        setTimeout(() => generateSummary({ silent: true }), 400);
      } else {
        toast.success("Aula salva.");
      }
    } else {
      if (!browserSupported) {
        toast.error("Seu navegador não suporta reconhecimento de voz. Use Chrome, Edge ou Safari.");
        return;
      }
      speech.start();
      persist({ status: "live" });
    }
  }

  function saveTranscript() {
    persist({ transcript, durationSec });
    toast.success("Transcrição salva.");
  }

  function saveTitle() {
    const t = titleDraft.trim();
    if (!t) {
      setTitleDraft(lecture?.title || "");
      setEditingTitle(false);
      return;
    }
    persist({ title: t });
    setEditingTitle(false);
  }

  function handleDelete() {
    if (!lecture) return;
    if (!confirm("Excluir esta aula? Esta ação não pode ser desfeita.")) return;
    deleteLecture(user.id, lecture.id);
    toast.success("Aula excluída.");
    router.replace("/dashboard");
  }

  async function handleSlidesFile(file: File) {
    if (attaching) return;
    if (file.type !== "application/pdf") {
      toast.error("Envie um PDF.");
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      toast.error("PDF muito grande (máx 20MB).");
      return;
    }
    setAttaching(true);
    const t = toast.loading("Renderizando slides do PDF…");
    try {
      // 1. Rasteriza páginas pra imagens (client-side)
      const rendered = await renderPdfToImages(file);
      toast.loading("Extraindo conteúdo de cada slide…", { id: t });

      // 2. Envia o mesmo PDF pro Claude pra extrair texto/título
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/extract-slides", {
        method: "POST",
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data?.error || "Erro ao processar slides.", { id: t });
        return;
      }
      const extracted: Slide[] = data.slides || [];

      // 3. Mescla: pageNumber em comum recebe imageDataUrl + title/text
      const merged: Slide[] = rendered.map((r) => {
        const match = extracted.find((s) => s.pageNumber === r.pageNumber);
        return {
          pageNumber: r.pageNumber,
          title: match?.title,
          text: match?.text || "",
          imageDataUrl: r.imageDataUrl,
        };
      });

      // Caso o extrator retorne slides extras (improvável), inclui sem imagem
      for (const s of extracted) {
        if (!merged.find((m) => m.pageNumber === s.pageNumber)) {
          merged.push({ ...s });
        }
      }
      merged.sort((a, b) => a.pageNumber - b.pageNumber);

      setSlides(merged);
      setSlidesFileName(data.fileName || file.name);
      persist({
        slides: merged,
        slidesFileName: data.fileName || file.name,
        slidesAddedAt: new Date().toISOString(),
      });
      if (data.demo) {
        toast.warning(`Modo demo: ${merged.length} slides com imagens renderizadas mas texto fictício. Configure ANTHROPIC_API_KEY pra extração real.`, {
          id: t,
          duration: 6000,
        });
      } else {
        toast.success(`${merged.length} slide${merged.length === 1 ? "" : "s"} anexado${merged.length === 1 ? "" : "s"} com imagens.`, { id: t });
      }
    } catch (err) {
      toast.error(`Erro ao processar PDF: ${(err as Error).message}`, { id: t });
    } finally {
      setAttaching(false);
      if (slidesInputRef.current) slidesInputRef.current.value = "";
    }
  }

  function removeSlides() {
    if (!confirm("Remover os slides anexados?")) return;
    setSlides(undefined);
    setSlidesFileName(undefined);
    persist({
      slides: undefined,
      slidesFileName: undefined,
      slidesAddedAt: undefined,
    });
    toast.success("Slides removidos.");
  }

  async function generateSummary(opts?: { silent?: boolean }) {
    if (generatingSummary) return;
    const finalTranscript = (transcript + (interim ? " " + interim : "")).trim();
    if (!finalTranscript) {
      if (!opts?.silent) {
        toast.error("Transcrição vazia. Grave a aula ou cole o texto antes.");
      }
      return;
    }
    setGeneratingSummary(true);
    const t = opts?.silent ? null : toast.loading("Gerando resumo da aula…");
    try {
      const res = await fetch("/api/correlate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          lectureTitle: lecture?.title,
          subject: subject?.name ?? "Geral",
          transcript: finalTranscript,
          slides: slides ?? undefined,
          messages: messages.map(({ role, content }) => ({ role, content, id: "", createdAt: "" })),
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.summary) {
        const msg = data?.error || `HTTP ${res.status}`;
        if (t) toast.error(`Erro: ${msg}`, { id: t });
        else toast.error(`Erro: ${msg}`);
        return;
      }
      const s: LectureSummary = data.summary;
      setSummary(s);
      persist({ summary: s, summaryUpdatedAt: s.generatedAt });
      if (data.demo) {
        if (t) toast.warning("Resumo demo gerado (sem ANTHROPIC_API_KEY).", { id: t });
      } else {
        if (t) toast.success("Resumo gerado.", { id: t });
        else toast.success("Resumo atualizado automaticamente.");
      }
      setView("summary");
    } catch (err) {
      const msg = (err as Error).message;
      if (t) toast.error(`Erro ao gerar resumo: ${msg}`, { id: t });
      else toast.error(`Erro ao gerar resumo: ${msg}`);
    } finally {
      setGeneratingSummary(false);
    }
  }

  function downloadSummaryMd() {
    if (!summary || !lecture) return;
    const md = summaryToMarkdown(lecture, subject, summary);
    const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${(lecture.title || "aula").replace(/[^\w\-]+/g, "_")}__resumo.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  async function sendMessage() {
    const text = input.trim();
    if (!text || sending) return;
    if (!lecture) return;
    const userMsg: ChatMessage = {
      id: generateId(),
      role: "user",
      content: text,
      createdAt: new Date().toISOString(),
    };
    const nextMessages = [...messages, userMsg];
    setMessages(nextMessages);
    appendMessage(user.id, lecture.id, userMsg);
    setInput("");
    setSending(true);
    setStreamingReply("");

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          messages: nextMessages.map(({ role, content }) => ({ role, content })),
          context: {
            lectureTitle: lecture.title,
            subject: subject?.name ?? "Geral",
            transcript: (transcript + (interim ? " " + interim : "")).trim(),
            slides: slides ?? undefined,
          },
        }),
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        throw new Error(errText || `HTTP ${res.status}`);
      }
      if (!res.body) throw new Error("Resposta vazia.");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let acc = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        acc += chunk;
        setStreamingReply(acc);
      }

      const assistantMsg: ChatMessage = {
        id: generateId(),
        role: "assistant",
        content: acc.trim(),
        createdAt: new Date().toISOString(),
      };
      const finalMessages = [...nextMessages, assistantMsg];
      setMessages(finalMessages);
      appendMessage(user.id, lecture.id, assistantMsg);
      setStreamingReply("");
    } catch (err) {
      console.error(err);
      toast.error("Erro ao consultar a IA. Verifique a configuração da ANTHROPIC_API_KEY.");
    } finally {
      setSending(false);
    }
  }

  if (!lecture) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const isLive = speech.state === "listening";

  return (
    <div className="mx-auto max-w-7xl px-4 py-5">
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => router.push("/dashboard")}>
          <ChevronLeft className="h-4 w-4" /> Voltar
        </Button>
        {subject && (
          <Badge variant="outline" className="gap-1.5">
            <span
              className={cn(
                "h-2 w-2 rounded-full bg-gradient-to-br shrink-0",
                subject.color,
              )}
            />
            {subject.name}
          </Badge>
        )}
        {isLive && (
          <Badge variant="live" className="gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-red-500 pulse-dot" /> AO VIVO
          </Badge>
        )}
        <div className="ml-auto flex items-center gap-1.5 flex-wrap">
          <div className="inline-flex rounded-md border border-border/70 bg-card p-0.5">
            <button
              onClick={() => setView("live")}
              className={cn(
                "px-3 py-1.5 text-xs font-medium rounded-sm transition-colors flex items-center gap-1.5",
                view === "live"
                  ? "bg-secondary text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Mic className="h-3 w-3" /> Aula
            </button>
            <button
              onClick={() => setView("summary")}
              className={cn(
                "px-3 py-1.5 text-xs font-medium rounded-sm transition-colors flex items-center gap-1.5",
                view === "summary"
                  ? "bg-secondary text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Sparkles className="h-3 w-3" /> Resumo
              {summary && (
                <span className="h-1.5 w-1.5 rounded-full bg-primary" />
              )}
            </button>
          </div>
          {view === "live" && (
            <Button variant="ghost" size="sm" onClick={saveTranscript}>
              <Save className="h-4 w-4" /> Salvar
            </Button>
          )}
          {view === "summary" && (
            <Button
              variant="gradient"
              size="sm"
              onClick={() => generateSummary()}
              disabled={generatingSummary}
            >
              {generatingSummary ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              {summary ? "Regenerar resumo" : "Gerar resumo"}
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={handleDelete}
            className="text-muted-foreground hover:text-destructive"
            title="Excluir aula"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <div className="mb-4">
        {editingTitle ? (
          <div className="flex items-center gap-2">
            <Input
              autoFocus
              value={titleDraft}
              onChange={(e) => setTitleDraft(e.target.value)}
              onBlur={saveTitle}
              onKeyDown={(e) => {
                if (e.key === "Enter") saveTitle();
                if (e.key === "Escape") {
                  setTitleDraft(lecture.title);
                  setEditingTitle(false);
                }
              }}
              className="text-xl font-semibold h-11"
            />
            <Button variant="ghost" size="icon" onClick={saveTitle}>
              <Check className="h-4 w-4" />
            </Button>
          </div>
        ) : (
          <h1
            className="text-2xl md:text-3xl font-semibold tracking-tight cursor-text hover:bg-secondary/40 rounded-md px-2 -mx-2 py-1 transition-colors"
            onClick={() => setEditingTitle(true)}
            title="Clique pra renomear"
          >
            {lecture.title}
          </h1>
        )}
      </div>

      {view === "summary" ? (
        <SummaryPane
          lecture={lecture}
          subject={subject}
          summary={summary}
          slides={slides}
          generating={generatingSummary}
          onGenerate={() => generateSummary()}
          onDownload={downloadSummaryMd}
        />
      ) : (
      <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-5 min-h-[70vh]">
        {/* TRANSCRIPT PANEL */}
        <div className="flex flex-col rounded-xl border border-border/70 bg-card overflow-hidden">
          <div className="flex items-center justify-between border-b border-border/60 px-5 py-3 bg-card gap-2 flex-wrap">
            <div className="flex items-center gap-2">
              <Mic className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium">Transcrição</span>
              {durationSec > 0 && (
                <span className="text-xs text-muted-foreground font-mono ml-2">
                  {formatDuration(durationSec)}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1.5">
              <input
                ref={slidesInputRef}
                type="file"
                accept="application/pdf"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleSlidesFile(f);
                }}
              />
              {slides && slides.length > 0 ? (
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" className="gap-2">
                      <Layers className="h-4 w-4 text-primary" />
                      <span className="max-w-[120px] truncate">
                        {slidesFileName || "Slides"}
                      </span>
                      <Badge variant="secondary" className="rounded-full px-1.5 py-0 text-[10px]">
                        {slides.length}
                      </Badge>
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent align="end" className="w-[340px] p-0">
                    <div className="flex items-center justify-between border-b border-border/60 px-3 py-2">
                      <div className="text-xs font-medium truncate">
                        {slidesFileName}
                      </div>
                      <button
                        type="button"
                        onClick={removeSlides}
                        className="text-muted-foreground hover:text-destructive transition-colors"
                        title="Remover slides"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <div className="max-h-[260px] overflow-y-auto scrollbar-thin py-1">
                      {slides.map((s) => (
                        <div
                          key={s.pageNumber}
                          className="px-3 py-2 hover:bg-secondary/40 border-b border-border/40 last:border-b-0"
                        >
                          <div className="flex items-center gap-2 text-xs font-medium">
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                              Slide {s.pageNumber}
                            </Badge>
                            {s.title && (
                              <span className="truncate">{s.title}</span>
                            )}
                          </div>
                          {s.text && (
                            <p className="mt-1 text-xs text-muted-foreground line-clamp-2 leading-snug">
                              {s.text.slice(0, 160)}
                              {s.text.length > 160 && "…"}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  </PopoverContent>
                </Popover>
              ) : (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => slidesInputRef.current?.click()}
                  disabled={attaching}
                  title="Anexar PDF dos slides"
                >
                  {attaching ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Paperclip className="h-4 w-4" />
                  )}
                  Anexar slides
                </Button>
              )}
              <Button
                variant={isLive ? "destructive" : "gradient"}
                size="sm"
                onClick={toggleRecording}
                disabled={!browserSupported && !isLive}
              >
                {isLive ? (
                  <>
                    <MicOff className="h-4 w-4" /> Pausar
                  </>
                ) : (
                  <>
                    <Mic className="h-4 w-4" /> {durationSec > 0 ? "Continuar" : "Iniciar"}
                  </>
                )}
              </Button>
            </div>
          </div>

          {!browserSupported && (
            <div className="border-b border-amber-500/30 bg-amber-500/10 px-5 py-3 text-sm text-amber-900 dark:text-amber-200 flex items-start gap-2">
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
              <span>
                Reconhecimento de voz não disponível neste navegador. Use Chrome, Edge ou Safari pra gravar — ou cole o texto manualmente abaixo.
              </span>
            </div>
          )}

          {speech.error && (
            <div className="border-b border-destructive/30 bg-destructive/10 px-5 py-3 text-sm text-destructive flex items-start gap-2">
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
              <span>{speech.error}</span>
            </div>
          )}

          <div
            ref={transcriptBoxRef}
            className="flex-1 overflow-y-auto p-5 scrollbar-thin"
          >
            {transcript || interim ? (
              <div className="text-sm leading-relaxed text-foreground whitespace-pre-wrap">
                {transcript}
                {interim && (
                  <span className="text-muted-foreground italic ml-1">
                    {" "}
                    {interim}
                  </span>
                )}
                {isLive && (
                  <span className="inline-block ml-1 h-4 w-0.5 bg-primary align-middle animate-pulse" />
                )}
              </div>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-center py-12">
                <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 ring-1 ring-primary/20">
                  <Mic className="h-6 w-6 text-primary" />
                </div>
                <p className="text-sm font-medium">Pronto pra começar?</p>
                <p className="mt-1 text-xs text-muted-foreground max-w-xs">
                  Clique em &quot;Iniciar&quot; e o Lumio começa a transcrever em tempo real. Você também pode colar o texto na caixa abaixo.
                </p>
              </div>
            )}
          </div>

          <div className="border-t border-border/60 p-3 bg-card">
            <Textarea
              placeholder="Edite ou cole a transcrição manualmente aqui…"
              value={transcript}
              onChange={(e) => setTranscript(e.target.value)}
              onBlur={() => persist({ transcript })}
              className="min-h-[80px] text-sm scrollbar-thin"
            />
          </div>
        </div>

        {/* CHAT PANEL */}
        <div className="flex flex-col rounded-xl border border-border/70 bg-card overflow-hidden">
          <div className="flex items-center justify-between border-b border-border/60 px-5 py-3">
            <div className="flex items-center gap-2">
              <Bot className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium">Chat com a aula</span>
            </div>
            <Badge variant="outline" className="gap-1 text-[10px]">
              <Sparkles className="h-2.5 w-2.5 text-primary" /> Claude
            </Badge>
          </div>

          <div
            ref={chatBoxRef}
            className="flex-1 overflow-y-auto p-4 space-y-3 scrollbar-thin"
          >
            {messages.length === 0 && !streamingReply && (
              <div className="h-full flex flex-col items-center justify-center text-center py-12">
                <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 ring-1 ring-primary/20">
                  <Bot className="h-5 w-5 text-primary" />
                </div>
                <p className="text-sm font-medium">Pergunte sobre a aula</p>
                <p className="mt-1 text-xs text-muted-foreground max-w-[260px]">
                  A IA enxerga toda a transcrição. Tire dúvidas, peça resumos ou explicações.
                </p>
                <div className="mt-5 flex flex-wrap gap-2 justify-center max-w-sm">
                  {SUGGESTED_PROMPTS.map((p) => (
                    <button
                      key={p}
                      onClick={() => setInput(p)}
                      className="text-xs rounded-full border border-border/60 bg-background hover:bg-secondary/60 px-3 py-1.5 text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((m) => (
              <ChatBubble key={m.id} message={m} />
            ))}
            {streamingReply && (
              <ChatBubble
                message={{
                  id: "streaming",
                  role: "assistant",
                  content: streamingReply,
                  createdAt: new Date().toISOString(),
                }}
                streaming
              />
            )}
          </div>

          <div className="border-t border-border/60 p-3 bg-card">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                sendMessage();
              }}
              className="flex items-end gap-2"
            >
              <Textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    sendMessage();
                  }
                }}
                placeholder={
                  transcript
                    ? "Pergunte sobre a aula…"
                    : "Pergunte algo (transcreva primeiro pra IA ter contexto)…"
                }
                className="min-h-[44px] max-h-[160px] text-sm resize-none"
                rows={1}
              />
              <Button
                type="submit"
                variant="gradient"
                size="icon"
                disabled={sending || !input.trim()}
              >
                {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </Button>
            </form>
          </div>
        </div>
      </div>
      )}
    </div>
  );
}

function SummaryPane({
  lecture,
  subject,
  summary,
  slides,
  generating,
  onGenerate,
  onDownload,
}: {
  lecture: Lecture;
  subject: Subject | null;
  summary: LectureSummary | undefined;
  slides: Slide[] | undefined;
  generating: boolean;
  onGenerate: () => void;
  onDownload: () => void;
}) {
  if (generating && !summary) {
    return (
      <div className="rounded-xl border border-border/70 bg-card p-12 text-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto mb-4" />
        <h3 className="text-base font-semibold">Gerando resumo da aula…</h3>
        <p className="text-sm text-muted-foreground mt-2">
          A IA está correlacionando a transcrição
          {slides && slides.length > 0 ? `, os ${slides.length} slides` : ""}
          {lecture.messages.length > 0 ? " e as perguntas do chat" : ""}.
          Pode levar alguns segundos.
        </p>
      </div>
    );
  }
  if (!summary) {
    return (
      <div className="rounded-xl border border-dashed border-border/60 bg-card/40 p-12 text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 ring-1 ring-primary/20">
          <Sparkles className="h-6 w-6 text-primary" />
        </div>
        <h3 className="text-base font-semibold">Nenhum resumo ainda</h3>
        <p className="text-sm text-muted-foreground mt-2 max-w-md mx-auto">
          O resumo é gerado automaticamente quando você pausa a gravação.
          Você também pode gerar manualmente quando quiser.
        </p>
        <Button onClick={onGenerate} variant="gradient" size="lg" className="mt-6" disabled={generating}>
          <Sparkles className="h-4 w-4" /> Gerar resumo agora
        </Button>
      </div>
    );
  }
  return (
    <LectureSummaryView
      lecture={lecture}
      subject={subject}
      summary={summary}
      slides={slides}
      onDownloadMarkdown={onDownload}
    />
  );
}

function ChatBubble({ message, streaming }: { message: ChatMessage; streaming?: boolean }) {
  const isUser = message.role === "user";
  return (
    <div className={cn("flex gap-2", isUser ? "justify-end" : "justify-start")}>
      {!isUser && (
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary to-violet-500 mt-0.5">
          <Bot className="h-3.5 w-3.5 text-white" />
        </div>
      )}
      <div
        className={cn(
          "max-w-[85%] rounded-lg px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-wrap",
          isUser
            ? "bg-primary text-primary-foreground rounded-br-sm"
            : "bg-secondary/70 text-foreground rounded-bl-sm",
        )}
      >
        {message.content}
        {streaming && (
          <span className="inline-block ml-1 h-3 w-0.5 bg-current animate-pulse align-middle" />
        )}
      </div>
      {isUser && (
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-secondary border border-border/60 mt-0.5">
          <UserIcon className="h-3.5 w-3.5 text-muted-foreground" />
        </div>
      )}
    </div>
  );
}

const SUGGESTED_PROMPTS = [
  "Faz um resumo da aula",
  "Quais os pontos principais?",
  "Crie 5 questões pra revisão",
  "Explica de novo a parte mais difícil",
];
