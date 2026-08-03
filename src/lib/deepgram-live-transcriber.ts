"use client";

/**
 * DeepgramLiveTranscriber — transcrição ao vivo, palavra a palavra.
 *
 * Substitui o `LiveSegmentTranscriber` (que parava o MediaRecorder a cada 15s e
 * colava blocos) nos navegadores onde a Web Speech API não serve, e melhora a
 * qualidade em todos, porque leva o glossário do aluno junto.
 *
 * O áudio vai do navegador DIRETO pro Deepgram por WebSocket: numa aula de 2h
 * passar isso pelo nosso servidor custaria banda e latência à toa. O que o
 * servidor faz é só entregar um token efêmero (`/api/deepgram-token`) — a
 * chave-mestra nunca chega no cliente.
 *
 * Dois tipos de resultado chegam:
 *  - `interim`: o palpite do momento, muda enquanto a pessoa fala. É o que dá a
 *    sensação de estar sendo escrito.
 *  - `final`: o trecho fechado, não muda mais. É o que vira transcrição salva.
 *
 * É best-effort, igual ao transcritor antigo: qualquer falha chama `onError` e
 * NÃO derruba a gravação. O áudio completo continua sendo enviado no stop, e o
 * Whisper daquele arquivo segue como rede de segurança.
 */

const DG_WS = "wss://api.deepgram.com/v1/listen";

/**
 * `nova-2` e não `nova-3`: o keyterm prompting do nova-3 só vale pra inglês, e
 * a aula é em português. No nova-2 o glossário entra como `keywords`, que é o
 * que existe pra pt-BR. Se/quando o nova-3 abrir keyterm em português, trocar
 * aqui e no `buildDeepgramKeyterms`.
 */
const DG_MODEL = "nova-2";
const DG_LANGUAGE = "pt-BR";

/**
 * De quanto em quanto tempo o MediaRecorder entrega áudio pro socket. 250ms é o
 * equilíbrio: menor que isso vira overhead de mensagem sem ganho perceptível,
 * maior começa a dar solavanco no texto aparecendo.
 */
const TIMESLICE_MS = 250;

const MIME_CANDIDATES = [
  "audio/webm;codecs=opus",
  "audio/webm",
] as const;

function pickMime(): string {
  if (typeof MediaRecorder === "undefined") return "";
  for (const m of MIME_CANDIDATES) {
    if (MediaRecorder.isTypeSupported(m)) return m;
  }
  return "";
}

export type DeepgramLiveOptions = {
  stream: MediaStream;
  /** Termos do aluno (matérias, curso, jargão aprendido). Vira `keywords`. */
  keyterms?: string[];
  /** Palpite do momento — troca a cada palavra. Renderizar em cinza. */
  onInterim: (text: string) => void;
  /** Trecho fechado. Só isto entra na transcrição salva. */
  onFinal: (text: string) => void;
  /** Não fatal: o chamador decide se avisa ou cai pro modo antigo. */
  onError?: (err: unknown) => void;
  /** Chamado uma vez quando o socket abre — a UI usa pra trocar o rótulo. */
  onOpen?: () => void;
};

/** O navegador suporta o que precisamos pra streaming? */
export function isDeepgramLiveSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof WebSocket !== "undefined" &&
    typeof MediaRecorder !== "undefined" &&
    pickMime() !== ""
  );
}

export class DeepgramLiveTranscriber {
  private ws: WebSocket | null = null;
  private recorder: MediaRecorder | null = null;
  private running = false;
  private keepAlive: number | null = null;

  constructor(private opts: DeepgramLiveOptions) {}

