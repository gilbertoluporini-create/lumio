"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  BookOpen,
  Clock,
  FileText,
  Mic,
  MoreVertical,
  Plus,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { AuthGuard } from "@/components/app/auth-guard";
import { AppShell } from "@/components/app/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  createLecture,
  createSubject,
  deleteSubject,
  listLectures,
  listSubjects,
} from "@/lib/storage";
import {
  DEFAULT_EMOJIS,
  SUBJECT_PALETTE,
  type Lecture,
  type Subject,
  type User,
} from "@/lib/types";
import { cn, formatDuration, formatRelativeTime } from "@/lib/utils";

export default function DashboardPage() {
  return (
    <AuthGuard>
      {(user) => (
        <AppShell user={user}>
          <Dashboard user={user} />
        </AppShell>
      )}
    </AuthGuard>
  );
}

function Dashboard({ user }: { user: User }) {
  const router = useRouter();
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [lectures, setLectures] = useState<Lecture[]>([]);
  const [activeSubject, setActiveSubject] = useState<string | "all">("all");
  const [newOpen, setNewOpen] = useState(false);
  const [lectureOpen, setLectureOpen] = useState(false);
  const [lectureTitle, setLectureTitle] = useState("");
  const [lectureSubject, setLectureSubject] = useState<string>("");
  const [newName, setNewName] = useState("");
  const [emoji, setEmoji] = useState(DEFAULT_EMOJIS[0]);
  const [paletteIdx, setPaletteIdx] = useState(0);

  function refresh() {
    setSubjects(listSubjects(user.id));
    setLectures(listLectures(user.id));
  }

  useEffect(() => {
    refresh();
  }, []); // eslint-disable-line

  const filtered = useMemo(() => {
    return activeSubject === "all"
      ? lectures
      : lectures.filter((l) => l.subjectId === activeSubject);
  }, [lectures, activeSubject]);

  function handleCreateSubject() {
    if (!newName.trim()) return;
    const subject = createSubject(user.id, {
      name: newName.trim(),
      emoji,
      color: SUBJECT_PALETTE[paletteIdx].color,
    });
    setNewName("");
    setEmoji(DEFAULT_EMOJIS[0]);
    setPaletteIdx(0);
    setNewOpen(false);
    refresh();
    setActiveSubject(subject.id);
    toast.success(`Matéria "${subject.name}" criada.`);
  }

  function handleDeleteSubject(s: Subject) {
    if (!confirm(`Excluir a matéria "${s.name}" e todas suas aulas? Esta ação não pode ser desfeita.`)) {
      return;
    }
    deleteSubject(user.id, s.id);
    setActiveSubject("all");
    refresh();
    toast.success("Matéria excluída.");
  }

  function startNewLecture() {
    if (subjects.length === 0) {
      toast.error("Crie uma matéria primeiro.");
      setNewOpen(true);
      return;
    }
    setLectureTitle("");
    setLectureSubject(activeSubject === "all" ? subjects[0].id : activeSubject);
    setLectureOpen(true);
  }

  function handleCreateLecture() {
    const title = lectureTitle.trim() || `Aula ${new Date().toLocaleDateString("pt-BR")}`;
    if (!lectureSubject) {
      toast.error("Escolha uma matéria.");
      return;
    }
    const lecture = createLecture(user.id, {
      subjectId: lectureSubject,
      title,
      status: "draft",
    });
    setLectureOpen(false);
    router.push(`/lecture/${lecture.id}`);
  }

  const currentSubject = subjects.find((s) => s.id === activeSubject);

  return (
    <div className="mx-auto max-w-7xl px-5 py-8">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between mb-8">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">
            Olá, {user.name.split(" ")[0]} 👋
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {lectures.length === 0
              ? "Vamos começar sua primeira aula?"
              : `Você tem ${lectures.length} aula${lectures.length === 1 ? "" : "s"} salvas em ${subjects.length} matéria${subjects.length === 1 ? "" : "s"}.`}
          </p>
        </div>
        <div className="flex gap-2">
          <Dialog open={newOpen} onOpenChange={setNewOpen}>
            <DialogTrigger asChild>
              <Button variant="outline">
                <Plus className="h-4 w-4" /> Nova matéria
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Nova matéria</DialogTitle>
                <DialogDescription>
                  Escolha um nome, emoji e cor pra essa pasta.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className="h-10 w-10 rounded-md border border-border/70 bg-background flex items-center justify-center text-xl hover:bg-secondary"
                    onClick={() => {
                      const idx = DEFAULT_EMOJIS.indexOf(emoji);
                      setEmoji(DEFAULT_EMOJIS[(idx + 1) % DEFAULT_EMOJIS.length]);
                    }}
                  >
                    {emoji}
                  </button>
                  <button
                    type="button"
                    className={cn(
                      "h-10 w-10 rounded-md border border-border/70 bg-gradient-to-br",
                      SUBJECT_PALETTE[paletteIdx].color,
                    )}
                    onClick={() => setPaletteIdx((paletteIdx + 1) % SUBJECT_PALETTE.length)}
                  />
                  <Input
                    autoFocus
                    placeholder="Ex: Cálculo, Anatomia..."
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleCreateSubject()}
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Toque no emoji ou cor pra trocar.
                </p>
              </div>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setNewOpen(false)}>
                  Cancelar
                </Button>
                <Button variant="gradient" onClick={handleCreateSubject}>
                  Criar matéria
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          <Button variant="gradient" onClick={startNewLecture}>
            <Mic className="h-4 w-4" /> Nova aula
          </Button>
        </div>
      </div>

      <div className="mb-6 flex flex-wrap gap-2">
        <button
          onClick={() => setActiveSubject("all")}
          className={cn(
            "rounded-full border px-3.5 py-1.5 text-sm transition-all",
            activeSubject === "all"
              ? "border-primary/60 bg-primary/10 text-foreground"
              : "border-border/60 hover:border-border bg-background hover:bg-secondary/40 text-muted-foreground",
          )}
        >
          Todas ({lectures.length})
        </button>
        {subjects.map((s) => {
          const count = lectures.filter((l) => l.subjectId === s.id).length;
          const active = activeSubject === s.id;
          return (
            <button
              key={s.id}
              onClick={() => setActiveSubject(s.id)}
              className={cn(
                "group inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition-all",
                active
                  ? "border-primary/60 bg-primary/10 text-foreground"
                  : "border-border/60 hover:border-border bg-background hover:bg-secondary/40 text-muted-foreground",
              )}
            >
              <span
                className={cn(
                  "flex h-5 w-5 items-center justify-center rounded-full bg-gradient-to-br text-xs",
                  s.color,
                )}
              >
                {s.emoji}
              </span>
              {s.name} <span className="opacity-60">({count})</span>
            </button>
          );
        })}
      </div>

      {currentSubject && (
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className={cn(
                "flex h-12 w-12 items-center justify-center rounded-lg bg-gradient-to-br text-2xl",
                currentSubject.color,
              )}
            >
              {currentSubject.emoji}
            </div>
            <div>
              <h2 className="text-xl font-semibold">{currentSubject.name}</h2>
              <p className="text-xs text-muted-foreground">
                {filtered.length} aula{filtered.length === 1 ? "" : "s"} salva{filtered.length === 1 ? "" : "s"}
              </p>
            </div>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onClick={() => handleDeleteSubject(currentSubject)}
                className="text-destructive focus:text-destructive"
              >
                <Trash2 /> Excluir matéria
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}

      {filtered.length === 0 ? (
        <EmptyState onNew={startNewLecture} hasSubjects={subjects.length > 0} />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((l) => {
            const subject = subjects.find((s) => s.id === l.subjectId);
            return (
              <Link key={l.id} href={`/lecture/${l.id}`}>
                <Card className="group h-full transition-all hover:border-primary/40 hover:shadow-lg hover:-translate-y-0.5 cursor-pointer">
                  <CardContent className="p-5">
                    <div className="flex items-start justify-between gap-2 mb-3">
                      {subject && (
                        <Badge variant="outline" className="gap-1.5">
                          <span
                            className={cn(
                              "flex h-3.5 w-3.5 items-center justify-center rounded-full bg-gradient-to-br text-[10px]",
                              subject.color,
                            )}
                          >
                            {subject.emoji}
                          </span>
                          {subject.name}
                        </Badge>
                      )}
                      {l.status === "live" && (
                        <Badge variant="live" className="gap-1">
                          <span className="h-1.5 w-1.5 rounded-full bg-red-500 pulse-dot" />
                          AO VIVO
                        </Badge>
                      )}
                    </div>
                    <h3 className="font-semibold text-base line-clamp-2 group-hover:text-primary transition-colors">
                      {l.title}
                    </h3>
                    {l.transcript && (
                      <p className="mt-2 text-sm text-muted-foreground line-clamp-3 leading-relaxed">
                        {l.transcript.slice(0, 180)}
                        {l.transcript.length > 180 && "…"}
                      </p>
                    )}
                    <div className="mt-4 flex items-center gap-4 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        <Clock className="h-3 w-3" /> {formatRelativeTime(l.createdAt)}
                      </span>
                      {l.durationSec > 0 && (
                        <span className="inline-flex items-center gap-1">
                          <Mic className="h-3 w-3" /> {formatDuration(l.durationSec)}
                        </span>
                      )}
                      {l.messages.length > 0 && (
                        <span className="inline-flex items-center gap-1">
                          <FileText className="h-3 w-3" /> {l.messages.length} msg
                        </span>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}

      <Dialog open={lectureOpen} onOpenChange={setLectureOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nova aula</DialogTitle>
            <DialogDescription>
              Em segundos a transcrição começa.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="title">Título</Label>
              <Input
                id="title"
                autoFocus
                value={lectureTitle}
                onChange={(e) => setLectureTitle(e.target.value)}
                placeholder={`Aula ${new Date().toLocaleDateString("pt-BR")}`}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Matéria</Label>
              <div className="flex flex-wrap gap-2">
                {subjects.map((s) => {
                  const sel = s.id === lectureSubject;
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => setLectureSubject(s.id)}
                      className={cn(
                        "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition-all",
                        sel
                          ? "border-primary bg-primary/10 text-foreground"
                          : "border-border/60 bg-background hover:bg-secondary/40",
                      )}
                    >
                      <span
                        className={cn(
                          "flex h-5 w-5 items-center justify-center rounded-full bg-gradient-to-br text-xs",
                          s.color,
                        )}
                      >
                        {s.emoji}
                      </span>
                      {s.name}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setLectureOpen(false)}>
              Cancelar
            </Button>
            <Button variant="gradient" onClick={handleCreateLecture}>
              <Mic className="h-4 w-4" /> Começar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function EmptyState({ onNew, hasSubjects }: { onNew: () => void; hasSubjects: boolean }) {
  return (
    <div className="rounded-xl border border-dashed border-border/60 bg-card/40 px-8 py-16 text-center">
      <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 ring-1 ring-primary/20">
        <BookOpen className="h-7 w-7 text-primary" />
      </div>
      <h3 className="text-lg font-semibold">Nenhuma aula ainda</h3>
      <p className="mt-2 text-sm text-muted-foreground max-w-md mx-auto">
        Grave sua primeira aula e deixe o Lumio transcrever pra você. Em tempo real, com chat IA pra perguntar sobre o que está sendo dito.
      </p>
      <Button onClick={onNew} variant="gradient" size="lg" className="mt-6">
        <Mic className="h-4 w-4" /> {hasSubjects ? "Iniciar primeira aula" : "Começar agora"}
      </Button>
    </div>
  );
}
