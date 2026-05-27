/**
 * POST /api/admin/marketing/content/suggest-ideas
 *
 * Sugere 5 ideias editoriais frescas pra alimentar a fábrica de conteúdo.
 *
 * Body (opcional):
 *   { category?, recent_titles?, count? }
 *
 * Resp:
 *   { ideas: [{ title, summary, category }] }
 *
 * Estratégia:
 *  - IA recebe contexto editorial (Lumio = educacional neurociência) + categoria opcional
 *  - Recebe títulos recentes pra NÃO repetir
 *  - Retorna 5 ideias prontas pra criar draft
 *
 * Apenas admin.
 */

import Anthropic from "@anthropic-ai/sdk";
import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/server";
import { escapeForPrompt } from "@/lib/api-security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SYSTEM_PROMPT = `Você é o editor-chefe do Lumio, um content brand educacional sobre como o cérebro aprende. Sua função é gerar IDEIAS de posts que viram autoridade — não vendas.

PRINCÍPIOS EDITORIAIS:
- Educacional/neurociência primeiro. Cada ideia entrega conhecimento útil.
- Lumio nunca é o protagonista: é a ferramenta que operacionaliza o método.
- Estudante BR (faculdade) é o alvo, mas ideias devem ser interessantes pra QUALQUER pessoa que aprende.
- Evidência científica > opinião pessoal. Cita Ebbinghaus, Cepeda, Roediger, Karpicke, Dunlosky, Bjork, etc QUANDO REAL.
- Anonimato: nada de "eu pesquisei", "minha experiência" — sempre "a gente", "o time".
- Polêmica boa = crítica fundamentada ao sistema BR (decoreba, releitura passiva, prova como medida). Polêmica ruim = ataque pessoal, política, religião.

EXEMPLOS DE BOAS IDEIAS (categoria educacional):
- "Por que ler 3 vezes não funciona — o engano do 'familiaridade = aprendizado'"
- "Curva do esquecimento: o que Ebbinghaus descobriu em 1885 que ainda muda como você estuda"
- "O cérebro que dorme estuda mais que o que vira a noite: o papel do sono na consolidação"
- "Active recall vs releitura: por que tentar lembrar dói mais e funciona melhor"
- "Pomodoro existe há 40 anos. Por que ninguém te ensinou usar direito?"

EXEMPLOS DE IDEIAS DE OPINIÃO:
- "Universidade brasileira ainda trata aluno como gravador de aula — e o resultado mostra"
- "Decoreba não é burrice do aluno: é desenho do sistema avaliativo"

EXEMPLOS DE IDEIAS DE DADOS:
- "ENADE 2024: apenas X% dos universitários BR usam técnicas de estudo baseadas em evidência"
- "5 dados do IBGE que mostram por que a universidade BR precisa repensar avaliação"

EXEMPLOS DE BTS (behind the scenes):
- "Como a gente decidiu que pt-BR era prioridade #1 sobre features do app"
- "O que aprendemos depois de 100 estudantes testando: ninguém quer outro Anki"

OUTPUT: JSON estrito.

{
  "ideas": [
    {
      "title": "máximo 80 chars, hook forte, evita clickbait barato",
      "summary": "2-3 frases explicando o ângulo, dados/evidências que vão usar, gancho com o leitor",
      "category": "educacional" | "opiniao" | "dados" | "bts"
    },
    ...
  ]
}`;

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

  const body = await req.json().catch(() => ({}));
  const requestedCategory = ["educacional", "opiniao", "dados", "bts"].includes(
    body?.category,
  )
    ? body.category
    : null;
  const count = Math.min(Math.max(Number(body?.count) || 5, 3), 10);

  // Pega títulos recentes pra evitar repetição
  const supabase = createAdminClient();
  const { data: recent } = await supabase
    .from("content_drafts")
    .select("idea_title")
    .order("created_at", { ascending: false })
    .limit(30);

  const recentTitles = (recent || [])
    .map((r) => r.idea_title)
    .filter(Boolean)
    .map((t) => `- ${t}`)
    .join("\n");

  const categoryHint = requestedCategory
    ? `Categoria FOCO desta rodada: ${requestedCategory}. Gere TODAS as ${count} ideias nessa categoria.`
    : `Mix de categorias: ~60% educacional, ~20% opinião, ~15% dados, ~5% bts.`;

  const userPrompt = `Gera ${count} ideias frescas pro Lumio.

${categoryHint}

${
  recentTitles
    ? `Títulos JÁ usados (NÃO repetir nem variar destes):\n${recentTitles}`
    : "Nenhuma ideia anterior — sinta-se livre."
}

Retorna JSON conforme schema do system prompt.`;

  try {
    const client = new Anthropic({ apiKey });
    const resp = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 2500,
      system: SYSTEM_PROMPT,
      messages: [
        { role: "user", content: escapeForPrompt(userPrompt).slice(0, 8000) },
      ],
    });

    const textBlock = resp.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      return NextResponse.json(
        { error: "resposta vazia do modelo" },
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
      ideas?: Array<{ title?: string; summary?: string; category?: string }>;
    };

    const ideas = (parsed.ideas || []).filter((i) => i.title && i.summary);

    return NextResponse.json({
      ideas,
      model: "claude-sonnet-4-6",
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "erro desconhecido";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
