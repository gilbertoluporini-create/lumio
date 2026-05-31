"use client";

import { Bot, Download, MessageSquare, MicVocal, Quote, Sparkles } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { ZoomableImage } from "@/components/ui/zoomable-image";
import type {
  Lecture,
  LectureSummary,
  LectureSummarySection,
  Slide,
  Subject,
} from "@/lib/types";
import { cn } from "@/lib/utils";

export function LectureSummaryView({
  lecture,
  subject,
  summary,
  slides,
  onDownloadMarkdown,
}: {
  lecture: Lecture;
  subject: Subject | null;
  summary: LectureSummary;
  slides?: Slide[];
  onDownloadMarkdown?: () => void;
}) {
  const slideMap = new Map<number, Slide>();
  (slides || []).forEach((s) => slideMap.set(s.pageNumber, s));

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-border/70 bg-gradient-to-br from-primary/5 via-card to-fuchsia-500/5 p-6 overflow-hidden relative">
        <div className="absolute inset-0 grid-bg opacity-30" />
        <div className="relative">
          <div className="flex items-start justify-between gap-3 flex-wrap mb-3">
            <div className="flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-fuchsia-500 shadow">
                <Sparkles className="h-4 w-4 text-white" />
              </div>
              <div>
                <h2 className="text-lg font-semibold tracking-tight">
                  Resumo da aula
                </h2>
                <p className="text-xs text-muted-foreground">
                  Gerado pelo Lumio a partir da transcrição
                  {slides && slides.length > 0 ? " + slides do professor" : ""}
                  {lecture.messages.length > 0 ? " + chat" : ""}
                </p>
              </div>
            </div>
            {onDownloadMarkdown && (
              <Button variant="outline" size="sm" onClick={onDownloadMarkdown}>
                <Download className="h-4 w-4" /> Baixar .md
              </Button>
            )}
          </div>
          {summary.generalSummary && (
            <p className="text-sm leading-relaxed text-foreground/90">
              {summary.generalSummary}
            </p>
          )}
        </div>
      </div>

      {summary.highlights && summary.highlights.length > 0 && (
        <div className="rounded-xl border border-border/70 bg-card p-5">
          <div className="flex items-center gap-2 mb-3">
            <Badge variant="outline" className="gap-1">
              <Sparkles className="h-3 w-3 text-primary" /> Pontos centrais
            </Badge>
          </div>
          <ul className="space-y-2 text-sm">
            {summary.highlights.map((h, i) => (
              <li key={i} className="flex gap-2.5">
                <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
                <span className="leading-relaxed">
                  <MarkdownInline content={h} />
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {summary.sections.length > 0 && (
        <div className="space-y-5">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground px-1">
            {slides && slides.length > 0
              ? "Slide por slide"
              : "Tópicos da aula"}
          </h3>
          {summary.sections.map((section, idx) => (
            <SectionCard
              key={`${section.slideNumber ?? "free"}-${idx}`}
              section={section}
              slide={
                section.slideNumber ? slideMap.get(section.slideNumber) : undefined
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}

function SectionCard({
  section,
  slide,
}: {
  section: LectureSummarySection;
  slide?: Slide;
}) {
  return (
    <div className="rounded-xl border border-border/70 bg-card overflow-hidden">
      <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)] divide-y md:divide-y-0 md:divide-x divide-border/60">
        {/* SLIDE PREVIEW */}
        <div className="p-4 bg-secondary/20">
          {slide?.imageDataUrl ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-[10px]">
                  Slide {section.slideNumber}
                </Badge>
                {section.slideTitle && (
                  <span className="text-xs font-medium truncate">
                    {section.slideTitle}
                  </span>
                )}
              </div>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={slide.imageDataUrl}
                alt={`Slide ${section.slideNumber}`}
                className="w-full rounded-md border border-border/60 shadow-sm"
                loading="lazy"
              />
              {slide.text && (
                <details className="text-xs text-muted-foreground">
                  <summary className="cursor-pointer hover:text-foreground">
                    Texto do slide
                  </summary>
                  <pre className="whitespace-pre-wrap mt-2 leading-relaxed font-sans">
                    {slide.text}
                  </pre>
                </details>
              )}
            </div>
          ) : section.slideNumber ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-[10px]">
                  Slide {section.slideNumber}
                </Badge>
                {section.slideTitle && (
                  <span className="text-xs font-medium">{section.slideTitle}</span>
                )}
              </div>
              {slide?.text ? (
                <pre className="whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground font-sans">
                  {slide.text}
                </pre>
              ) : (
                <p className="text-xs text-muted-foreground italic">
                  Slide sem imagem renderizada.
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              <Badge variant="outline" className="text-[10px]">
                <Quote className="h-2.5 w-2.5" /> Tópico
              </Badge>
              {section.slideTitle && (
                <p className="text-sm font-medium">{section.slideTitle}</p>
              )}
              <p className="text-xs text-muted-foreground italic">
                Sem slide associado.
              </p>
            </div>
          )}
        </div>

        {/* CONTEÚDO FALADO + Q&A */}
        <div className="p-5 space-y-4">
          <div>
            <div className="flex items-center gap-2 mb-2 text-xs uppercase tracking-wider text-muted-foreground font-medium">
              <MicVocal className="h-3 w-3 text-primary" />
              O que o professor falou
            </div>
            <div className="prose prose-sm dark:prose-invert max-w-none prose-p:leading-relaxed prose-strong:text-foreground">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  img: ({ src, alt }) => (
                    <ZoomableImage
                      src={typeof src === "string" ? src : ""}
                      alt={alt ?? undefined}
                    />
                  ),
                }}
              >
                {section.spokenContent || "*Sem cobertura na transcrição.*"}
              </ReactMarkdown>
            </div>
          </div>

          {section.relatedQA.length > 0 && (
            <>
              <Separator />
              <div>
                <div className="flex items-center gap-2 mb-3 text-xs uppercase tracking-wider text-muted-foreground font-medium">
                  <MessageSquare className="h-3 w-3 text-primary" />
                  Perguntas durante a aula
                </div>
                <div className="space-y-3">
                  {section.relatedQA.map((qa, i) => (
                    <div
                      key={i}
                      className="rounded-lg border border-border/60 bg-secondary/30 p-3 space-y-2"
                    >
                      <div className="flex gap-2 items-start">
                        <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-secondary border border-border/60 mt-0.5">
                          <span className="text-[10px] font-bold">P</span>
                        </div>
                        <p className="text-sm font-medium leading-relaxed">
                          {qa.question}
                        </p>
                      </div>
                      <div className="flex gap-2 items-start pl-1">
                        <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary to-violet-500 mt-0.5">
                          <Bot className="h-2.5 w-2.5 text-white" />
                        </div>
                        <div className="text-sm text-muted-foreground leading-relaxed prose prose-sm dark:prose-invert max-w-none prose-p:my-0">
                          <ReactMarkdown
                            remarkPlugins={[remarkGfm]}
                            components={{
                              img: ({ src, alt }) => (
                                <ZoomableImage
                                  src={typeof src === "string" ? src : ""}
                                  alt={alt ?? undefined}
                                />
                              ),
                            }}
                          >
                            {qa.answer}
                          </ReactMarkdown>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function MarkdownInline({ content }: { content: string }) {
  return (
    <span
      className={cn("inline")}
      dangerouslySetInnerHTML={{
        __html: content
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
          .replace(/\*([^*]+)\*/g, "<em>$1</em>")
          .replace(/`([^`]+)`/g, "<code class='px-1 py-0.5 rounded bg-secondary text-xs'>$1</code>"),
      }}
    />
  );
}

export function summaryToMarkdown(
  lecture: Lecture,
  subject: Subject | null,
  summary: LectureSummary,
): string {
  const lines: string[] = [];
  lines.push(`# ${lecture.title}`);
  if (subject) lines.push(`*${subject.name}*`);
  lines.push("");
  if (summary.generalSummary) {
    lines.push(summary.generalSummary);
    lines.push("");
  }
  if (summary.highlights.length > 0) {
    lines.push("## Pontos centrais");
    for (const h of summary.highlights) lines.push(`- ${h}`);
    lines.push("");
  }
  for (const sec of summary.sections) {
    const heading = sec.slideNumber
      ? `## Slide ${sec.slideNumber}${sec.slideTitle ? ` — ${sec.slideTitle}` : ""}`
      : `## ${sec.slideTitle || "Tópico"}`;
    lines.push(heading);
    lines.push("");
    lines.push("**O que o professor falou:**");
    lines.push("");
    lines.push(sec.spokenContent || "*Sem cobertura na transcrição.*");
    lines.push("");
    if (sec.relatedQA.length > 0) {
      lines.push("**Perguntas durante a aula:**");
      lines.push("");
      for (const qa of sec.relatedQA) {
        lines.push(`> **P:** ${qa.question}`);
        lines.push(`>`);
        lines.push(`> **R:** ${qa.answer}`);
        lines.push("");
      }
    }
  }
  return lines.join("\n");
}
