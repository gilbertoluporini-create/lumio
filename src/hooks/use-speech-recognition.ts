"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  isNativePlatform,
  createNativeSpeechSession,
  type NativeSpeechSession,
} from "@/lib/native/speech";

type SpeechRecognitionAlternative = { transcript: string; confidence: number };
type SpeechRecognitionResult = {
  isFinal: boolean;
  0: SpeechRecognitionAlternative;
  length: number;
};
type SpeechRecognitionEvent = Event & {
  results: SpeechRecognitionResult[];
  resultIndex: number;
};
type SpeechRecognitionErrorEvent = Event & { error: string; message: string };

type ISpeechRecognition = EventTarget & {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((this: ISpeechRecognition, ev: SpeechRecognitionEvent) => unknown) | null;
  onerror: ((this: ISpeechRecognition, ev: SpeechRecognitionErrorEvent) => unknown) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
};

type GlobalWithSR = typeof globalThis & {
  SpeechRecognition?: new () => ISpeechRecognition;
  webkitSpeechRecognition?: new () => ISpeechRecognition;
};

export type SpeechState = "idle" | "listening" | "stopping";

export function isSpeechRecognitionSupported(): boolean {
  if (typeof window === "undefined") return false;
  // No app nativo (iOS/Android) usamos o plugin nativo, não o Web Speech API.
  if (isNativePlatform()) return true;
  const g = window as unknown as GlobalWithSR;
  return Boolean(g.SpeechRecognition || g.webkitSpeechRecognition);
}

export function useSpeechRecognition(opts: {
  lang?: string;
  onFinal?: (text: string) => void;
  onInterim?: (text: string) => void;
}) {
  const { lang = "pt-BR", onFinal, onInterim } = opts;
  const [supported, setSupported] = useState(true);
  const [state, setState] = useState<SpeechState>("idle");
  const [error, setError] = useState<string | null>(null);
  const recognitionRef = useRef<ISpeechRecognition | null>(null);
  const nativeSessionRef = useRef<NativeSpeechSession | null>(null);
  const shouldListenRef = useRef(false);
  const onFinalRef = useRef(onFinal);
  const onInterimRef = useRef(onInterim);

  useEffect(() => {
    onFinalRef.current = onFinal;
    onInterimRef.current = onInterim;
  }, [onFinal, onInterim]);

  useEffect(() => {
    const sup = isSpeechRecognitionSupported();
    setSupported(sup);
  }, []);

  const start = useCallback(() => {
    if (!isSpeechRecognitionSupported()) {
      setSupported(false);
      setError("Seu navegador não suporta reconhecimento de voz. Use Chrome, Edge ou Safari.");
      return;
    }
    // App nativo: usa o plugin de fala do dispositivo (Web Speech não roda no WKWebView).
    if (isNativePlatform()) {
      if (!nativeSessionRef.current) {
        nativeSessionRef.current = createNativeSpeechSession({
          lang,
          onInterim: (t) => onInterimRef.current?.(t),
          onFinal: (t) => onFinalRef.current?.(t),
          onStateChange: (s) => setState(s),
          onError: (msg) => setError(msg),
        });
      }
      setError(null);
      void nativeSessionRef.current.start();
      return;
    }
    if (recognitionRef.current) {
      try {
        recognitionRef.current.abort();
      } catch {}
      recognitionRef.current = null;
    }
    const g = window as unknown as GlobalWithSR;
    const Ctor = g.SpeechRecognition || g.webkitSpeechRecognition;
    if (!Ctor) return;
    const rec = new Ctor();
    rec.lang = lang;
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = 1;

    rec.onresult = (ev: SpeechRecognitionEvent) => {
      let interim = "";
      let finalAdd = "";
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const r = ev.results[i];
        const text = r[0].transcript;
        if (r.isFinal) {
          finalAdd += text;
        } else {
          interim += text;
        }
      }
      if (finalAdd && onFinalRef.current) onFinalRef.current(finalAdd);
      if (onInterimRef.current) onInterimRef.current(interim);
    };

    rec.onerror = (ev: SpeechRecognitionErrorEvent) => {
      const msg = ev.error || "unknown";
      if (msg === "no-speech" || msg === "aborted") return;
      if (msg === "not-allowed" || msg === "service-not-allowed") {
        setError("Permissão do microfone negada. Habilite o microfone nas configurações do navegador.");
        shouldListenRef.current = false;
        setState("idle");
      } else if (msg === "network") {
        setError("Erro de rede no reconhecimento. Tentando novamente…");
      } else {
        setError(`Erro: ${msg}`);
      }
    };

    rec.onend = () => {
      if (shouldListenRef.current) {
        try {
          rec.start();
        } catch {
          setState("idle");
          shouldListenRef.current = false;
        }
      } else {
        setState("idle");
      }
    };

    rec.onstart = () => {
      setError(null);
      setState("listening");
    };

    recognitionRef.current = rec;
    shouldListenRef.current = true;
    try {
      rec.start();
    } catch (err) {
      setError((err as Error).message);
      setState("idle");
    }
  }, [lang]);

  const stop = useCallback(() => {
    shouldListenRef.current = false;
    if (nativeSessionRef.current) {
      setState("stopping");
      void nativeSessionRef.current.stop();
      return;
    }
    setState("stopping");
    const rec = recognitionRef.current;
    if (rec) {
      try {
        rec.stop();
      } catch {}
    }
  }, []);

  useEffect(() => {
    return () => {
      shouldListenRef.current = false;
      if (nativeSessionRef.current) {
        void nativeSessionRef.current.stop();
        nativeSessionRef.current = null;
      }
      const rec = recognitionRef.current;
      if (rec) {
        try {
          rec.abort();
        } catch {}
      }
    };
  }, []);

  return { supported, state, error, start, stop };
}
