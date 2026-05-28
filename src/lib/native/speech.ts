// Camada de reconhecimento de fala NATIVO (iOS/Android via Capacitor).
// No web não faz nada — o hook useSpeechRecognition cai no Web Speech API.
// Detecta nativo via window.Capacitor (injetado pelo bridge) pra não puxar
// @capacitor/core no bundle web. Plugin é importado dinamicamente só no nativo.

type ListenerHandle = { remove: () => Promise<void> };

type CapacitorGlobal = {
  isNativePlatform?: () => boolean;
  getPlatform?: () => string;
};

export function isNativePlatform(): boolean {
  if (typeof window === "undefined") return false;
  const cap = (window as unknown as { Capacitor?: CapacitorGlobal }).Capacitor;
  return cap?.isNativePlatform?.() === true;
}

export type NativeSpeechCallbacks = {
  lang: string;
  onInterim?: (text: string) => void;
  onFinal?: (text: string) => void;
  onStateChange?: (state: "idle" | "listening" | "stopping") => void;
  onError?: (message: string) => void;
};

export type NativeSpeechSession = {
  start: () => Promise<void>;
  stop: () => Promise<void>;
};

async function loadPlugin() {
  const mod = await import("@capacitor-community/speech-recognition");
  return mod.SpeechRecognition;
}

export async function nativeSpeechAvailable(): Promise<boolean> {
  if (!isNativePlatform()) return false;
  try {
    const SpeechRecognition = await loadPlugin();
    const { available } = await SpeechRecognition.available();
    return available;
  } catch {
    return false;
  }
}

// Cria uma sessão contínua. O motor de fala do iOS para sozinho no silêncio,
// então a gente reinicia enquanto shouldListen for true. Cada utterance vira
// um onFinal; os parciais vão pro onInterim em tempo real.
export function createNativeSpeechSession(cb: NativeSpeechCallbacks): NativeSpeechSession {
  let shouldListen = false;
  let lastPartial = "";
  let partialHandle: ListenerHandle | null = null;
  let stateHandle: ListenerHandle | null = null;

  async function beginListening() {
    const SpeechRecognition = await loadPlugin();
    try {
      await SpeechRecognition.start({
        language: cb.lang,
        partialResults: true,
        popup: false,
        maxResults: 1,
      });
    } catch (err) {
      cb.onError?.((err as Error)?.message || "Falha ao iniciar reconhecimento de fala.");
    }
  }

  async function start() {
    if (shouldListen) return;
    const SpeechRecognition = await loadPlugin();

    const perm = await SpeechRecognition.checkPermissions();
    if (perm.speechRecognition !== "granted") {
      const req = await SpeechRecognition.requestPermissions();
      if (req.speechRecognition !== "granted") {
        cb.onError?.("Permissão de microfone/fala negada. Habilite nos Ajustes.");
        cb.onStateChange?.("idle");
        return;
      }
    }

    shouldListen = true;

    if (!partialHandle) {
      partialHandle = await SpeechRecognition.addListener("partialResults", (data) => {
        const text = data.matches?.[0] ?? "";
        lastPartial = text;
        cb.onInterim?.(text);
      });
    }
    if (!stateHandle) {
      stateHandle = await SpeechRecognition.addListener("listeningState", (data) => {
        if (data.status === "started") {
          cb.onStateChange?.("listening");
          return;
        }
        // parou (silêncio/timeout): fecha o utterance atual como final
        if (lastPartial.trim()) {
          cb.onFinal?.(lastPartial);
          cb.onInterim?.("");
          lastPartial = "";
        }
        if (shouldListen) {
          // reinicia pra transcrição contínua
          setTimeout(() => {
            if (shouldListen) beginListening().catch(() => {});
          }, 250);
        } else {
          cb.onStateChange?.("idle");
        }
      });
    }

    await beginListening();
  }

  async function stop() {
    shouldListen = false;
    cb.onStateChange?.("stopping");
    try {
      const SpeechRecognition = await loadPlugin();
      await SpeechRecognition.stop();
    } catch {}
    try {
      await partialHandle?.remove();
    } catch {}
    try {
      await stateHandle?.remove();
    } catch {}
    partialHandle = null;
    stateHandle = null;
    lastPartial = "";
    cb.onStateChange?.("idle");
  }

  return { start, stop };
}
