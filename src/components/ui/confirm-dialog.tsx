"use client";

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./dialog";
import { Button } from "./button";

/**
 * ConfirmDialog — substituição in-app pro window.confirm() do browser.
 * Mount UMA vez no root layout. Chama via `confirmAction()` em qualquer lugar.
 *
 *   const ok = await confirmAction({
 *     title: "Excluir matéria",
 *     description: "Essa ação não pode ser desfeita.",
 *     destructive: true,
 *     confirmText: "Excluir",
 *   });
 *   if (!ok) return;
 */

export type ConfirmOptions = {
  title: string;
  description?: string;
  confirmText?: string;
  cancelText?: string;
  destructive?: boolean;
};

type ConfirmState = ConfirmOptions & {
  open: boolean;
  resolve: ((value: boolean) => void) | null;
};

let externalEnqueue:
  | ((options: ConfirmOptions, resolve: (v: boolean) => void) => void)
  | null = null;

export function confirmAction(options: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    if (!externalEnqueue) {
      // Fallback raríssimo (SSR / dialog não montado). Usa window.confirm.
      if (typeof window !== "undefined") {
        const msg = options.description
          ? `${options.title}\n\n${options.description}`
          : options.title;
        resolve(window.confirm(msg));
      } else {
        resolve(false);
      }
      return;
    }
    externalEnqueue(options, resolve);
  });
}

export function ConfirmDialog() {
  const [state, setState] = useState<ConfirmState>({
    open: false,
    title: "",
    resolve: null,
  });

  useEffect(() => {
    externalEnqueue = (options, resolve) => {
      setState((prev) => {
        // Se já tinha um pendente (improvável), cancela o anterior
        prev.resolve?.(false);
        return { ...options, open: true, resolve };
      });
    };
    return () => {
      externalEnqueue = null;
    };
  }, []);

  const handleAnswer = (ok: boolean) => {
    state.resolve?.(ok);
    setState((s) => ({ ...s, open: false, resolve: null }));
  };

  return (
    <Dialog
      open={state.open}
      onOpenChange={(open) => {
        if (!open) handleAnswer(false);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{state.title}</DialogTitle>
          {state.description && (
            <DialogDescription className="whitespace-pre-line">
              {state.description}
            </DialogDescription>
          )}
        </DialogHeader>
        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="ghost" onClick={() => handleAnswer(false)}>
            {state.cancelText ?? "Cancelar"}
          </Button>
          <Button
            variant={state.destructive ? "destructive" : "default"}
            onClick={() => handleAnswer(true)}
            autoFocus
          >
            {state.confirmText ?? "Confirmar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
