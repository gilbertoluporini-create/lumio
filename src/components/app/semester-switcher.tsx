"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Check,
  ChevronsUpDown,
  GraduationCap,
  Loader2,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  createSemesterAsync,
  deleteSemesterAsync,
  getActiveSemesterIdAsync,
  listSemestersAsync,
  renameSemesterAsync,
  setActiveSemesterAsync,
} from "@/lib/db";
import type { Semester, User } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * Seletor de semestre no topo da sidebar. Mostra o semestre ativo, permite
 * trocar (filtra todo o app pelo escolhido) e criar um novo — que dispara o
 * onboarding já no contexto do período novo. Semestres antigos ficam guardados.
 */
export function SemesterSwitcher({
  user,
  collapsed,
}: {
  user: User;
  collapsed: boolean;
}) {
  const router = useRouter();
  const [semesters, setSemesters] = useState<Semester[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [editTarget, setEditTarget] = useState<Semester | null>(null);
  const [editName, setEditName] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Semester | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      const [list, active] = await Promise.all([
        listSemestersAsync(user.id),
        getActiveSemesterIdAsync(user.id),
      ]);
      if (!alive) return;
      setSemesters(list);
      setActiveId(active ?? list[list.length - 1]?.id ?? null);
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [user.id]);

  // Sem nenhum semestre (DB pré-053 antes do backfill, ou user novíssimo) o
  // seletor não aparece — não polui a sidebar até existir dado de verdade.
  if (!loading && semesters.length === 0) return null;

  const active = semesters.find((s) => s.id === activeId) ?? null;

  async function handleSwitch(id: string) {
    if (id === activeId || switching) return;
    setSwitching(true);
    try {
      await setActiveSemesterAsync(user.id, id);
      // Reload total: dashboard, matérias, grade e gravações refazem o fetch
      // já filtrados pelo semestre novo.
      router.refresh();
      window.location.reload();
    } catch {
      toast.error("Não consegui trocar de semestre.");
      setSwitching(false);
    }
  }

  async function handleRename() {
    const target = editTarget;
    if (!target) return;
    const name = editName.trim();
    if (name.length < 2) {
      toast.error("Dá um nome pro semestre (ex: 2026.2).");
      return;
    }
    if (name === target.name) {
      setEditTarget(null);
      return;
    }
    setSaving(true);
    try {
      await renameSemesterAsync(user.id, target.id, name);
      setSemesters((prev) =>
        prev.map((s) => (s.id === target.id ? { ...s, name } : s)),
      );
      toast.success("Semestre renomeado.");
      setEditTarget(null);
    } catch {
      toast.error("Não consegui renomear o semestre.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    const target = deleteTarget;
    if (!target) return;
    if (semesters.length <= 1) {
      toast.error("Você precisa de pelo menos um semestre.");
      setDeleteTarget(null);
      return;
    }
    setDeleting(true);
    try {
      await deleteSemesterAsync(user.id, target.id);
      const remaining = semesters.filter((s) => s.id !== target.id);
      setSemesters(remaining);
      setDeleteTarget(null);
      // Se apagou o ativo, ativa o mais recente restante e recarrega o app
      // (dashboard/matérias/grade refazem o fetch já no semestre certo).
      if (target.id === activeId) {
        const next = remaining[remaining.length - 1];
        if (next) {
          await setActiveSemesterAsync(user.id, next.id);
          window.location.reload();
          return;
        }
      }
      toast.success("Semestre apagado.");
    } catch {
      toast.error("Não consegui apagar o semestre.");
      setDeleting(false);
    }
  }

  async function handleCreate() {
    const name = newName.trim();
    if (name.length < 2) {
      toast.error("Dá um nome pro semestre (ex: 2026.2).");
      return;
    }
    setCreating(true);
    try {
      const sem = await createSemesterAsync(user.id, name, { activate: true });
      toast.success(`Semestre "${sem.name}" criado!`);
      // Onboarding no contexto do semestre novo (matérias/grade do zero).
      window.location.href = "/onboarding?novoSemestre=1";
    } catch {
      toast.error("Não consegui criar o semestre.");
      setCreating(false);
    }
  }

  const menu = (
    <DropdownMenuContent align="start" className="w-56">
      <DropdownMenuLabel>Meus semestres</DropdownMenuLabel>
      {semesters.map((s) => (
        <DropdownMenuItem
          key={s.id}
          onClick={() => handleSwitch(s.id)}
          className="group/sem gap-2"
        >
          <Check
            className={cn(
              "h-4 w-4 shrink-0",
              s.id === activeId ? "opacity-100" : "opacity-0",
            )}
          />
          <span className="flex-1 truncate">{s.name}</span>
          <span className="ml-auto flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover/sem:opacity-100 focus-within:opacity-100">
            <button
              type="button"
              aria-label={`Renomear ${s.name}`}
              className="rounded p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                setEditName(s.name);
                setEditTarget(s);
              }}
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              aria-label={`Apagar ${s.name}`}
              disabled={semesters.length <= 1}
              title={
                semesters.length <= 1
                  ? "Você precisa de pelo menos um semestre"
                  : undefined
              }
              className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-muted-foreground"
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                if (semesters.length <= 1) return;
                setDeleteTarget(s);
              }}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </span>
        </DropdownMenuItem>
      ))}
      <DropdownMenuSeparator />
      <DropdownMenuItem
        onClick={() => setDialogOpen(true)}
        className="gap-2 text-primary focus:text-primary"
      >
        <Plus className="h-4 w-4" /> Novo semestre
      </DropdownMenuItem>
    </DropdownMenuContent>
  );

  return (
    <>
      <div className="px-2 pt-3">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            {collapsed ? (
              <button
                className="flex h-9 w-full items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary/60 hover:text-foreground"
                title={active?.name ?? "Semestre"}
                aria-label="Trocar de semestre"
              >
                <GraduationCap className="h-4 w-4" />
              </button>
            ) : (
              <button
                disabled={switching}
                className="group flex w-full items-center gap-2 rounded-md border border-border/60 bg-secondary/30 px-2.5 py-2 text-left transition-colors hover:bg-secondary/60 disabled:opacity-60"
              >
                <GraduationCap className="h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <div className="text-[10px] uppercase leading-none tracking-wide text-muted-foreground">
                    Semestre
                  </div>
                  <div className="mt-0.5 truncate text-sm font-medium leading-tight">
                    {loading ? "…" : (active?.name ?? "—")}
                  </div>
                </div>
                {switching ? (
                  <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
                ) : (
                  <ChevronsUpDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                )}
              </button>
            )}
          </DropdownMenuTrigger>
          {menu}
        </DropdownMenu>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Novo semestre</DialogTitle>
            <DialogDescription>
              Começa um período novo com matérias, grade e arquivos do zero. Seu
              semestre atual fica guardado — é só trocar aqui pra voltar nele.
            </DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <Input
              autoFocus
              placeholder="Ex: 2026.2 ou 5º período"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleCreate();
              }}
              maxLength={40}
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDialogOpen(false)}
              disabled={creating}
            >
              Cancelar
            </Button>
            <Button onClick={handleCreate} disabled={creating}>
              {creating ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Criando…
                </>
              ) : (
                "Criar e configurar"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Renomear semestre */}
      <Dialog
        open={!!editTarget}
        onOpenChange={(o) => {
          if (!o) setEditTarget(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Renomear semestre</DialogTitle>
            <DialogDescription>
              Muda só o nome — suas matérias, aulas e arquivos continuam onde
              estão.
            </DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <Input
              autoFocus
              placeholder="Ex: 2026.2 ou 5º período"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleRename();
              }}
              maxLength={40}
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setEditTarget(null)}
              disabled={saving}
            >
              Cancelar
            </Button>
            <Button onClick={handleRename} disabled={saving}>
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Salvando…
                </>
              ) : (
                "Salvar"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Apagar semestre — destrutivo */}
      <Dialog
        open={!!deleteTarget}
        onOpenChange={(o) => {
          if (!o) setDeleteTarget(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Apagar “{deleteTarget?.name}”?</DialogTitle>
            <DialogDescription>
              Isso apaga <strong>tudo desse semestre</strong> — matérias, aulas,
              transcrições, resumos, flashcards, quizzes e mapas. Essa ação{" "}
              <strong>não dá pra desfazer</strong>.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteTarget(null)}
              disabled={deleting}
            >
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Apagando…
                </>
              ) : (
                "Apagar semestre"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
