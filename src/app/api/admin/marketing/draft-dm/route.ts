/**
 * POST /api/admin/marketing/draft-dm
 *
 * Gera draft de DM personalizado pra outbound. Recebe handle/perfil + voz desejada,
 * usa Claude pra produzir texto + reasoning + score (0-10).
 *
 * Body: { handle, platform, profile_hint?, voice? }
 * Resp: { draft_text, reasoning, score, score_reason }
 *
 * IMPORTANTE: NÃO envia DM. Só gera texto pra founder copiar/colar manualmente
 * (Graph API requer App Review pra DM proativa; copy/paste é caminho mais seguro).
 */

import { createMessage } from "@/lib/llm-fallback";
import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { escapeForPrompt } from "@/lib/api-security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SYSTEM_PROMPT = `Você é o time de marketing do Lumio, um SaaS brasileiro que transforma aulas universitárias em resumos, flashcards e quizzes usando IA. Voz "time Lumio" — nunca mencione nome de founder ou pessoa específica.

ANONIMATO É CRÍTICO: Nada do que você escreve pode revelar Gilberto Luporini ou qualquer pessoa real como criador. Sempre fale em "a gente", "o time", "time Lumio". Nunca "eu sou o fundador".

REGRAS DE COLD DM (Instagram/TikTok pra estudantes BR):
- Máximo 4 linhas curtas. Mobile-first.
- Abrir com algo do perfil dele (nunca "oi tudo bem")
- 1 frase explicando relevância (não pitch corporativo)
- CTA suave: "se quiser dar uma olhada → lumioapp.net" (nunca "compre", "assine", "trial")
- Tom: estudante falando com estudante. NÃO empresarial.
- Nada de emoji em excesso (no máximo 1)
- Em pt-BR coloquial, sem gerúndios paulista, sem "está sendo"
- Nunca prometer aprovação garantida ou nota X
- Nunca mencionar "vendi pra 1000 alunos" / claims de números

VOZ "adaptive" = ajustar formal/casual baseado no curso. Medicina = mais técnico. Marketing = mais leve. Direito = mais sóbrio.
VOZ "casual" = padrão coloquial estudante.
VOZ "formal" = pra acadêmicos mais sérios (mestrado/doutorado).

SAÍDA: JSON estrito:
{
  "draft_text": "texto da DM, máximo 4 linhas, com quebras de linha \\n",
  "reasoning": "1-2 frases explicando por que essa abordagem com esse perfil",
  "score": 7.5,
  "score_reason": "1 frase: pq esse perfil tem X% de chance de virar lead"
}

Score 0-10:
- 0-3: perfil ruim (não-estudante, fake, idade errada, curso fora ICP)
- 4-6: perfil OK mas frio (sem sinal de dor)
- 7-8: estudante BR engajado, sinal de estudo/cansaço/prova
- 9-10: dor explícita ("não aguento mais anotar", "TCC me matando", etc)`;

export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY não configurada" },
      { status: 500 },
    );
  }

  const body = await req.json().catch(() => null);
  if (!body?.handle || !body?.platform) {
    return NextResponse.json(
      { error: "handle e platform são obrigatórios" },
      { status: 400 },
    );
  }

  const handle = escapeForPrompt(String(body.handle).slice(0, 100));
  const platform = escapeForPrompt(String(body.platform).slice(0, 30));
  const profileHint = escapeForPrompt(
    String(body.profile_hint || "").slice(0, 2000),
  );
  const voice = ["formal", "casual", "adaptive"].includes(body.voice)
    ? body.voice
    : "casual";

  const userPrompt = `Plataforma: ${platform}
Handle: ${handle}
Voz desejada: ${voice}

Contexto do perfil (bio/posts recentes/observações):
${profileHint || "(sem contexto — perfil ainda não pesquisado, gere DM genérica pra estudante BR)"}

Gere o JSON conforme schema do system prompt.`;

  try {
    const resp = await createMessage({
      model: "claude-haiku-4-5",
      max_tokens: 600,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userPrompt }],
    });

    const textBlock = resp.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      return NextResponse.json(
        { error: "resposta do modelo vazia" },
        { status: 500 },
      );
    }

    const raw = textBlock.text.trim();
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return NextResponse.json(
        { error: "modelo não retornou JSON parseável", raw },
        { status: 500 },
      );
    }

    const parsed = JSON.parse(jsonMatch[0]) as {
      draft_text?: string;
      reasoning?: string;
      score?: number;
      score_reason?: string;
    };

    return NextResponse.json({
      draft_text: parsed.draft_text || "",
      reasoning: parsed.reasoning || "",
      score: typeof parsed.score === "number" ? parsed.score : null,
      score_reason: parsed.score_reason || "",
      voice,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "erro desconhecido";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
