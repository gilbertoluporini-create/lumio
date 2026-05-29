import { createMessage } from "@/lib/llm-fallback";
import { LIMITS, escapeForPrompt, logAndSanitize } from "@/lib/api-security";
import { createClient } from "@/lib/supabase/server";
import { getClientIp, limitOrThrow } from "@/lib/rate-limit";
import { assertLectureOwnership } from "@/lib/lecture-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

type Body = {
  transcript: string;
  subject: string;
  lectureTitle: string;
  lectureId?: string;
};

const SYSTEM_PROMPT = `Você é um editor de transcrições de aulas universitárias em português brasileiro. Sua tarefa é melhorar a legibilidade SEM alterar o significado:

REGRAS:
- Corrija palavras que claramente foram reconhecidas errado pelo speech-to-text (ex: termos médicos/técnicos).
- Adicione pontuação ausente (vírgulas, pontos finais).
- Quebre em parágrafos quando o tópico muda (1 parágrafo a cada 3-6 frases relacionadas).
- Capitalize início de frases e nomes próprios.
- NÃO invente conteúdo. Se uma frase está incompleta ou incoerente, deixe assim.
- NÃO resuma. Mantenha a integridade do texto.
- NÃO traduza. Mantenha em português.
- Use o CONTEXTO da matéria (${"{{SUBJECT}}"}) e título ("${"{{TITLE}}"}") pra escolher melhor entre palavras homófonas.
- Retorne APENAS o texto refinado, sem comentários, sem markdown.`;

export async function POST(req: Request) {
  const ip = getClientIp(req);
  const ipLimit = limitOrThrow(`refine:ip:${ip}`, 5, 60_000);
  if (ipLimit) return ipLimit;

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return Response.json({ error: "JSON inválido" }, { status: 400 });
  }

  const transcript = (body.transcript || "").trim();
  if (!transcript) {
    return Response.json({ error: "Transcrição vazia." }, { status: 400 });
  }
  if (transcript.length > LIMITS.TRANSCRIPT_CHARS) {
    return Response.json({ error: "Transcrição muito longa." }, { status: 413 });
  }

  const supabaseEnabled = !!(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
  let userId: string | null = null;
  if (supabaseEnabled) {
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return Response.json(
        { error: "Configuração de servidor incompleta." },
        { status: 503 },
      );
    }
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return Response.json({ error: "Faça login." }, { status: 401 });
    }
    userId = user.id;

    const userLimit = limitOrThrow(`refine:user:${userId}`, 8, 60_000);
    if (userLimit) return userLimit;

    if (body.lectureId) {
      const owns = await assertLectureOwnership(
        userId as string,
        body.lectureId,
      );
      if (!owns) {
        return Response.json({ error: "Aula não encontrada." }, { status: 404 });
      }
    }
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return Response.json(
      { error: "ANTHROPIC_API_KEY não configurada." },
      { status: 503 },
    );
  }

  const system = SYSTEM_PROMPT.replace("{{SUBJECT}}", escapeForPrompt(body.subject))
    .replace("{{TITLE}}", escapeForPrompt(body.lectureTitle));

  try {
    const resp = await createMessage({
      model: "claude-haiku-4-5", // Haiku é suficiente pra cleanup
      max_tokens: 8000,
      system: [
        { type: "text", text: system, cache_control: { type: "ephemeral" } },
      ],
      messages: [
        {
          role: "user",
          content: `Refine a transcrição a seguir:\n\n${escapeForPrompt(transcript)}`,
        },
      ],
    });

    const textBlock = resp.content.find((b) => b.type === "text");
    const refined = textBlock && textBlock.type === "text" ? textBlock.text.trim() : "";

    if (!refined) {
      return Response.json(
        { error: "Não foi possível refinar a transcrição." },
        { status: 500 },
      );
    }

    return Response.json({ refined });
  } catch (err) {
    return Response.json(logAndSanitize("api/refine-transcript", err), {
      status: 500,
    });
  }
}
