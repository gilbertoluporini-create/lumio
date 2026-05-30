"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Target } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { listSubjectsAsync } from "@/lib/db";
import { createPlanAsync } from "@/lib/study-plans";
import type { Subject } from "@/lib/types";

type Props = {
  userId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (planId: string) => void;
};

export function CreatePlanDialog({
  userId,
  open,
  onOpenChange,
  onCreated,
}: Props) {
  const router = useRouter();
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [subjectId, setSubjectId] = useState<string>("");
  const [title, setTitle] = useState("");
  const [examDate, setExamDate] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    void (async () => {
      const list = await listSubjectsAsync(userId);
      setSubjects(list);
      if (list[0] && !subjectId) {
        setSubjectId(list[0].id);
        if (!title) setTitle(`Prova de ${list[0].name}`);
      }
    })();
  }, [open, userId, subjectId, title]);

  function handleSubjectChange(id: string) {
    setSubjectId(id);
    const subj = subjects.find((s) => s.id === id);
    if (subj && (!title || title.startsWith("Prova de "))) {
      setTitle(`Prova de ${subj.name}`);
    }
  }

  async function handleSubmit() {
    if (!title.trim()) {
      toast.error("Dá um título pro plano.");
      return;
    }
    setSaving(true);
    try {
      const plan = await createPlanAsync({
        userId,
        subjectId: subjectId || null,
        title: title.trim(),
        examDate: examDate || null,
      });
      if (!plan) throw new Error("Falha ao criar.");
      toast.success("Plano criado.");
      onOpenChange(false);
      setTitle("");
      setExamDate("");
      onCreated?.(plan.id);
      router.push(`/planos/${plan.id}`);
    } catch (err) {
      toast.error(`Não consegui criar: ${(err as Error).message}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Target className="h-5 w-5 text-primary" />
            Novo plano de estudos
          </DialogTitle>
          <DialogDescription>
            Defina a matéria, dê um nome ao plano e (opcional) a data da prova.
            Você adiciona os itens da trilha depois.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="grid gap-1.5">
            <Label htmlFor="plan-subject">Matéria</Label>
            <select
              id="plan-subject"
              value={subjectId}
              onChange={(e) => handleSubjectChange(e.target.value)}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="">Sem matéria específica</option>
              {subjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.emoji ? `${s.emoji} ` : ""}
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="plan-title">Título</Label>
            <Input
              id="plan-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ex: Prova de Endócrino — semana 1"
              maxLength={180}
            />
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="plan-exam-date">Data da prova (opcional)</Label>
            <Input
              id="plan-exam-date"
              type="date"
              value={examDate}
              onChange={(e) => setExamDate(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={saving} className="gap-1.5">
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Criando…
              </>
            ) : (
              <>
                <Target className="h-4 w-4" />
                Criar plano
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
