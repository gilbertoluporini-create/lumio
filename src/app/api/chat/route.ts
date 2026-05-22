import Anthropic from "@anthropic-ai/sdk";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SlideCtx = { pageNumber: number; title?: string; text: string };

type Body = {
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  context: {
    lectureTitle: string;
    subject: string;
    transcript: string;
    slides?: SlideCtx[];
  };
};

function buildSystemPrompt(ctx: Body["context"]) {
  const transcript =
    ctx.transcript.trim().length > 0
      ? ctx.transcript.trim()
      : "(A aula ainda não tem transcrição. Responda com clareza dizendo que precisa do conteúdo da aula pra ser específico, mas você pode falar sobre o tópico em geral.)";

  const slidesBlock =
    ctx.slides && ctx.slides.length > 0
      ? `\n\nSLIDES DO PROFESSOR (PDF anexado pelo aluno):\n"""\n${ctx.slides
          .map(
            (s) =>
              `[Slide ${s.pageNumber}${s.title ? ` — ${s.title}` : ""}]\n${s.text || "(slide sem texto)"}`,
          )
          .join("\n\n")}\n"""`
      : "";

  return `Você é o Lumio, um assistente de estudos. Você está dentro da plataforma do usuário, ajudando ele a entender uma aula que está sendo transcrita em tempo real.

CONTEXTO DA AULA:
- Matéria: ${ctx.subject}
- Título da aula: ${ctx.lectureTitle}

TRANSCRIÇÃO DA AULA (atual, pode estar incompleta se ainda estiver sendo gravada):
"""
${transcript}
"""${slidesBlock}

INSTRUÇÕES:
- Responda sempre em português do Brasil, com tom claro e didático.
- Quando o usuário perguntar sobre a aula, BASE sua resposta na transcrição e nos slides. Quando útil, cite "no slide N" ou "como o professor disse...".
- Se houver slides e o aluno perguntar sobre algo do conteúdo, conecte com o slide correspondente (referencie o número).
- Se a transcrição/slides não cobrirem o que foi perguntado, deixe isso explícito e responda com conhecimento geral.
- Seja conciso por padrão. Use listas/numeração quando ajudar. Use **negrito** pra termos-chave.
- Se pedir resumo, faça em tópicos curtos.
- Se pedir questões de revisão, dê perguntas + respostas comentadas.
- Nunca invente fatos que não estejam na transcrição/slides quando o usuário perguntar especificamente sobre a aula.`;
}

function fakeStreamResponse(ctx: Body["context"], userMsg: string) {
  const has = ctx.transcript.trim().length > 0;
  const lines = [
    `Modo demo (sem ANTHROPIC_API_KEY configurada).`,
    ``,
    `Você perguntou: **${userMsg}**`,
    ``,
    has
      ? `Vi ${ctx.transcript.trim().split(/\s+/).length} palavras de transcrição da aula de **${ctx.subject}** — *${ctx.lectureTitle}*. Quando você configurar a chave da Anthropic em \`.env.local\`, eu vou responder com base nessa transcrição e no seu conteúdo de aula.`
      : `Ainda não tem transcrição. Comece a gravação ou cole o texto, e configure a \`ANTHROPIC_API_KEY\` em \`.env.local\` pra receber respostas reais do Claude.`,
    ``,
    `Como configurar:`,
    `1. Crie o arquivo \`.env.local\` na raiz do projeto`,
    `2. Adicione: \`ANTHROPIC_API_KEY=sk-ant-...\``,
    `3. Reinicie \`npm run dev\``,
  ];
  const text = lines.join("\n");
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      for (const ch of text) {
        controller.enqueue(encoder.encode(ch));
        await new Promise((r) => setTimeout(r, 6));
      }
      controller.close();
    },
  });
}

export async function POST(req: Request) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return new Response("JSON inválido", { status: 400 });
  }

  if (!body?.messages?.length) {
    return new Response("Sem mensagens", { status: 400 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  const system = buildSystemPrompt(body.context);
  const lastUserMessage =
    [...body.messages].reverse().find((m) => m.role === "user")?.content ?? "";

  // Demo fallback when no API key is configured
  if (!apiKey) {
    const stream = fakeStreamResponse(body.context, lastUserMessage);
    return new Response(stream, {
      headers: {
        "content-type": "text/plain; charset=utf-8",
        "cache-control": "no-store",
      },
    });
  }

  const client = new Anthropic({ apiKey });

  try {
    const stream = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1500,
      system,
      stream: true,
      messages: body.messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
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
    console.error("anthropic error", err);
    return new Response(
      `Erro ao chamar Anthropic: ${(err as Error).message}`,
      { status: 500 },
    );
  }
}