  /**
   * Resolve `true` se o streaming subiu. `false` significa "não deu, use o
   * caminho antigo" — nunca lança, porque isto roda no meio de uma aula
   * começando e derrubar a gravação seria pior que transcrever em bloco.
   */
  async start(): Promise<boolean> {
    if (this.running) return true;
    const mime = pickMime();
    if (!mime) return false;

    let token: string;
    // O glossário vem na MESMA resposta do token (o servidor monta a partir das
    // matérias, do perfil e das aulas anteriores). O `keyterms` das opções, se
    // vier, tem prioridade — serve pra chamador que já sabe a matéria da aula.
    let keyterms = this.opts.keyterms ?? [];
    try {
      const res = await fetch("/api/deepgram-token", { method: "POST" });
      if (!res.ok) return false;
      const data = (await res.json()) as {
        ok?: boolean;
        token?: string;
        keyterms?: string[];
      };
      if (!data?.ok || !data.token) return false;
      token = data.token;
      if (keyterms.length === 0 && Array.isArray(data.keyterms)) {
        keyterms = data.keyterms;
      }
    } catch (err) {
      this.opts.onError?.(err);
      return false;
    }

    const params = new URLSearchParams({
      model: DG_MODEL,
      language: DG_LANGUAGE,
      // pontuação e números escritos por extenso — sem isso a transcrição vem
      // como um bloco corrido, impossível de reler depois.
      smart_format: "true",
      // é isto que faz o texto aparecer SENDO ESCRITO.
      interim_results: "true",
      // fecha o trecho depois de ~1s de silêncio: professor faz pausa curta o
      // tempo todo, valor menor picotaria frase no meio.
      endpointing: "1000",
    });
    // Glossário: cada termo vai como um `keywords` próprio. `:2` é o
    // intensificador — favorece a grafia sem forçar (valor alto faz o modelo
    // "ouvir" o termo onde ele não está).
    for (const t of keyterms) {
      params.append("keywords", `${t}:2`);
    }

    try {
      // O token vai pelo subprotocolo porque o WebSocket do navegador não
      // aceita header Authorization.
      this.ws = new WebSocket(`${DG_WS}?${params.toString()}`, [
        "token",
        token,
      ]);
    } catch (err) {
      this.opts.onError?.(err);
      return false;
    }

    const ws = this.ws;
    const aberto = await new Promise<boolean>((resolve) => {
      let resolvido = false;
      const done = (v: boolean) => {
        if (resolvido) return;
        resolvido = true;
        resolve(v);
      };
      ws.onopen = () => done(true);
      ws.onerror = (e) => {
        this.opts.onError?.(e);
        done(false);
      };
      // Rede da faculdade costuma ser ruim: se o handshake não fecha em 8s,
      // desiste e deixa o chamador cair no modo antigo em vez de a aula
      // começar sem transcrição nenhuma.
      window.setTimeout(() => done(false), 8_000);
    });
    if (!aberto) {
      try {
        ws.close();
      } catch {}
      this.ws = null;
      return false;
    }

    ws.onmessage = (evt) => {
      try {
        const msg = JSON.parse(String(evt.data)) as {
          type?: string;
          is_final?: boolean;
          channel?: { alternatives?: Array<{ transcript?: string }> };
        };
        if (msg.type && msg.type !== "Results") return;
        const texto = msg.channel?.alternatives?.[0]?.transcript ?? "";
        if (!texto.trim()) return;
        if (msg.is_final) this.opts.onFinal(texto.trim());
        else this.opts.onInterim(texto.trim());
      } catch (err) {
        this.opts.onError?.(err);
      }
    };
    ws.onclose = () => {
      this.running = false;
    };

    try {
      this.recorder = new MediaRecorder(this.opts.stream, { mimeType: mime });
      this.recorder.ondataavailable = (e) => {
        if (e.data.size === 0) return;
        if (ws.readyState !== WebSocket.OPEN) return;
        ws.send(e.data);
      };
      this.recorder.start(TIMESLICE_MS);
    } catch (err) {
      this.opts.onError?.(err);
      this.stop();
      return false;
    }

    // O Deepgram fecha conexão ociosa. Professor escrevendo no quadro em
    // silêncio por 20s derrubaria o socket no meio da aula.
    this.keepAlive = window.setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "KeepAlive" }));
      }
    }, 8_000);

    this.running = true;
    this.opts.onOpen?.();
    return true;
  }

  stop(): void {
    this.running = false;
    if (this.keepAlive !== null) {
      window.clearInterval(this.keepAlive);
      this.keepAlive = null;
    }
    try {
      // Só o recorder para; o MediaStream é do gravador principal (um único
      // getUserMedia na página) e continua gravando o arquivo da aula.
      if (this.recorder && this.recorder.state !== "inactive") {
        this.recorder.stop();
      }
    } catch {}
    this.recorder = null;
    try {
      if (this.ws?.readyState === WebSocket.OPEN) {
        // Avisa o Deepgram pra devolver o que ainda está no buffer antes de
        // fechar — senão a última frase da aula se perde.
        this.ws.send(JSON.stringify({ type: "CloseStream" }));
      }
      this.ws?.close();
    } catch {}
    this.ws = null;
  }
}
