"use client";

import { useState, useTransition } from "react";
import { Loader2, Mail, Send } from "lucide-react";
import { toast } from "sonner";
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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { User } from "@/lib/types";

const SUPPORT_EMAIL = "contato@lumioapp.net";

const CATEGORIES = [
  { value: "duvida", label: "Dúvida" },
  { value: "bug", label: "Bug" },
  { value: "sugestao", label: "Sugestão" },
  { value: "cobranca", label: "Cobrança" },
  { value: "outro", label: "Outro" },
] as const;

type Category = (typeof CATEGORIES)[number]["value"];

export type SupportDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: User;
  defaultSubject?: string;
};

export function SupportDialog({
  open,
  onOpenChange,
  user,
  defaultSubject,
}: SupportDialogProps) {
  const [name, setName] = useState<string>(user.name ?? "");
  const [subject, setSubject] = useState<string>(defaultSubject ?? "");
  const [category, setCategory] = useState<Category>("duvida");
  const [message, setMessage] = useState<string>("");
  const [pending, startTransition] = useTransition();

  const messageLen = message.trim().length;
  const subjectLen = subject.trim().length;
  const canSubmit = !pending && subjectLen >= 3 && messageLen >= 20;

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!canSubmit) return;

    startTransition(async () => {
      try {
        const res = await fetch("/api/support/tickets", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            name: name.trim() || undefined,
            subject: subject.trim(),
            category,
            message: message.trim(),
          }),
        });
        if (!res.ok) {
          const data = (await res.json().catch(() => null)) as {
            error?: string;
          } | null;
          throw new Error(data?.error ?? "Falha ao enviar.");
        }
        toast.success("Recebemos seu ticket. Nossa equipe responde em até 24h.");
        setSubject("");
        setMessage("");
        setCategory("duvida");
        onOpenChange(false);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Erro desconhecido";
        toast.error(msg);
      }
    });
  }

  const mailtoFallback = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(
    subject || "Suporte Lumio",
  )}&body=${encodeURIComponent(message)}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Falar com o suporte</DialogTitle>
          <DialogDescription>
            Conta o que tá rolando. Respondemos em até 24h por email.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="support-name">Nome</Label>
              <Input
                id="support-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Seu nome"
                maxLength={200}
                disabled={pending}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="support-email">Email</Label>
              <Input
                id="support-email"
                value={user.email}
                disabled
                readOnly
                className="opacity-70"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_180px]">
            <div className="space-y-1.5">
              <Label htmlFor="support-subject">Assunto</Label>
              <Input
                id="support-subject"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Resumo curto do que aconteceu"
                maxLength={200}
                disabled={pending}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="support-category">Categoria</Label>
              <select
                id="support-category"
                value={category}
                onChange={(e) => setCategory(e.target.value as Category)}
                disabled={pending}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background focus-visible:border-ring"
              >
                {CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="support-message">Mensagem</Label>
              <span
                className={`text-[11px] tabular-nums ${
                  messageLen < 20
                    ? "text-muted-foreground"
                    : "text-emerald-600 dark:text-emerald-400"
                }`}
              >
                {messageLen}/20 mín.
              </span>
            </div>
            <Textarea
              id="support-message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Descreve com calma o que tá acontecendo, passos pra reproduzir o problema (se for bug), etc."
              rows={6}
              maxLength={5000}
              disabled={pending}
              required
            />
          </div>

          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={pending}
            >
              Cancelar
            </Button>
            <Button type="submit" variant="gradient" disabled={!canSubmit}>
              {pending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Enviando…
                </>
              ) : (
                <>
                  <Send className="h-4 w-4" /> Enviar ticket
                </>
              )}
            </Button>
          </DialogFooter>

          <p className="pt-2 border-t border-border/40 text-xs text-muted-foreground text-center">
            Prefere email direto?{" "}
            <a
              href={mailtoFallback}
              className="inline-flex items-center gap-1 text-primary hover:underline"
            >
              <Mail className="h-3 w-3" /> {SUPPORT_EMAIL}
            </a>
          </p>
        </form>
      </DialogContent>
    </Dialog>
  );
}
