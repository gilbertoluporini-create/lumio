"use client";

import { createElement, use, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Calendar,
  ChevronRight,
  Folder as FolderIcon,
  FolderInput,
  FolderPlus,
  Clock,
  FileText,
  HelpCircle,
  Layers,
  MapPin,
  Mic,
  MoreHorizontal,
  Network,
  Pencil,
  Plus,
  Sparkles,
  Star,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { AuthGuard } from "@/components/app/auth-guard";
import { AppShell } from "@/components/app/app-shell";
import { BackToHub } from "@/components/app/back-to-hub";
import { LumiCharacter } from "@/components/brand/lumi";
import { LumiIcon, type LumiIconName } from "@/components/brand/lumi-icon";
import { getSubjectIcon } from "@/lib/subject-icon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { confirmAction } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ContentWizard } from "@/components/ai/content-wizard";
import { MindmapQuickDialog } from "@/components/ai/mindmap-quick-dialog";
import {
  createLectureAsync,
  deleteLectureAsync,
  deleteSubjectAsync,
  getSubjectAsync,
  listLecturesAsync,
  listSubjectsAsync,
} from "@/lib/db";
import { listSummariesAsync } from "@/lib/summaries";
import { deleteDocumentAsync, listDocumentsAsync } from "@/lib/documents";
import { subscribeFavorites, toggleFavorite } from "@/lib/favorites";
import {
  MoveToFolderDialog,
  type MoveTarget,
} from "@/components/documents/move-to-folder-dialog";
import { UploadDocumentDialog } from "@/components/documents/upload-document-dialog";
import {
  createFolderAsync,
  deleteFolderAsync,
  listFoldersBySubjectAsync,
  renameFolderAsync,
  buildBreadcrumb,
} from "@/lib/folders";
import {
  DAY_LABELS_LONG,
  type Document as LumioDocument,
  type Folder,
  type Lecture,
  type Subject,
  type Summary,
  type User,
} from "@/lib/types";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn, formatDuration, formatRelativeTime } from "@/lib/utils";

type SubjectAsset = {
  id: string;
  lecture_id: string;
  folder_id: string | null;
  kind: "flashcards" | "quiz" | "mindmap";
  payload: {
    cards?: unknown[];
    questions?: unknown[];
    centralTopic?: string;
    branches?: unknown[];
  };
  created_at: string;
  updated_at: string;
};

type FilterKey =
  | "all"
  | "lectures"
  | "summaries"
  | "flashcards"
  | "quiz"
  | "mindmap"
  | "documents";

export default function SubjectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  return (
    <AuthGuard>
      {(user) => (
        <AppShell user={user}>
          <SubjectView user={user} subjectId={id} />
        </AppShell>
      )}
    </AuthGuard>
  );
}

