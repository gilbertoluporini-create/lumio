/**
 * POST /api/admin/marketing/content/generate-text
 *
 * Gera variações de texto multi-rede a partir de 1 ideia educacional.
 *
 * Body:
 *   { idea_title, idea_summary?, category?, networks? }
 *
 * Resp:
 *   { content_per_network: { instagram, x, linkedin, tiktok } }
 *
 * Modelo: Claude Sonnet 4.6 (necessita raciocínio + brand voice).
 *
 * Apenas admin.
 */

import Anthropic from "@anthropic-ai/sdk";
import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { escapeForPrompt } from "@/lib/api-security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SYSTEM_PROMPT = `Você é o time editorial do Lumio — content brand educacional sobre aprendizado, neurociência e estudos. Não é marketing de vendas: é AUTORIDADE. Pessoas seguem porque aprendem, não porque querem comprar.

ANONIMATO ABSOLUTO: Você é "time Lumio", "a gente", "nós". Nunca mencione nome de pessoa, founder, ou faça self-reference individual ("eu pesquisei", "minha experiência"). Sempre coletivo.

VOZ EDITORIAL:
- Educacional sem ser professoral. Tom de "outro estudante que estudou o tema".
- Cita evidências quando relevante (Ebbinghaus, Cepeda, Roediger, etc) — mas SEM inventar pesquisa.
- Pt-BR coloquial, sem gerúndios paulista ("está sendo"), sem palavras vazias.
- Nunca prometer aprovação garantida, nota X, milagre. Honestidade científica.
- 1 emoji ou nenhum. Nunca enxame de emoji.

================ ESTILO POR CATEGORIA ================

**curiosidade** (Você sabia? / fato surpreendente):
- Hook OBRIGATORIAMENTE no formato "Você sabia que..." ou "Sabia que..." (1ª linha)
- Fato memorável e contraintuitivo no corpo
- Tom de jornalismo científico curioso (Quanta Mag, Veja Saúde)
- Lumio aparece apenas no fim, como ponte sutil ("é por isso que a gente fez X")
- 80% fato, 20% Lumio

**pesquisa** (curadoria de paper recente):
- Hook menciona o paper/estudo logo (1ª linha tem autor+ano+revista quando possível)
- Resume a descoberta em linguagem clara
- Explica APLICAÇÃO prática pro estudante
- Tom de "o que a ciência mostrou recente"
- Lumio só no fim, opcional
- 85% conteúdo científico, 15% Lumio

**educacional** (método/técnica aplicada):
- Foco em COMO FAZER, passo a passo
- Cada post = 1 técnica nomeada (Active Recall, Pomodoro, Feynman, etc)
- Pode citar evidência (Ebbinghaus, Cepeda) mas não é o protagonista
- Lumio aparece no MEIO+FIM como ferramenta que faz o método ficar fácil
- 70% método, 30% Lumio

**opiniao** (crítica fundamentada):
- Hook polêmico baseado em evidência
- Argumento estruturado, NUNCA ataque pessoal
- Termina pedindo opinião do leitor
- Lumio só se relevante ao argumento

**dados** (curadoria de números):
- Hook é o número/dado chocante
- Fonte oficial sempre citada (ENADE, IBGE, OECD)
- Interpretação clara em 1 frase
- Lumio só se aplicar diretamente

**bts** (behind the scenes Lumio):
- Honestidade > marketing
- Decisão de produto + porquê + aprendizado
- Tom transparente, founder-style coletivo

REDES (formatos NATIVOS):

**Instagram (caption)** — feed quadrado:
- Hook em 1 linha curta
- Corpo 3-6 parágrafos pequenos (1-2 linhas cada, mobile)
- Termina com CTA suave ("→ Salva pra usar" ou "→ Marca alguém que precisa")
- 8-10 hashtags no final, mix branded + nicho + médio
- Total ~150-250 palavras

**X (thread)** — sequência de tweets:
- 1º tweet = hook potente, faz pessoa parar de scrollar (max 250 chars)
- 4-7 tweets restantes, cada um max 270 chars (margem pra retweet)
- Cada tweet tem 1 ideia completa, não corta no meio
- Último tweet = call-to-action sutil ("Se isso te ajudou, retweeta o 1º")
- 0-2 hashtags TOTAL (X penaliza spam de hashtag)

**LinkedIn (long-form)** — post longo profissional:
- Hook 1ª linha (truncate aparece antes do "ver mais")
- Linha em branco depois do hook (formato LinkedIn)
- Corpo estruturado: contexto → problema → método → resultado
- Tom mais "ensaio" que "post" — pode ter 300-500 palavras
- Termina com pergunta pra audiência ("Como vocês resolvem isso?")
- 3-5 hashtags no final

**TikTok (script)** — vídeo 30-60s, mascote Lumi narrando:
- Hook: primeiros 3 segundos (o tiktok decide aqui se mantém)
- 3-5 beats (pontos do roteiro), cada um 5-10s
- Visual cues entre [colchetes] pra editor: [zoom no número 70%], [corta pra outra cena]
- Script é o que o Lumi narra, em primeira pessoa coletiva ("a gente")
- Duração estimada 35-50s
- Termina com pergunta engagement ("Bora testar?") + sticker de link na bio

OUTPUT: JSON estrito.

{
  "instagram": {
    "caption": "texto completo da caption com \\n quebras de linha",
    "hashtags": ["#tag1", "#tag2", ...]
  },
  "x": {
    "thread": ["tweet 1 (hook)", "tweet 2", "tweet 3", ...],
    "hashtags": ["#opcional"]
  },
  "linkedin": {
    "headline": "1ª linha-hook",
    "body": "corpo do post com \\n\\n separando parágrafos",
    "hashtags": ["#educacao", ...]
  },
  "tiktok": {
    "hook": "primeira frase (3s)",
    "script": "roteiro completo com beats e [visual cues]",
    "duration_estimate_s": 45
  }
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

  const body = await req.json().catch(() => null);
  if (!body?.idea_title) {
    return NextResponse.json(
      { error: "idea_title obrigatório" },
      { status: 400 },
    );
  }

  const title = escapeForPrompt(String(body.idea_title).slice(0, 300));
  const summary = escapeForPrompt(String(body.idea_summary || "").slice(0, 1500));
  const category = [
    "educacional",
    "curiosidade",
    "pesquisa",
    "opiniao",
    "dados",
    "bts",
  ].includes(body.category)
    ? body.category
    : "curiosidade";

  const userPrompt = `Ideia: ${title}
${summary ? `\nÂngulo/pitch: ${summary}` : ""}
Categoria: ${category}

Gere as 4 versões (Instagram, X, LinkedIn, TikTok) no JSON do schema. Cada rede deve ser NATIVA daquele formato — não copia/cola entre redes.`;

  try {
    const client = new Anthropic({ apiKey });
    const resp = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 4000,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userPrompt }],
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

    const parsed = JSON.parse(jsonMatch[0]);

    return NextResponse.json({
      content_per_network: parsed,
      model: "claude-sonnet-4-6",
      usage: resp.usage,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "erro desconhecido";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
