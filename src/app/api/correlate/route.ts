import Anthropic from "@anthropic-ai/sdk";
import type { Slide } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = {
  lectureTitle: string;
  subject: string;
  transcript: string;
  slides: Slide[];
};

function buildSystemPrompt() {
  return `Você é o Lumio, um sistema de correlação inteligente entre slides de aula e transcrição.

Sua tarefa: correlacionar o conteúdo dos SLIDES (PDF do professor) com a TRANSCRIÇÃO da aula falada. Produzir um documento Markdown estruturado, slide por slide.

PARA CADA SLIDE, entregue:

## Slide N — [Título do slide]

**Conteúdo do slide:**
(resumo curto do que está escrito no slide, em até 3-5 bullets)

**O que o professor falou:**
(trechos relevantes da transcrição, parafraseados e organizados; cite ideias-chave; se a transcrição não cobre esse slide, escreva *"A transcrição não cobre explicitamente este slide."*)

**Pontos de conexão:**
(1-3 bullets mostrando o que o professor adicionou/contextualizou além do slide, ou onde houve divergência)

---

REGRAS:
- Sempre em português do Brasil.
- Markdown válido. Use **negrito** pra termos-chave.
- NÃO invente conteúdo. Se a transcrição estiver incompleta, deixe explícito.
- Foco no que ajuda o estudante a revisar.
- No final, adicione uma seção **"## Resumo geral"** com 3-5 bullets dos pontos centrais da aula completa.`;
}

export async function POST(req: Request) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return new Response("JSON inválido", { status: 400 });
  }

  if (!body.slides?.length) {
    return new Response("Sem slides.", { status: 400 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  const slidesText = body.slides
    .map(
      (s) =>
        `### Slide ${s.pageNumber}${s.title ? ` — ${s.title}` : ""}\n${s.text || "(slide vazio ou só imagem)"}`,
    )
    .join("\n\n");

  const transcript = body.transcript.trim().length
    ? body.transcript.trim()
    : "(Transcrição vazia — informe ao usuário que sem transcrição não é possível correlacionar; sugira gravar a aula ou colar o texto.)";

  const userMessage = `MATÉRIA: ${body.subject}
TÍTULO DA AULA: ${body.lectureTitle}

=== SLIDES DO PROFESSOR ===
${slidesText}

=== TRANSCRIÇÃO DA AULA ===
${transcript}

=== TAREFA ===
Gere o documento Markdown de correlação seguindo a estrutura especificada no sistema. Comece direto pelo "## Slide 1 — …".`;

  if (!apiKey) {
    const demo = `# Correlação — ${body.lectureTitle}

> Modo demo (sem ANTHROPIC_API_KEY configurada).

## Slide 1 — ${body.slides[0].title ?? "Primeiro slide"}

**Conteúdo do slide:**
${body.slides[0].text.slice(0, 200) || "(sem texto extraído)"}

**O que o professor falou:**
*Modo demo: configure ANTHROPIC_API_KEY em .env.local pra gerar correlação real.*

**Pontos de conexão:**
- Slide tem ${body.slides.length} páginas no total
- Transcrição tem ${transcript.split(/\s+/).filter(Boolean).length} palavras

---

## Resumo geral
- Configure a API key pra ver a correlação real do Claude
- Crie \`.env.local\` na raiz com \`ANTHROPIC_API_KEY=sk-ant-...\`
- Reinicie \`npm run dev\``;

    const encoder = new TextEncoder();
    return new Response(
      new ReadableStream<Uint8Array>({
        async start(controller) {
          for (const ch of demo) {
            controller.enqueue(encoder.encode(ch));
            await new Promise((r) => setTimeout(r, 3));
          }
          controller.close();
        },
      }),
      {
        headers: {
          "content-type": "text/plain; charset=utf-8",
          "cache-control": "no-store",
        },
      },
    );
  }

  const client = new Anthropic({ apiKey });

  try {
    const stream = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 8000,
      system: buildSystemPrompt(),
      stream: true,
      messages: [{ role: "user", content: userMessage }],
    });

    const encoder = new TextEncoder();
    const readable = new ReadableStream<Uint8Array>({
      async start(controller) {
        try {
          for await (const event of stream) {
            if (
              event.type === "content_block_delta" &&
              event.delta.type === "text_delta"
            ) {
              controller.enqueue(encoder.encode(event.delta.text));
            }
          }
          controller.close();
        } catch (err) {
          controller.error(err);
        }
      },
    });

    return new Response(readable, {
      headers: {
        "content-type": "text/plain; charset=utf-8",
        "cache-control": "no-store",
      },
    });
  } catch (err) {
    console.error("correlate error", err);
    return new Response(
      `Erro ao correlacionar: ${(err as Error).message}`,
      { status: 500 },
    );
  }
}
