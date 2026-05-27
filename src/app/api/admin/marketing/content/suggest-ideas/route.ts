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

const SYSTEM_PROMPT = `Você é o editor-chefe do Lumio, um content brand sobre aprendizado, memória, cérebro e estudo baseado em evidência. Sua função é gerar IDEIAS de posts que viram AUTORIDADE — não vendas.

PRINCÍPIOS EDITORIAIS:
- Curiosidade científica primeiro. Cada post entrega um fato, dado ou descoberta que faz o leitor pensar "não sabia disso".
- Lumio nunca é o protagonista: é a ferramenta que opera no fim, quase invisível.
- Estudante BR é o alvo, mas ideias devem fascinar QUALQUER pessoa curiosa sobre como o cérebro funciona.
- Evidência > opinião. Cita pesquisadores, anos, instituições QUANDO REAL — nunca inventar.
- Anonimato: "a gente", "o time", "nós". Nada de "eu pesquisei".
- Tom: jornalismo científico em pt-BR, acessível mas não infantil. Tipo Quanta Magazine + Veja Saúde + The Atlantic Science.

================ CATEGORIAS (cada uma TEM UM ESTILO PRÓPRIO) ================

**curiosidade** (Você sabia? / fato surpreendente):
Hook tipo "Você sabia que...". Fato memorável, contraintuitivo, com origem credível mas que não exige paper específico.
- "Você sabia que o método Pomodoro foi criado em 1987 por um italiano usando um cronômetro em formato de tomate?"
- "Você sabia que sua memória de curto prazo segura só 4 itens — não 7 como se ensinava na escola?"
- "Você sabia que cantar uma matéria em voz alta aumenta retenção em até 30% (efeito de produção)?"
- "Por que crianças aprendem língua nova em 6 meses e adultos demoram anos — e o que isso ensina sobre estudar"
- "O cérebro consome 20% da sua energia mesmo sem estudar — é por isso que vc cansa pensando"

**pesquisa** (curadoria de paper recente / artigo científico):
Cita paper REAL ou estudo notório com autor + ano + revista. Resume em 1 frase a descoberta, em 1 frase a implicação prática.
- "Nature Neuroscience (2024): dormir após estudar fixa 40% mais conteúdo que estudar+dormir invertido. O que isso muda na sua semana de prova"
- "Roediger & Karpicke (2006, Science): só ler é a PIOR forma de estudar — testar dobra a retenção"
- "Cepeda et al. (2008): qual o intervalo perfeito entre revisões? Depende de quando é a prova — fórmula 10-20%"
- "Bjork (1994): a chamada 'desejável dificuldade' explica por que estudar fácil = aprender pouco"

**educacional** (método + técnica de estudo aplicada):
Foca em COMO fazer, não em fato. Passo a passo, framework, técnica nomeada.
- "Active Recall em 3 passos: a única forma de estudar que aguenta semana de prova"
- "Pomodoro pra concursos: por que 25min mata, e como ajustar pra 50/10"
- "Como criar flashcard que NÃO é decoreba — o teste da pergunta inversa"

**opiniao** (crítica fundamentada ao sistema):
Polêmica boa baseada em evidência, NUNCA ataque pessoal.
- "Universidade brasileira ainda trata aluno como gravador de aula"
- "Decoreba não é burrice do aluno: é desenho do sistema avaliativo"

**dados** (curadoria de números BR/global):
Fonte oficial (ENADE, IBGE, OECD, UNESCO, etc), interpretação clara.
- "ENADE 2024: estudantes que usam técnicas baseadas em evidência tiram nota X% maior"
- "OECD: BR é 6º em horas de estudo, 60º em retenção. Por quê?"

**bts** (behind the scenes do Lumio):
Decisões de produto, aprendizados, jornada. Honestidade > marketing.
- "Por que pt-BR foi prioridade #1 sobre features"
- "100 alunos testaram. Aqui está o que NÃO funcionou"

==============================================================================

REGRAS UNIVERSAIS:
- Título: máximo 90 chars, hook forte, evita clickbait barato ("vai te chocar")
- "Você sabia?" SÓ aparece em categoria curiosidade
- Pesquisa SÓ cita paper se 95% certo da existência. Se duvidar, NÃO menciona — usa categoria curiosidade.
- Nunca: dados inventados, % sem fonte, milagre, "ciência garante", garantia de aprovação
- Hashtags / emojis ficam pra geração de texto, não pro título

OUTPUT: JSON estrito.

{
  "ideas": [
    {
      "title": "max 90 chars",
      "summary": "2-3 frases: ângulo, dado/evidência usado, gancho com leitor",
      "category": "curiosidade" | "pesquisa" | "educacional" | "opiniao" | "dados" | "bts"
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
  const requestedCategory = [
    "educacional",
    "curiosidade",
    "pesquisa",
    "opiniao",
    "dados",
    "bts",
  ].includes(body?.category)
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

  const recentTitles = ((recent ?? []) as { idea_title: string | null }[])
    .map((r) => r.idea_title)
    .filter((t): t is string => Boolean(t))
    .map((t) => `- ${t}`)
    .join("\n");

  const categoryHint = requestedCategory
    ? `Categoria FOCO desta rodada: ${requestedCategory}. Gere TODAS as ${count} ideias nessa categoria. Respeite estilo dela.`
    : `Mix de categorias: ~40% curiosidade, ~25% pesquisa, ~20% educacional, ~10% opinião, ~5% dados/bts.`;

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