function SubjectView({
  user,
  subjectId,
}: {
  user: User;
  subjectId: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const currentFolderId = searchParams.get("folder") ?? null;

  const [subject, setSubject] = useState<Subject | null>(null);
  const [lectures, setLectures] = useState<Lecture[]>([]);
  const [summaries, setSummaries] = useState<Summary[]>([]);
  const [documents, setDocuments] = useState<LumioDocument[]>([]);
  const [assets, setAssets] = useState<SubjectAsset[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [loading, setLoading] = useState(true);
  const [newOpen, setNewOpen] = useState(false);
  const [lectureTitle, setLectureTitle] = useState("");
  // Diálogos de pasta: criar (input no contexto da pasta atual) e renomear
  // (input pra renomear pasta existente).
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [uploadDocOpen, setUploadDocOpen] = useState(false);
  const [renamingFolder, setRenamingFolder] = useState<Folder | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  // Mindmap usa dialog próprio (mais simples — só complexidade + foco).
  // Outros modes continuam no ContentWizard cheio.
  const [wizardMode, setWizardMode] = useState<
    "summary" | "flashcards" | "quiz" | null
  >(null);
  const [mindmapOpen, setMindmapOpen] = useState(false);
  // Documento aberto no modal de info (PDFs da matéria). Clicar num PDF abre
  // esse modal em vez de navegar pra tela de texto extraído.
  const [docDialog, setDocDialog] = useState<LumioDocument | null>(null);
  const [deletingDoc, setDeletingDoc] = useState(false);
  // Filtro da pasta: "all" mostra tudo; senão isola uma categoria.
  const [filter, setFilter] = useState<FilterKey>("all");
  // Favoritos de arquivos — ids unificados (ex.: "asset:uuid", "document:uuid",
  // "summary:uuid"), os mesmos resolvidos pela aba Favoritos.
  const [favIds, setFavIds] = useState<Set<string>>(new Set());
  // Todas as matérias (pra mover arquivos entre pastas) + alvo do mover.
  const [allSubjects, setAllSubjects] = useState<Subject[]>([]);
  const [moveTarget, setMoveTarget] = useState<MoveTarget | null>(null);

  useEffect(() => {
    return subscribeFavorites(user.id, (entries) => {
      setFavIds(
        new Set(
          entries.filter((e) => e.kind === "document").map((e) => e.id),
        ),
      );
    });
  }, [user.id]);

  const toggleFav = (id: string) => {
    const nowFav = toggleFavorite(user.id, "document", id);
    toast.success(nowFav ? "Adicionado aos favoritos." : "Removido dos favoritos.");
  };

  const moveSummary = (sm: Summary) =>
    setMoveTarget({
      kind: "summary",
      id: sm.id,
      title: sm.title ?? "Resumo",
      currentSubjectId: subjectId,
      currentFolderId: sm.folderId ?? null,
    });
  const moveDocument = (d: LumioDocument) =>
    setMoveTarget({
      kind: "document",
      id: d.id,
      title: d.title,
      currentSubjectId: subjectId,
      currentFolderId: d.folderId ?? null,
    });
  const handleDeleteAsset = async (a: SubjectAsset) => {
    const label =
      a.kind === "flashcards"
        ? "esse conjunto de flashcards"
        : a.kind === "quiz"
          ? "esse quiz"
          : "esse mapa mental";
    const ok = await confirmAction({
      title: `Excluir ${label}?`,
      description: "A fonte original (aula ou PDF) permanece. Só esse asset some.",
      destructive: true,
      confirmText: "Excluir",
    });
    if (!ok) return;
    const { createClient } = await import("@/lib/supabase/client");
    const supabase = createClient();
    const { error } = await supabase
      .from("lecture_assets")
      .delete()
      .eq("id", a.id)
      .eq("user_id", user.id);
    if (error) {
      toast.error(`Erro ao excluir: ${error.message}`);
      return;
    }
    setAssets((prev) => prev.filter((x) => x.id !== a.id));
    toast.success("Excluído.");
  };

  const moveAsset = (a: SubjectAsset) => {
    const lec = lectures.find((l) => l.id === a.lecture_id);
    setMoveTarget({
      kind: "lecture",
      id: a.lecture_id,
      title:
        a.kind === "flashcards"
          ? "Flashcards"
          : a.kind === "quiz"
            ? "Quiz"
            : "Mapa mental",
      currentSubjectId: subjectId,
      currentFolderId: lec?.folderId ?? a.folder_id ?? null,
      note: "Isso move a aula inteira deste material (transcrição, resumo e outros materiais gerados) pra nova pasta.",
    });
  };

  async function refresh() {
    const [s, l, sm, d, all, fld] = await Promise.all([
      getSubjectAsync(user.id, subjectId),
      listLecturesAsync(user.id, subjectId),
      listSummariesAsync(user.id, subjectId),
      listDocumentsAsync(user.id, subjectId),
      listSubjectsAsync(user.id),
      listFoldersBySubjectAsync(user.id, subjectId),
    ]);
    setSubject(s);
    setLectures(l);
    setSummaries(sm);
    setDocuments(d);
    setAllSubjects(all);
    setFolders(fld);

    // Busca todos os assets (flashcards/quiz/mindmap) das aulas dessa matéria
    // pra que apareçam na pasta — antes o user gerava um quiz e ele "sumia"
    // (estava no DB mas a pasta da matéria não listava).
    try {
      const lectureIds = l.map((x) => x.id);
      if (lectureIds.length > 0) {
        const { createClient } = await import("@/lib/supabase/client");
        const supabase = createClient();
        const { data: rows, error } = await supabase
          .from("lecture_assets")
          .select("id, lecture_id, folder_id, kind, payload, created_at, updated_at")
          .eq("user_id", user.id)
          .in("lecture_id", lectureIds)
          .is("deleted_at", null)
          .order("updated_at", { ascending: false });
        if (!error && rows) {
          setAssets(rows as SubjectAsset[]);
        }
      } else {
        setAssets([]);
      }
    } catch (err) {
      console.warn("[subject] assets fetch failed", err);
    }
  }

  async function handleCreateFolder() {
    const name = newFolderName.trim();
    if (!name) return;
    const created = await createFolderAsync({
      userId: user.id,
      subjectId,
      parentFolderId: currentFolderId,
      name,
    });
    if (!created) {
      toast.error("Não foi possível criar a pasta. Talvez já exista uma com esse nome.");
      return;
    }
    setNewFolderName("");
    setNewFolderOpen(false);
    await refresh();
    toast.success(`Pasta "${created.name}" criada.`);
  }

  async function handleRenameFolder() {
    if (!renamingFolder) return;
    const name = renameDraft.trim();
    if (!name) return;
    const ok = await renameFolderAsync(user.id, renamingFolder.id, name);
    if (!ok) {
      toast.error("Não foi possível renomear.");
      return;
    }
    setRenamingFolder(null);
    setRenameDraft("");
    await refresh();
    toast.success("Pasta renomeada.");
  }

  async function handleDeleteFolder(f: Folder) {
    if (
      !confirm(
        `Excluir a pasta "${f.name}"? Subpastas e arquivos dentro dela voltam pra raiz da matéria — nada é apagado.`,
      )
    )
      return;
    const ok = await deleteFolderAsync(user.id, f.id);
    if (!ok) {
      toast.error("Não foi possível excluir a pasta.");
      return;
    }
    // Se estava dentro da pasta deletada, sobe um nível.
    if (currentFolderId === f.id) {
      const parent = f.parentFolderId;
      router.push(parent ? `/subject/${subjectId}?folder=${parent}` : `/subject/${subjectId}`);
    }
    await refresh();
    toast.success("Pasta excluída.");
  }

  useEffect(() => {
    refresh().finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subjectId]);

  async function handleCreate() {
    const title =
      lectureTitle.trim() || `Aula ${new Date().toLocaleDateString("pt-BR")}`;
    try {
      const lecture = await createLectureAsync(user.id, {
        subjectId,
        title,
        folderId: currentFolderId,
      });
      setNewOpen(false);
      router.push(`/lecture/${lecture.id}`);
    } catch (err) {
      toast.error(`Erro: ${(err as Error).message}`);
    }
  }

  async function handleDeleteLecture(l: Lecture) {
    const ok = await confirmAction({
      title: `Excluir a aula "${l.title}"?`,
      description: "Não dá pra desfazer.",
      destructive: true,
      confirmText: "Excluir aula",
    });
    if (!ok) return;
    try {
      await deleteLectureAsync(user.id, l.id);
      await refresh();
      toast.success("Aula excluída.");
    } catch (err) {
      toast.error(`Erro: ${(err as Error).message}`);
    }
  }

  async function handleDeleteDocument(d: LumioDocument) {
    const ok = await confirmAction({
      title: `Excluir o documento "${d.title}"?`,
      description:
        "O resumo gerado a partir dele também será removido. Não dá pra desfazer.",
      destructive: true,
      confirmText: "Excluir documento",
    });
    if (!ok) return;
    setDeletingDoc(true);
    try {
      await deleteDocumentAsync(user.id, d.id);
      setDocDialog(null);
      await refresh();
      toast.success("Documento excluído.");
    } catch (err) {
      toast.error(`Erro: ${(err as Error).message}`);
    } finally {
      setDeletingDoc(false);
    }
  }

  async function handleDeleteSubject() {
    if (!subject) return;
    const ok = await confirmAction({
      title: `Excluir a matéria "${subject.name}"?`,
      description: "Todas as aulas, resumos e assets dela serão removidos. Não dá pra desfazer.",
      destructive: true,
      confirmText: "Excluir matéria",
    });
    if (!ok) return;
    try {
      await deleteSubjectAsync(user.id, subjectId);
      toast.success("Matéria excluída.");
      router.push("/dashboard");
    } catch (err) {
      toast.error(`Erro: ${(err as Error).message}`);
    }
  }

  const stats = useMemo(() => {
    const totalMin = Math.floor(
      lectures.reduce((acc, l) => acc + l.durationSec, 0) / 60,
    );
    const withSlides = lectures.filter(
      (l) => (l.slides?.length ?? 0) > 0,
    ).length;
    const withSummary = summaries.length;
    const totalMsgs = lectures.reduce((acc, l) => acc + l.messages.length, 0);
    return { totalMin, withSlides, withSummary, totalMsgs };
  }, [lectures, summaries]);

  const lectureIdsWithSummary = useMemo(() => {
    const set = new Set<string>();
    for (const sm of summaries) {
      if (sm.source.kind === "lecture") set.add(sm.source.lectureId);
    }
    return set;
  }, [summaries]);

  // Helper: item pertence à pasta atual?
  // Na raiz da matéria: mostra TUDO recursivo (itens em subpastas também),
  // pra evitar "página vazia" quando o conteúdo está organizado em subpastas.
  // Dentro de uma subpasta: só os itens diretamente nessa pasta.
  const matchesCurrentFolder = (
    folderId: string | null | undefined,
  ): boolean => {
    if (currentFolderId === null) return true;
    return (folderId ?? null) === currentFolderId;
  };

  // Subpastas direto-filhas da pasta atual (raiz ou aninhada).
  const subfolders = useMemo(
    () =>
      folders
        .filter((f) => (f.parentFolderId ?? null) === (currentFolderId ?? null))
        .sort((a, b) =>
          a.position !== b.position
            ? a.position - b.position
            : a.name.localeCompare(b.name, "pt-BR"),
        ),
    [folders, currentFolderId],
  );

  // Breadcrumb da pasta atual (vazio se raiz).
  const folderPath = useMemo(
    () => buildBreadcrumb(folders, currentFolderId ?? undefined),
    [folders, currentFolderId],
  );

  // Quando o user gera flashcards/quiz/mindmap só com PDFs (sem gravar aula),
  // o wizard cria uma lecture "fake" como container do asset. Essa lecture
  // não tem transcript/slides/messages — não faz sentido mostrar na lista
  // de "Aulas gravadas". Os assets aparecem na seção "Materiais gerados".
  const realLectures = useMemo(
    () =>
      lectures.filter((l) => {
        if (!matchesCurrentFolder(l.folderId)) return false;
        const hasTranscript = (l.transcript ?? "").trim().length > 0;
        const hasSlides = (l.slides?.length ?? 0) > 0;
        const hasMessages = (l.messages?.length ?? 0) > 0;
        return hasTranscript || hasSlides || hasMessages;
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lectures, currentFolderId],
  );

  const summariesInFolder = useMemo(
    () => summaries.filter((s) => matchesCurrentFolder(s.folderId)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [summaries, currentFolderId],
  );
  const documentsInFolder = useMemo(
    () => documents.filter((d) => matchesCurrentFolder(d.folderId)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [documents, currentFolderId],
  );
  const assetsInFolder = useMemo(
    () => assets.filter((a) => matchesCurrentFolder(a.folder_id)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [assets, currentFolderId],
  );

  // Assets separados por tipo pra cada categoria virar sua própria seção
  // (antes "Materiais gerados" misturava flashcards/quiz/mapas).
  const flashcards = useMemo(
    () => assetsInFolder.filter((a) => a.kind === "flashcards"),
    [assetsInFolder],
  );
  const quizzes = useMemo(
    () => assetsInFolder.filter((a) => a.kind === "quiz"),
    [assetsInFolder],
  );
  const mindmaps = useMemo(
    () => assetsInFolder.filter((a) => a.kind === "mindmap"),
    [assetsInFolder],
  );

  // Categorias com conteúdo, na ordem da barra de filtros.
  const categories = useMemo(
    () =>
      (
        [
          { key: "lectures", label: "Aulas", count: realLectures.length },
          { key: "summaries", label: "Resumos", count: summariesInFolder.length },
          { key: "flashcards", label: "Flashcards", count: flashcards.length },
          { key: "quiz", label: "Quiz", count: quizzes.length },
          { key: "mindmap", label: "Mapas", count: mindmaps.length },
          { key: "documents", label: "PDFs", count: documentsInFolder.length },
        ] as Array<{ key: FilterKey; label: string; count: number }>
      ).filter((c) => c.count > 0),
    [
      realLectures.length,
      summariesInFolder.length,
      flashcards.length,
      quizzes.length,
      mindmaps.length,
      documentsInFolder.length,
    ],
  );

  const totalCount = useMemo(
    () => categories.reduce((acc, c) => acc + c.count, 0),
    [categories],
  );

  // Se o filtro ativo ficou sem itens (ex: após excluir), volta pra "all".
  const effectiveFilter: FilterKey =
    filter === "all" || categories.some((c) => c.key === filter)
      ? filter
      : "all";
  const showSection = (key: FilterKey) =>
    effectiveFilter === "all" || effectiveFilter === key;

  if (loading) {
    return (
      <div className="mx-auto max-w-7xl px-5 py-8">
        <div className="h-6 w-32 rounded-md bg-secondary/40 animate-pulse mb-4" />
        <div className="h-10 w-72 rounded-md bg-secondary/50 animate-pulse mb-2" />
        <div className="h-4 w-48 rounded-md bg-secondary/40 animate-pulse mb-8" />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-40 rounded-xl bg-secondary/30 animate-pulse"
            />
          ))}
        </div>
      </div>
    );
  }

  if (!subject) {
    return (
      <div className="mx-auto max-w-7xl px-5 py-16 text-center">
        <LumiCharacter mood="confused" size="lg" />
        <h1 className="mt-4 text-xl font-semibold">Matéria não encontrada</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Pode ter sido excluída ou o link está errado.
        </p>
        <Button asChild variant="outline" className="mt-4">
          <Link href="/dashboard">
            <ArrowLeft className="h-4 w-4" /> Voltar ao dashboard
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-5 py-8">
      {/* Voltar pra aba do menu (Meus documentos) */}
      <BackToHub className="mb-3" />

      {/* Breadcrumb: Dashboard › Matéria › [Pasta › Subpasta...] */}
      <div className="flex items-center gap-1.5 text-sm text-muted-foreground mb-5 flex-wrap">
        <Link href="/dashboard" className="hover:text-foreground transition-colors">
          Dashboard
        </Link>
        <ChevronRight className="h-3.5 w-3.5" />
        {folderPath.length === 0 ? (
          <span className="text-foreground font-medium">{subject.name}</span>
        ) : (
          <Link
            href={`/subject/${subjectId}`}
            className="hover:text-foreground transition-colors"
          >
            {subject.name}
          </Link>
        )}
        {folderPath.map((f, i) => {
          const isLast = i === folderPath.length - 1;
          return (
            <span key={f.id} className="inline-flex items-center gap-1.5">
              <ChevronRight className="h-3.5 w-3.5" />
              {isLast ? (
                <span className="text-foreground font-medium inline-flex items-center gap-1">
                  <FolderIcon className="h-3.5 w-3.5" /> {f.name}
                </span>
              ) : (
                <Link
                  href={`/subject/${subjectId}?folder=${f.id}`}
                  className="inline-flex items-center gap-1 hover:text-foreground transition-colors"
                >
                  <FolderIcon className="h-3.5 w-3.5" /> {f.name}
                </Link>
              )}
            </span>
          );
        })}
      </div>

      {/* Header da matéria */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-8">
        <div className="flex items-start gap-4 min-w-0">
          <div className="h-16 w-16 shrink-0 rounded-2xl bg-primary/10 dark:bg-primary/15 flex items-center justify-center">
            {createElement(getSubjectIcon(subject.name), {
              className: "h-8 w-8 text-primary",
              strokeWidth: 2.2,
            })}
          </div>
          <div className="min-w-0">
            <h1 className="text-3xl heading-display truncate">
              {subject.name}
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              {lectures.length} aula{lectures.length === 1 ? "" : "s"}
              {stats.totalMin > 0 && ` · ${stats.totalMin} min gravados`}
              {stats.withSummary > 0 &&
                ` · ${stats.withSummary} resumo${stats.withSummary === 1 ? "" : "s"}`}
            </p>
          </div>
        </div>
        <div className="flex gap-2 shrink-0">
          <Button variant="outline" size="sm" onClick={handleDeleteSubject}>
            <Trash2 className="h-4 w-4" />
            Excluir matéria
          </Button>
          <Button variant="outline" onClick={() => setUploadDocOpen(true)}>
            <FileText className="h-4 w-4" /> Subir documento
          </Button>
          <Button variant="outline" onClick={() => setNewFolderOpen(true)}>
            <FolderPlus className="h-4 w-4" /> Nova pasta
          </Button>
          <Button variant="gradient" onClick={() => setNewOpen(true)}>
            <Mic className="h-4 w-4" /> Nova aula
          </Button>
        </div>
      </div>

      {/* Quick actions: gerar assets diretamente dessa matéria. O wizard usa
          os PDFs/aulas dessa matéria como contexto principal. */}
      <div className="mb-8 grid grid-cols-2 sm:grid-cols-4 gap-2">
        <QuickActionTile
          Icon={Sparkles}
          label="Resumo + PDF"
          hint="Subir PDF e gerar"
          color="violet"
          onClick={() => setWizardMode("summary")}
        />
        <QuickActionTile
          Icon={Layers}
          label="Flashcards"
          hint="Criar deck"
          color="emerald"
          onClick={() => setWizardMode("flashcards")}
        />
        <QuickActionTile
          Icon={HelpCircle}
          label="Quiz"
          hint="Gerar questões"
          color="amber"
          onClick={() => setWizardMode("quiz")}
        />
        <QuickActionTile
          Icon={Network}
          label="Mapa mental"
          hint="Visualizar tópicos"
          color="rose"
          onClick={() => setMindmapOpen(true)}
        />
      </div>

      {/* Schedule da matéria (se tiver) */}
      {(subject.schedule?.length ?? 0) > 0 && (
        <div className="mb-8 rounded-xl border border-border/60 bg-card p-4">
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-muted-foreground mb-3">
            <Calendar className="h-3 w-3" /> Horários
          </div>
          <div className="flex flex-wrap gap-2">
            {(subject.schedule ?? []).map((slot, idx) => (
              <div
                key={idx}
                className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-background px-3 py-1 text-xs"
              >
                <span className="font-medium">
                  {DAY_LABELS_LONG[slot.dayOfWeek]}
                </span>
                <span className="font-mono text-muted-foreground">
                  {slot.startTime}–{slot.endTime}
                </span>
                {slot.room && (
                  <span className="flex items-center gap-1 text-muted-foreground">
                    <MapPin className="h-3 w-3" />
                    {slot.room}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Subpastas — sempre no topo da view atual (raiz ou nested) */}
      {subfolders.length > 0 && (
        <div className="mb-6">
          <SectionHeading label="Pastas" count={subfolders.length} />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {subfolders.map((f) => (
              <FolderCard
                key={f.id}
                folder={f}
                subjectId={subjectId}
                onRename={() => {
                  setRenamingFolder(f);
                  setRenameDraft(f.name);
                }}
                onDelete={() => handleDeleteFolder(f)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Barra de filtros + conteúdo da pasta */}
      {realLectures.length === 0 &&
      documentsInFolder.length === 0 &&
      assetsInFolder.length === 0 &&
      summariesInFolder.length === 0 ? (
        subfolders.length > 0 ? (
          <div className="rounded-xl border border-dashed border-border/60 bg-card/40 p-6 text-center text-sm text-muted-foreground">
            Esta pasta ainda não tem aulas, resumos ou outros materiais. Use{" "}
            <strong className="text-foreground">Nova aula</strong> ou{" "}
            <strong className="text-foreground">Nova pasta</strong> pra começar.
          </div>
        ) : (
          <EmptyState onCreate={() => setNewOpen(true)} />
        )
      ) : (
        <>
          {categories.length > 1 && (
            <div className="mb-6 flex flex-wrap gap-2">
              <FilterChip
                active={effectiveFilter === "all"}
                label="Tudo"
                count={totalCount}
                onClick={() => setFilter("all")}
              />
              {categories.map((c) => (
                <FilterChip
                  key={c.key}
                  active={effectiveFilter === c.key}
                  label={c.label}
                  count={c.count}
                  onClick={() => setFilter(c.key)}
                />
              ))}
            </div>
          )}

          <div className="space-y-6">
            {showSection("lectures") && realLectures.length > 0 && (
              <div>
                <SectionHeading label="Aulas gravadas" count={realLectures.length} />
                <div className="space-y-3">
                  {realLectures.map((l) => (
                    <LectureFolder
                      key={l.id}
                      lecture={l}
                      subjectColor={subject.color}
                      hasSummary={lectureIdsWithSummary.has(l.id)}
                      onDelete={() => handleDeleteLecture(l)}
                      onMove={() =>
                        setMoveTarget({
                          kind: "lecture",
                          id: l.id,
                          title: l.title,
                          currentSubjectId: subjectId,
                          currentFolderId: l.folderId ?? null,
                          note: "Move a aula inteira (transcrição, resumo, flashcards/quiz/mapa gerados) pra nova matéria ou pasta.",
                        })
                      }
                    />
                  ))}
                </div>
              </div>
            )}

            {showSection("summaries") && summariesInFolder.length > 0 && (
              <div>
                <SectionHeading label="Resumos" count={summariesInFolder.length} />
                <div className="space-y-2">
                  {summariesInFolder.map((sm) => (
                    <SummaryRow
                      key={sm.id}
                      summary={sm}
                      favorited={favIds.has(`summary:${sm.id}`)}
                      onToggleFav={() => toggleFav(`summary:${sm.id}`)}
                      onMove={() => moveSummary(sm)}
                    />
                  ))}
                </div>
              </div>
            )}

            {showSection("flashcards") && flashcards.length > 0 && (
              <div>
                <SectionHeading label="Flashcards" count={flashcards.length} />
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {flashcards.map((a) => (
                    <AssetCard
                      key={a.id}
                      asset={a}
                      favorited={favIds.has(`asset:${a.id}`)}
                      onToggleFav={() => toggleFav(`asset:${a.id}`)}
                      onMove={() => moveAsset(a)}
                      onDelete={() => handleDeleteAsset(a)}
                    />
                  ))}
                </div>
              </div>
            )}

            {showSection("quiz") && quizzes.length > 0 && (
              <div>
                <SectionHeading label="Quiz" count={quizzes.length} />
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {quizzes.map((a) => (
                    <AssetCard
                      key={a.id}
                      asset={a}
                      favorited={favIds.has(`asset:${a.id}`)}
                      onToggleFav={() => toggleFav(`asset:${a.id}`)}
                      onMove={() => moveAsset(a)}
                      onDelete={() => handleDeleteAsset(a)}
                    />
                  ))}
                </div>
              </div>
            )}

            {showSection("mindmap") && mindmaps.length > 0 && (
              <div>
                <SectionHeading label="Mapas mentais" count={mindmaps.length} />
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {mindmaps.map((a) => (
                    <AssetCard
                      key={a.id}
                      asset={a}
                      favorited={favIds.has(`asset:${a.id}`)}
                      onToggleFav={() => toggleFav(`asset:${a.id}`)}
                      onMove={() => moveAsset(a)}
                      onDelete={() => handleDeleteAsset(a)}
                    />
                  ))}
                </div>
              </div>
            )}

            {showSection("documents") && documentsInFolder.length > 0 && (
              <div>
                <SectionHeading label="Documentos (PDF)" count={documentsInFolder.length} />
                <div className="space-y-2">
                  {documentsInFolder.map((d) => {
                    const sm = summaries.find(
                      (s) =>
                        s.source.kind === "document" &&
                        s.source.documentId === d.id,
                    );
                    return (
                      <DocumentRow
                        key={d.id}
                        document={d}
                        summary={sm}
                        favorited={favIds.has(`document:${d.id}`)}
                        onToggleFav={() => toggleFav(`document:${d.id}`)}
                        onMove={() => moveDocument(d)}
                        onOpen={setDocDialog}
                        onDelete={handleDeleteDocument}
                      />
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {/* Dialog Nova Aula */}
      <Dialog open={newOpen} onOpenChange={setNewOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nova aula em {subject.name}</DialogTitle>
            <DialogDescription>
              Em segundos a transcrição começa.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="title">Título</Label>
            <Input
              id="title"
              autoFocus
              value={lectureTitle}
              onChange={(e) => setLectureTitle(e.target.value)}
              placeholder={`Aula ${new Date().toLocaleDateString("pt-BR")}`}
              onKeyDown={(e) => e.key === "Enter" && handleCreate()}
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setNewOpen(false)}>
              Cancelar
            </Button>
            <Button variant="gradient" onClick={handleCreate}>
              <Mic className="h-4 w-4" /> Começar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog Nova Pasta */}
      <Dialog open={newFolderOpen} onOpenChange={setNewFolderOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Nova pasta {folderPath.length > 0 ? `em ${folderPath[folderPath.length - 1].name}` : `em ${subject.name}`}
            </DialogTitle>
            <DialogDescription>
              Organize aulas, resumos e PDFs por tema (ex.: Anatomia, Fisio).
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="folder-name">Nome da pasta</Label>
            <Input
              id="folder-name"
              autoFocus
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              placeholder="Ex.: Imaginologia"
              onKeyDown={(e) => e.key === "Enter" && handleCreateFolder()}
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setNewFolderOpen(false)}>
              Cancelar
            </Button>
            <Button variant="gradient" onClick={handleCreateFolder} disabled={!newFolderName.trim()}>
              <FolderPlus className="h-4 w-4" /> Criar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog Renomear Pasta */}
      <Dialog
        open={!!renamingFolder}
        onOpenChange={(open) => {
          if (!open) {
            setRenamingFolder(null);
            setRenameDraft("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Renomear pasta</DialogTitle>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="rename-folder">Novo nome</Label>
            <Input
              id="rename-folder"
              autoFocus
              value={renameDraft}
              onChange={(e) => setRenameDraft(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleRenameFolder()}
            />
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => {
                setRenamingFolder(null);
                setRenameDraft("");
              }}
            >
              Cancelar
            </Button>
            <Button variant="gradient" onClick={handleRenameFolder} disabled={!renameDraft.trim()}>
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Wizard de geração de assets — abre via QuickActionTile da toolbar.
          initialSubjectId ancora o save nessa matéria + pré-seleciona PDFs/aulas
          daqui (em vez de cair em subjects[0]). */}
      <ContentWizard
        open={!!wizardMode}
        onOpenChange={(open) => {
          if (!open) setWizardMode(null);
        }}
        mode={wizardMode ?? "summary"}
        userId={user.id}
        initialSubjectId={subjectId}
        onCreated={({ lectureId, summaryId, mode }) => {
          setWizardMode(null);
          if (mode === "summary") {
            if (lectureId) router.push(`/resumo/${lectureId}`);
            else if (summaryId) router.push(`/resumo/doc/${summaryId}`);
            else refresh();
          } else {
            // flashcards/quiz/mindmap: recarrega a tela pra mostrar o asset novo
            refresh();
          }
        }}
      />

      {/* Mapa mental — dialog próprio simples (complexidade + foco opcional).
          Usa TODAS as aulas + documentos da matéria como fonte. */}
      <MindmapQuickDialog
        open={mindmapOpen}
        onOpenChange={setMindmapOpen}
        userId={user.id}
        subjectId={subjectId}
        subjectName={subject.name}
        source={{
          lectureIds: lectures.map((l) => l.id),
          documentIds: documents.map((d) => d.id),
          transcripts: lectures
            .map((l) => l.transcript?.trim() ?? "")
            .filter((t) => t.length > 0),
          pdfTexts: documents
            .map((d) => d.sourceText?.trim() ?? "")
            .filter((t) => t.length > 0),
        }}
        onCreated={() => {
          setMindmapOpen(false);
          refresh();
        }}
      />

      {/* Modal de info do documento (PDF) */}
      <DocumentInfoDialog
        doc={docDialog}
        subjectName={subject.name}
        summary={
          docDialog
            ? summaries.find(
                (s) =>
                  s.source.kind === "document" &&
                  s.source.documentId === docDialog.id,
              )
            : undefined
        }
        deleting={deletingDoc}
        onClose={() => setDocDialog(null)}
        onDelete={handleDeleteDocument}
      />

      {/* Mover arquivo/asset entre pastas (matérias) */}
      <MoveToFolderDialog
        open={!!moveTarget}
        onOpenChange={(open) => {
          if (!open) setMoveTarget(null);
        }}
        userId={user.id}
        subjects={allSubjects}
        target={moveTarget}
        onMoved={() => {
          setMoveTarget(null);
          refresh();
        }}
      />

      {/* Subir documento (PDF) — pré-atribui matéria atual + pasta atual */}
      <UploadDocumentDialog
        open={uploadDocOpen}
        onOpenChange={setUploadDocOpen}
        userId={user.id}
        subjects={allSubjects}
        defaultSubjectId={subjectId}
        defaultFolderId={currentFolderId}
        onUploaded={() => {
          setUploadDocOpen(false);
          refresh();
        }}
      />
    </div>
  );
}

function FilterChip({
  active,
  label,
  count,
  onClick,
}: {
  active: boolean;
  label: string;
  count: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border/60 bg-card text-muted-foreground hover:text-foreground hover:border-primary/40",
      )}
    >
      {label}
      <span
        className={cn(
          "font-mono tabular-nums",
          active ? "text-primary-foreground/80" : "text-muted-foreground/70",
        )}
      >
        {count}
      </span>
    </button>
  );
}

function SectionHeading({ label, count }: { label: string; count: number }) {
  return (
    <h2 className="text-xs uppercase tracking-wider text-muted-foreground font-semibold mb-3">
      {label} · {count}
    </h2>
  );
}

function FolderCard({
  folder,
  subjectId,
  onRename,
  onDelete,
}: {
  folder: Folder;
  subjectId: string;
  onRename: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="group relative rounded-xl border border-border/60 bg-card hover:border-primary/40 hover:bg-secondary/40 transition-colors">
      <Link
        href={`/subject/${subjectId}?folder=${folder.id}`}
        className="flex items-center gap-3 p-4 min-w-0"
      >
        <span className="h-10 w-10 shrink-0 rounded-lg bg-primary/10 dark:bg-primary/15 flex items-center justify-center">
          <FolderIcon className="h-5 w-5 text-primary" strokeWidth={2.2} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium truncate">{folder.name}</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Pasta
          </p>
        </div>
      </Link>
      {/* Menu de ações no canto */}
      <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              className="h-7 w-7"
              aria-label="Mais opções"
              onClick={(e) => e.stopPropagation()}
            >
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={onRename}>
              <Pencil className="h-4 w-4" /> Renomear
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={onDelete}
              className="text-destructive focus:text-destructive"
            >
              <Trash2 className="h-4 w-4" /> Excluir pasta
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

function FavStar({
  active,
  onToggle,
}: {
  active: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onToggle();
      }}
      aria-label={active ? "Remover dos favoritos" : "Adicionar aos favoritos"}
      title={active ? "Remover dos favoritos" : "Favoritar"}
      className={cn(
        "shrink-0 h-8 w-8 inline-flex items-center justify-center rounded-md transition-colors",
        active
          ? "text-amber-500 hover:bg-amber-500/10"
          : "text-muted-foreground hover:bg-secondary hover:text-foreground opacity-100 md:opacity-0 md:group-hover:opacity-100 md:focus:opacity-100",
      )}
    >
      <Star className={cn("h-4 w-4", active && "fill-current")} />
    </button>
  );
}

function MoveButton({ onMove }: { onMove: () => void }) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onMove();
      }}
      aria-label="Mover para outra pasta"
      title="Mover para pasta"
      className="shrink-0 h-8 w-8 inline-flex items-center justify-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground opacity-100 md:opacity-0 md:group-hover:opacity-100 md:focus:opacity-100 transition-colors"
    >
      <FolderInput className="h-4 w-4" />
    </button>
  );
}

function DeleteAssetButton({ onDelete }: { onDelete: () => void }) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onDelete();
      }}
      aria-label="Excluir"
      title="Excluir"
      className="shrink-0 h-8 w-8 inline-flex items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive opacity-100 md:opacity-0 md:group-hover:opacity-100 md:focus:opacity-100 transition-colors"
    >
      <Trash2 className="h-4 w-4" />
    </button>
  );
}

function SummaryRow({
  summary,
  favorited,
  onToggleFav,
  onMove,
}: {
  summary: Summary;
  favorited: boolean;
  onToggleFav: () => void;
  onMove: () => void;
}) {
  const href =
    summary.source.kind === "lecture"
      ? `/resumo/${summary.source.lectureId}`
      : `/resumo/doc/${summary.id}`;
  return (
    <Link
      href={href}
      className="group flex items-center gap-3 rounded-xl border border-border/60 bg-card hover:border-primary/40 hover:shadow-sm transition-all p-4"
    >
      <div className="h-10 w-10 rounded-lg bg-primary/10 dark:bg-primary/15 flex items-center justify-center shrink-0">
        <Sparkles className="h-4 w-4 text-primary" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold tracking-tight truncate group-hover:text-primary transition-colors">
          {summary.title ?? "Resumo"}
        </div>
        <div className="text-xs text-muted-foreground mt-0.5">
          Resumo · {formatRelativeTime(summary.updatedAt ?? summary.createdAt)}
        </div>
      </div>
      <MoveButton onMove={onMove} />
      <FavStar active={favorited} onToggle={onToggleFav} />
      <ChevronRight className="h-4 w-4 text-muted-foreground/60 group-hover:text-primary group-hover:translate-x-0.5 transition-all shrink-0" />
    </Link>
  );
}

function QuickActionTile({
  Icon,
  label,
  hint,
  color,
  onClick,
}: {
  Icon: typeof Sparkles;
  label: string;
  hint: string;
  color: "violet" | "emerald" | "amber" | "rose";
  onClick: () => void;
}) {
  const palette: Record<
    "violet" | "emerald" | "amber" | "rose",
    { bg: string; text: string }
  > = {
    violet: { bg: "bg-violet-500/10", text: "text-violet-600 dark:text-violet-400" },
    emerald: {
      bg: "bg-emerald-500/10",
      text: "text-emerald-600 dark:text-emerald-400",
    },
    amber: { bg: "bg-amber-500/10", text: "text-amber-600 dark:text-amber-400" },
    rose: { bg: "bg-rose-500/10", text: "text-rose-600 dark:text-rose-400" },
  };
  const p = palette[color];
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex items-center gap-3 rounded-xl border border-border/60 bg-card hover:border-primary/40 hover:shadow-sm transition-all px-3 py-2.5 text-left"
    >
      <div
        className={cn(
          "h-9 w-9 shrink-0 rounded-lg flex items-center justify-center",
          p.bg,
        )}
      >
        <Icon className={cn("h-4 w-4", p.text)} strokeWidth={2.2} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold leading-tight truncate group-hover:text-primary transition-colors">
          {label}
        </div>
        <div className="text-[10px] text-muted-foreground truncate">{hint}</div>
      </div>
    </button>
  );
}

function LectureFolder({
  lecture,
  subjectColor,
  hasSummary,
  onDelete,
  onMove,
}: {
  lecture: Lecture;
  subjectColor: string;
  hasSummary: boolean;
  onDelete: () => void;
  onMove?: () => void;
}) {
  const hasTranscript = lecture.transcript.trim().length > 0;
  const hasSlides = (lecture.slides?.length ?? 0) > 0;
  const msgCount = lecture.messages.length;

  return (
    <Card className="lift-card overflow-hidden border-border/60 bg-gradient-to-b from-card to-card/40 hover:border-primary/40">
      <CardContent className="p-0">
        {/* Header da aula */}
        <Link
          href={`/lecture/${lecture.id}`}
          className="group block px-5 pt-5 pb-4 hover:bg-secondary/20 transition-colors"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3.5 min-w-0 flex-1">
              <div
                className={cn(
                  "relative h-11 w-11 shrink-0 overflow-hidden rounded-2xl bg-gradient-to-br shadow-md ring-1 ring-white/20 flex items-center justify-center",
                  subjectColor,
                )}
              >
                <div className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/25 to-transparent" />
                <Mic
                  className="relative z-10 h-[18px] w-[18px] text-white"
                  strokeWidth={2.2}
                />
              </div>
              <div className="min-w-0 flex-1 pt-0.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-semibold text-[15px] tracking-tight truncate transition-colors group-hover:text-primary">
                    {lecture.title}
                  </h3>
                  {lecture.status === "live" && (
                    <Badge variant="live" className="gap-1 shrink-0">
                      <span className="h-1.5 w-1.5 rounded-full bg-red-500 pulse-dot" />
                      AO VIVO
                    </Badge>
                  )}
                  {hasSummary && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-1.5 py-px text-[9px] font-mono uppercase tracking-wider text-primary shrink-0">
                      <Sparkles className="h-2.5 w-2.5" /> Com resumo
                    </span>
                  )}
                </div>
                <div className="mt-2 flex items-center gap-1.5 flex-wrap">
                  <span className="inline-flex items-center gap-1 rounded-full bg-secondary/50 px-2 py-0.5 text-[11px] text-muted-foreground">
                    <Clock className="h-3 w-3" />
                    {formatRelativeTime(lecture.createdAt)}
                  </span>
                  {lecture.durationSec > 0 && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-secondary/50 px-2 py-0.5 font-mono text-[11px] text-muted-foreground">
                      <Mic className="h-3 w-3" />
                      {formatDuration(lecture.durationSec)}
                    </span>
                  )}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              {onMove && (
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onMove();
                  }}
                  className="rounded-md p-1.5 opacity-0 transition-all group-hover:opacity-60 hover:!opacity-100 hover:bg-primary/10 hover:text-primary"
                  aria-label="Mover aula"
                  title="Mover pra outra matéria/pasta"
                >
                  <FolderInput className="h-4 w-4" />
                </button>
              )}
              <button
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onDelete();
                }}
                className="rounded-md p-1.5 opacity-0 transition-all group-hover:opacity-60 hover:!opacity-100 hover:bg-destructive/10 hover:text-destructive"
                aria-label="Excluir aula"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>
        </Link>

        {/* Subpastas (features) — tiles com estado ativo/inativo */}
        <div className="border-t border-border/40 bg-secondary/15 p-1.5">
          <div className="grid grid-cols-3 gap-1">
            <FeatureTab
              href={`/lecture/${lecture.id}?tab=transcript`}
              icon="document"
              label="Transcrição"
              detail={
                hasTranscript
                  ? `${lecture.transcript.split(/\s+/).length} palavras`
                  : "Vazio"
              }
              active={hasTranscript}
            />
            <FeatureTab
              href={`/lecture/${lecture.id}?tab=slides`}
              icon="layers"
              label="Slides"
              detail={
                hasSlides
                  ? `${lecture.slides!.length} slide${lecture.slides!.length === 1 ? "" : "s"}`
                  : "Sem PDF"
              }
              active={hasSlides}
            />
            <FeatureTab
              href={`/lecture/${lecture.id}?tab=qa`}
              icon="chat"
              label="Dúvidas"
              detail={
                msgCount > 0
                  ? `${msgCount} mensagem${msgCount === 1 ? "" : "s"}`
                  : "Nenhuma"
              }
              active={msgCount > 0}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function FeatureTab({
  href,
  icon,
  label,
  detail,
  active,
}: {
  href: string;
  icon: LumiIconName;
  label: string;
  detail: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "group/tile flex items-center gap-2.5 rounded-lg px-2.5 py-2 transition-all",
        active
          ? "bg-card hover:shadow-sm hover:bg-card"
          : "hover:bg-card/70",
      )}
    >
      <LumiIcon
        name={icon}
        size={28}
        className={cn(
          "shrink-0 transition-all",
          !active && "opacity-40 grayscale",
        )}
      />
      <div className="min-w-0 flex-1">
        <div
          className={cn(
            "text-[11px] font-semibold leading-tight",
            !active && "text-muted-foreground",
          )}
        >
          {label}
        </div>
        <div className="mt-0.5 truncate text-[10px] text-muted-foreground">
          {detail}
        </div>
      </div>
      <ArrowRight className="hidden h-3 w-3 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover/tile:opacity-100 md:block" />
    </Link>
  );
}

function DocumentRow({
  document,
  summary,
  favorited,
  onToggleFav,
  onMove,
  onOpen,
  onDelete,
}: {
  document: LumioDocument;
  summary?: Summary;
  favorited: boolean;
  onToggleFav: () => void;
  onMove: () => void;
  onOpen: (d: LumioDocument) => void;
  onDelete: (d: LumioDocument) => void;
}) {
  // Clicar abre o modal de info (não navega pra tela de texto extraído).
  // A lixeira aparece no hover pra exclusão rápida.
  return (
    <div className="group flex items-center gap-3 rounded-xl border border-border/60 bg-card hover:border-primary/40 hover:shadow-sm transition-all p-4">
      <button
        type="button"
        onClick={() => onOpen(document)}
        className="flex items-center gap-3 min-w-0 flex-1 text-left"
      >
        <div className="h-10 w-10 rounded-lg bg-sky-500/10 dark:bg-sky-500/15 flex items-center justify-center shrink-0">
          <FileText className="h-4 w-4 text-sky-600 dark:text-sky-400" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold tracking-tight truncate group-hover:text-primary transition-colors">
            {document.title}
          </div>
          <div className="text-xs text-muted-foreground mt-0.5 inline-flex items-center gap-2">
            <span>
              PDF
              {document.pageCount
                ? ` · ${document.pageCount} ${document.pageCount === 1 ? "página" : "páginas"}`
                : ""}
            </span>
            {summary && (
              <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 text-primary px-1.5 py-px text-[9px] font-mono uppercase tracking-wider">
                <Sparkles className="h-2.5 w-2.5" /> Com resumo
              </span>
            )}
          </div>
        </div>
      </button>
      <MoveButton onMove={onMove} />
      <FavStar active={favorited} onToggle={onToggleFav} />
      <button
        type="button"
        onClick={() => onDelete(document)}
        aria-label={`Excluir ${document.title}`}
        className="shrink-0 h-8 w-8 inline-flex items-center justify-center rounded-md text-muted-foreground hover:bg-red-500/10 hover:text-red-600 transition-colors opacity-100 md:opacity-0 md:group-hover:opacity-100 md:focus:opacity-100"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  );
}

function DocumentInfoDialog({
  doc,
  subjectName,
  summary,
  deleting,
  onClose,
  onDelete,
}: {
  doc: LumioDocument | null;
  subjectName: string | null;
  summary?: Summary;
  deleting: boolean;
  onClose: () => void;
  onDelete: (d: LumioDocument) => void;
}) {
  return (
    <Dialog
      open={!!doc}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-w-md">
        {doc && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 pr-6">
                <span className="h-9 w-9 shrink-0 rounded-lg bg-sky-500/10 dark:bg-sky-500/15 flex items-center justify-center">
                  <FileText className="h-4 w-4 text-sky-600 dark:text-sky-400" />
                </span>
                <span className="min-w-0 break-words">{doc.title}</span>
              </DialogTitle>
              <DialogDescription>Documento PDF</DialogDescription>
            </DialogHeader>

            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
              <dt className="text-muted-foreground">Tipo</dt>
              <dd className="font-medium">
                {doc.sourceKind === "pdf" ? "PDF" : "Texto"}
              </dd>
              {doc.pageCount ? (
                <>
                  <dt className="text-muted-foreground">Páginas</dt>
                  <dd className="font-medium">{doc.pageCount}</dd>
                </>
              ) : null}
              <dt className="text-muted-foreground">Matéria</dt>
              <dd className="font-medium">{subjectName ?? "Sem matéria"}</dd>
              <dt className="text-muted-foreground">Origem</dt>
              <dd className="font-medium">Upload</dd>
              <dt className="text-muted-foreground">Adicionado</dt>
              <dd className="font-medium">{formatRelativeTime(doc.createdAt)}</dd>
              <dt className="text-muted-foreground">Resumo</dt>
              <dd className="font-medium">{summary ? "Gerado" : "Ainda não"}</dd>
            </dl>

            <DialogFooter className="flex-col-reverse sm:flex-row sm:justify-between gap-2">
              <Button
                variant="ghost"
                onClick={() => onDelete(doc)}
                disabled={deleting}
                className="text-red-600 hover:text-red-700 hover:bg-red-500/10"
              >
                <Trash2 className="h-4 w-4" />
                {deleting ? "Excluindo…" : "Excluir"}
              </Button>
              <div className="flex gap-2">
                {summary && (
                  <Button asChild variant="outline">
                    <Link href={`/resumo/doc/${summary.id}`}>
                      <Sparkles className="h-4 w-4" /> Abrir resumo
                    </Link>
                  </Button>
                )}
                <Button asChild variant="gradient">
                  <Link href={`/document/${doc.id}`}>Abrir PDF</Link>
                </Button>
              </div>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function AssetCard({
  asset,
  favorited,
  onToggleFav,
  onMove,
  onDelete,
}: {
  asset: SubjectAsset;
  favorited: boolean;
  onToggleFav: () => void;
  onMove: () => void;
  onDelete?: () => void;
}) {
  // Mapeia kind → rota + ícone + descrição visível
  const meta = (() => {
    if (asset.kind === "flashcards") {
      const count = Array.isArray(asset.payload.cards)
        ? asset.payload.cards.length
        : 0;
      return {
        href: `/deck/${asset.id}`,
        Icon: Layers,
        label: "Flashcards",
        detail: `${count} card${count === 1 ? "" : "s"}`,
        tone: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
      };
    }
    if (asset.kind === "quiz") {
      const count = Array.isArray(asset.payload.questions)
        ? asset.payload.questions.length
        : 0;
      return {
        href: `/quiz-banco/${asset.id}`,
        Icon: HelpCircle,
        label: "Quiz",
        detail: `${count} ${count === 1 ? "questão" : "questões"}`,
        tone: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
      };
    }
    return {
      href: `/mapa/${asset.id}`,
      Icon: Network,
      label: "Mapa mental",
      detail: asset.payload.centralTopic
        ? String(asset.payload.centralTopic).slice(0, 60)
        : "Mapa",
      tone: "bg-rose-500/10 text-rose-600 dark:text-rose-400",
    };
  })();

  return (
    <Link
      href={meta.href}
      className="group rounded-xl border border-border/60 bg-card hover:border-primary/40 hover:shadow-sm transition-all p-4 flex items-start gap-3"
    >
      <div
        className={cn(
          "h-10 w-10 shrink-0 rounded-lg flex items-center justify-center",
          meta.tone,
        )}
      >
        <meta.Icon className="h-5 w-5" strokeWidth={2.2} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[10px] uppercase tracking-wider font-mono text-muted-foreground mb-0.5">
          {meta.label}
        </div>
        <div className="text-sm font-semibold leading-tight line-clamp-2 group-hover:text-primary transition-colors">
          {meta.detail}
        </div>
      </div>
      <MoveButton onMove={onMove} />
      {onDelete && <DeleteAssetButton onDelete={onDelete} />}
      <FavStar active={favorited} onToggle={onToggleFav} />
      <ChevronRight className="h-4 w-4 text-muted-foreground/60 group-hover:text-primary group-hover:translate-x-0.5 transition-all shrink-0 mt-1" />
    </Link>
  );
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="rounded-2xl border border-dashed border-border/60 bg-card/40 px-8 py-12 text-center">
      <div className="flex justify-center mb-2">
        <LumiCharacter mood="waving" size="lg" float />
      </div>
      <h3 className="text-lg font-semibold">Nenhuma aula nessa matéria</h3>
      <p className="mt-2 text-sm text-muted-foreground max-w-md mx-auto">
        Comece a primeira aula — transcrição em tempo real, chat IA, anexo de
        slides e resumo automático no fim.
      </p>
      <Button onClick={onCreate} variant="gradient" size="lg" className="mt-6">
        <Plus className="h-4 w-4" /> Nova aula
      </Button>
    </div>
  );
}
