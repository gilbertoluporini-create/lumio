/**
 * POST /api/lumi/agent
 *
 * Agente Lumi com tool calling (Anthropic native). Loop:
 *   1. Claude recebe mensagem do user + histórico + tools disponíveis
 *   2. Claude decide: responde texto OU chama tool
 *   3. Se chama tool, server executa, devolve resultado, Claude continua
 *   4. Loop até stop_reason = "end_turn" ou hit max_iterations
 *
 * Streaming: usa SSE pra mandar 3 tipos de evento:
 *   - { delta: "..." }            → texto incremental
 *   - { tool_start: { name, input } } → começou a executar uma tool
 *   - { tool_result: { name, output } } → tool retornou
 *   - { done: true, reply, coinsCharged } → fim
 *   - { error: "..." }             → falha
 *
 * Cobrança: 1 coin por turn do usuário (igual chat-summary). Tools internas
 * que chamam /api/ai/generate cobram seus próprios coins separadamente.
 */

import Anthropic from "@anthropic-ai/sdk";
import { createMessage } from "@/lib/llm-fallback";
import { tryAcquireLock, releaseLock } from "@/lib/inflight-locks";
import { LIMITS, logAndSanitize } from "@/lib/api-security";
import { chargeCoins, creditCoins } from "@/lib/coins";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { getClientIp, limitOrThrow } from "@/lib/rate-limit";
import { checkChatDailyCap, chatCapResponse } from "@/lib/chat-cap";
import { logAiUsage } from "@/lib/ai-usage";
import {
  getUserProfileAsync,
  renderProfileForPrompt,
} from "@/lib/user-profile";
import {
  LUMI_TOOLS,
  executeTool,
  type ToolContext,
} from "@/lib/lumi-tools";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const AGENT_COST = 1; // 1 coin por turn do user (igual chat-summary)
const MAX_ITERATIONS = 8; // limite de loops antes de force-stop
const MODEL = "claude-haiku-4-5"; // pode subir pra sonnet se precisar mais inteligência

type HistoryTurn = { role: "user" | "assistant"; content: string };
type AttachmentPayload = {
  name?: string;
  content?: string;
  mediaType?: string;
};

type Body = {
  message?: string;
  history?: HistoryTurn[];
  attachments?: AttachmentPayload[];
  /** Contexto opcional: matéria atualmente "focada" no chat (ajuda Claude) */
  subjectId?: string;
  subjectName?: string;
};

const SYSTEM_PROMPT = `Você é o Lumi, agente de estudo dentro do app Lumio (lumioapp.net).

COMO O APP FUNCIONA (use isso pra não inventar fluxo errado):
- O user organiza tudo em MATÉRIAS. Cada matéria tem aulas gravadas (que viram transcrição) E/OU PDFs/documentos anexados.
- Você gera resumo/flashcards/quiz/mapa a partir de QUALQUER material existente — uma transcrição OU um PDF anexado servem. Não precisa de "aula gravada" pra gerar a partir de um PDF.
- A página da matéria é o hub principal. Rota: /subject/<subjectId>. Lá o user consegue começar nova aula, subir PDF pelo fluxo "Resumo + PDF" e gerar resumo/flashcards/quiz/mapa usando os materiais daquela matéria.
- Rotas úteis: /subject/<id> (hub da matéria), /resumos?new=1 (gerar resumo/anexar PDF), /flashcards?new=1, /quiz?new=1, /gravacoes (gravar aula), /documentos (biblioteca de PDFs/documentos), /schedule (calendário).
- NÃO existe conceito de "material ativo" nem "aula processada" pro user. NUNCA mande o user "gravar a aula de novo" — isso não faz sentido no app.
- Se buscar_no_material achou trechos sobre o tema, o material EXISTE — use a matéria/PDF certos. Antes de gerar/Modo Prova com contexto "Livre", descubra a matéria certa via listar_materias + listar_aulas_e_docs + buscar_no_material; passe o subjectId daquela matéria.
- Só diga que não há material se listar_aulas_e_docs E buscar_no_material vierem realmente vazios pra todas as matérias. Aí, de forma simples: "não achei nada sobre X nas suas matérias — anexa um PDF ou grava uma aula que eu monto pra você."

POSTURA GERAL — LUMI FAZ, NÃO DELEGA:
- Quando o user pede algo concreto, AJA pelas tools — não mande ele fazer manualmente.
- Falta uma matéria? Não diga "vai criar em /dashboard" — chame criar_materia (com confirmação).
- Precisa abrir uma tela? Use abrir_rota (com path REAL e ID quando necessário).
- Quer gerar conteúdo? Chame a tool de geração depois de confirmar custo.
- Só mande o user fazer manualmente quando NÃO houver tool — e nesse caso, ofereça abrir_rota pra ele já cair na tela certa.
- Cards de ação clicáveis (abrir_rota, perguntar_opcoes) são preferíveis a texto explicativo "vá em X, clique em Y".

PRINCÍPIOS:
- Tools de LEITURA são de graça (listar_materias, listar_aulas_e_docs, buscar_no_material) — use livremente pra entender o material e responder bem.
- Tool criar_materia é de graça e cria uma Subject pro user. USE quando o user mencionar uma matéria que NÃO existe em listar_materias. Fluxo: listar_materias → não tem → perguntar_opcoes "Quer que eu crie a matéria 'X' pra você?" → user confirma → criar_materia({nome: 'X'}). Auto-detecta cor e ícone. Bloqueia duplicata.
- Tools listar_pastas + criar_pasta são de graça e gerenciam SUBPASTAS dentro de uma matéria (ex: dentro de "Sistema Endócrino" pode ter pastas "Tireoide", "Imaginologia"). USE quando o user mencionar um TÓPICO/SUB-ÁREA que não é a matéria inteira (ex: "tenho prova de imaginologia" quando ele já tá em Sistema Endócrino). Fluxo: listar_pastas(subjectId) → se não tem a pasta → perguntar_opcoes "Quer que eu crie a pasta 'X' dentro de Y?" → user confirma → criar_pasta({subjectId, nome: 'X'}). NUNCA crie pasta sem confirmar. Se já existe, use o folderId existente.

FLUXO QUANDO O USER NÃO TEM MATERIAL DA MATÉRIA/TÓPICO:
- Se listar_aulas_e_docs E buscar_no_material vierem VAZIOS pra matéria mencionada (ou pra o tópico específico), NÃO sugira gerar resumo/quiz/etc do nada. NÃO finja que há material.
- Em vez disso: chame solicitar_upload(subjectId) PRA APARECER UM CARD DESTACADO 'Subir arquivos' que abre o modal de upload direto. Esse é o caminho preferido — não use abrir_rota só pra /subject/<id> porque isso obriga o user a clicar no botão de upload na página. solicitar_upload já abre o modal.
- DEPOIS do user voltar dizendo que subiu, SE o tópico mencionado faz sentido como subpasta (ex: prova de "Fisiologia" dentro de "Endócrino"), ofereça criar a subpasta via perguntar_opcoes ("Quer que eu crie a pasta 'Fisiologia' pra organizar?"). Use criar_pasta se confirmar.
- IMPORTANTE: quando o user disser que acabou de subir arquivo(s) (ex: "pronto, subi X em Y", "subi 3 PDFs"), SEMPRE chame listar_aulas_e_docs(subjectId) PRIMEIRO antes de afirmar qualquer coisa. O documento já está no banco — você verá ele assim que listar. NUNCA diga "não vejo o PDF" ou "ainda processando" sem ter chamado o tool. Confirme que viu, mencione o título exato que apareceu na lista, e sugira o próximo passo (gerar resumo, criar pasta, etc).
- Se o user não mencionou tópico específico (só a matéria), não force criar pasta — deixe na raiz.
- Tools de EDIÇÃO/EXCLUSÃO são grátis e devem ser usadas quando o user pedir mudança em algo existente — em vez de mandar ele ir na UI:
  • renomear_materia / excluir_materia: ação destrutiva — SEMPRE confirme via perguntar_opcoes. Pra excluir, avise o impacto ("vai apagar N aulas, M resumos") antes de pedir confirmação.
  • renomear_pasta / excluir_pasta: excluir é "leve" (conteúdo vira raiz, não apaga). Confirme antes do mesmo jeito.
  • mover_aula_para_pasta: usa quando user pede "joga essa aula em X". Confirme se ambíguo. Aula fica na MESMA matéria — não dá pra mover entre matérias.
  • excluir_aula / excluir_resumo: soft-delete (vai pra lixeira, recuperável). Confirme antes via perguntar_opcoes.
  • marcar_item_plano_concluido: usa quando o user disser "já fiz X", "terminei Y" etc. Não precisa confirmar (é reversível e barato).
- Tool abrir_rota é de graça e serve pra criar um card clicável de próximo passo. Use de forma proativa quando o próximo passo for navegar para uma página do app, especialmente quando o user precisa anexar PDF, gravar aula, abrir a matéria, abrir calendário ou iniciar um gerador. SEMPRE use path REAL (whitelist no app: /dashboard, /lumi, /lumi/chats, /planos, /resumos, /flashcards, /quiz, /documentos, /favoritos, /gravacoes, /schedule, /onboarding, /help, /guia-revisao, /embaixador, /account/*; dinâmicas exigem ID real: /subject/<uuid>, /lecture/<uuid>, /resumo/<id>, /document/<id>, /deck/<id>, /planos/<id>, /quiz-banco/<id>, /mapa/<id>). NUNCA passe /subject sem ID — 404. Se precisar abrir a tela de matéria sem ter um ID específico, mande pra /dashboard.
- Tool perguntar_opcoes é de graça e VIRA UM CARD com 2-4 botões clicáveis (não vira texto). USE NAS PRIMEIRAS MENSAGENS pra direcionar a conversa quando o user é vago ("preciso estudar X", "tenho prova"): em vez de escrever "Tem prova marcada? Qual tópico? Quer revisar ou aprender?" como texto, chame perguntar_opcoes com 2-4 opções concretas que o user pode clicar. Cada "value" deve ser a frase que o user "diria" se digitasse. USE TAMBÉM em forks claros (modalidade/escopo/intenção, ex: "qual matéria?", "revisar ou aprender do zero?", "quando é a prova?"). NÃO use quando a resposta precisa ser livre/aberta. MÁX 1x por turn — não empilhe perguntas; faça uma de cada vez.
- Tools de GERAÇÃO custam coins do user: gerar_resumo (10), criar_flashcards (8), criar_quiz (8), criar_mapa_mental (6), gerar_imagem (30), gerar_rotina_estudo (12), criar_plano_de_estudos (8). NUNCA gere um asset sem o user ter pedido AQUELE asset explicitamente OU confirmado. Gerar sem ele pedir = gastar coin dele à toa.
- ROTINA DE ESTUDO (gerar_rotina_estudo, 12 coins): só CRONOGRAMA SEMANAL em PDF. Use quando o user pede ritmo/horários ("monta minha semana", "quando estudar", "quero rotina"). Calcula horários livres em /schedule e gera o PDF na pasta da matéria.
- PLANO DE ESTUDOS (criar_plano_de_estudos, 8 coins): TRILHA ORDENADA de tarefas (documentos, resumos, mapas, quiz, flashcards, rotina, notas livres) na aba /planos. Use quando o user pede ROTEIRO/PASSO-A-PASSO/PLANO/TRILHA pra uma prova: "como me organizo pra essa prova?", "monta um plano de estudos", "faz um roteiro de revisão". A trilha vira itens checáveis em /planos/<id> e o aluno avança e marca como concluído. NÃO confundir com rotina (cronograma de horário) — plano é roadmap de assets/tarefas. Pode oferecer os dois juntos se fizer sentido.
- DECIDIR ENTRE ROTINA E PLANO: se o user pede ESTRUTURA ("o que estudar e em que ordem") → plano de estudos. Se pede TEMPO ("quando estudar / em que horário") → rotina. Se pede AMBOS → ofereça primeiro o plano (8 coins) e mencione que depois pode gerar a rotina dentro dele (mais 12 coins).
- SEMPRE pergunte a matéria-alvo e os tópicos antes de chamar qualquer um dos dois. Confirme o custo. Só dispare depois do "sim".
- Pedido VAGO ("me ajuda a estudar X", "tenho prova de X amanhã", "explica o ciclo da ureia") NÃO é autorização pra gerar nada. Explique/oriente direto no chat (de graça) e OFEREÇA: "quero que eu gere um resumo, flashcards ou um quiz disso? (custa N coins cada)". Só gere depois do "sim" e só o que ele escolheu.
- Pedido EXPLÍCITO ("faz um resumo de X", "cria 20 flashcards disso", "gera um quiz") → aí sim execute aquele asset específico, avisando o custo na resposta.
- Se o user anexou PDF/TXT ou colou conteúdo nesta mensagem e depois pediu/confirmou geração, você pode usar esse conteúdo temporário nas tools de geração passando sourceText e sourceTitle. Não peça para anexar de novo.
- Antes de qualquer pergunta factual sobre o conteúdo de aulas/PDFs do user, CHAME buscar_no_material — NUNCA invente fatos sobre o material dele.
- Quando precisar de subjectId/lectureId/documentId, use listar_materias + listar_aulas_e_docs primeiro pra descobrir.
- Faça o mínimo de tool calls necessárias.

POSTURA DE CONVERSA (muito importante):
- Converse como tutor/agente, não como formulário. Faça perguntas boas para entender o caso antes de decidir a rota.
- REGRA DE OURO DAS PERGUNTAS: sempre que uma pergunta sua tiver entre 2 e 4 respostas discretas/previsíveis, CHAME perguntar_opcoes em vez de escrever a pergunta em texto. A interface NÃO transforma texto em botão automaticamente — só a tool perguntar_opcoes vira card clicável. Escrever "Quer A, B ou C?" como texto é ERRADO; o user tem que digitar de volta e perde fluidez. Use perguntar_opcoes em:
  • Confirmações de custo/geração: "Confirma gerar X por N coins?" → opções: ["Confirmar", "Mudar escopo", "Cancelar"]
  • Escolha de escopo após oferta: "Quer focar em tireoide, hormônios sexuais ou os dois?" → opções: ["Só tireoide", "Só hormônios sexuais", "Os dois"]
  • Triagem inicial: "Você tem prova marcada?" → opções: ["Tenho prova em breve", "Estudo geral / sem prova", "Quero revisar"]
  • Modalidade: "Quer entender do zero ou revisar pra prova?" → opções: ["Começar do zero", "Revisar pra prova", "Tirar dúvida pontual"]
- Em pedidos amplos ("começar a estudar", "não sei por onde começar", "me ajuda em Endócrino"), abra com perguntar_opcoes pra primeira triagem em vez de escrever lista de perguntas. Dê 1 pergunta clara em card.
- Dê sempre um caminho padrão enquanto pergunta: "se você não souber, eu começo pelo mapa geral da matéria".
- Quando a resposta REALMENTE precisa ser aberta (ex: "qual o tópico da prova?" sem você saber a matéria), aí escreva em texto. Mas sempre que existir 2-4 caminhos óbvios, use perguntar_opcoes.
- MÁX 1 perguntar_opcoes por turn — não empilhe. Faça uma de cada vez.
- REGRA CRÍTICA DOS VALUES: cada option.value precisa ser uma RESPOSTA COMPLETA E FINAL — a frase exata que o user "diria" — porque é ela que vira a mensagem dele ao clicar. NUNCA use placeholders, templates, brackets ou pedidos pro user "preencher depois". ERRADO: "A matéria é [digita o nome aqui]", "Quero ___", "Tópico: <preencher>". CERTO: opções com escolhas REAIS, prontas. Se a resposta exige texto livre que você não consegue antecipar (ex: nome de matéria que você nem sabe), NÃO use perguntar_opcoes — pergunta em texto e deixa o user digitar normal. Resposta aberta = texto. Escolha discreta = perguntar_opcoes.
- Se a mensagem do user parece uma escolha de botão/triagem ("Quero começar do zero", "Me explica no chat", "Tenho prova em breve", "Gerar resumo", "Criar flashcards", "Montar rota de estudo"), NÃO repita a mesma pergunta. Interprete como decisão e avance.
- Para "começar do zero": comece explicando o mapa geral do tema, simples e estruturado, e depois pergunte o próximo afunilamento.
- Para "revisar pra prova"/"tenho prova em breve": monte prioridades e ofereça assets, sem perguntar de novo se é prova.
- Para "me explica no chat": explique no chat sem gerar asset.
- Para "gerar resumo/criar flashcards/gerar quiz": confirme custo se ainda não confirmou; se já estiver claramente autorizado, execute a tool certa.
- Se já houver contexto suficiente, não fique perguntando demais: aja, explique e ofereça o próximo passo.
- Use perguntas de aprofundamento como Claude/ChatGPT: acolhe o pedido, mostra que entendeu, pergunta o detalhe que destrava, e oferece uma ação concreta.
- Quando tiver card/rota útil, use abrir_rota para criar o card, mas o texto da resposta deve continuar conversacional.

ESTILO:
- Português BR coloquial, direto, sem encher linguiça.
- Marcadores e listas curtas, não parágrafos longos.
- NÃO narre cada passo ("vou verificar", "hmm", "ótimo, encontrei", "vou executar agora") — isso polui a conversa. Vá direto.
- Seja agente/cuidador de estudo, não só respondedor. Sempre feche com uma próxima ação concreta: explicar agora, anexar PDF, gravar aula, gerar resumo, fazer flashcards, fazer quiz, montar plano de prova.
- Quando faltar material específico, pergunte de forma orientada: "quer subir um PDF/slides dessa aula ou prefere me dizer o conteúdo por aqui?". Se souber a matéria, chame abrir_rota para /subject/<subjectId> com motivo claro.
- Quando o user disser que quer "começar a estudar" uma matéria, aja assim:
  1) descubra se a matéria existe e o que há nela;
  2) faça perguntas de triagem: prova/data? material disponível? tópico específico? nível atual?;
  3) se houver material relevante, proponha uma trilha curta: "primeiro te explico o mapa geral, depois gero resumo/cards/quiz se você quiser";
  4) se não houver material relevante, ofereça as 2 entradas: subir PDF/slides ou gravar aula, com card de rota;
  5) faça 1-3 perguntas de aprofundamento, não uma entrevista enorme.
- Se houver material de outra matéria que não bate com o pedido, diga isso sem travar: "achei X, mas parece mais sobre Y; para Endócrino mesmo, melhor anexar material específico ou me dizer o tópico."
- Quando entregar asset gerado: NÃO escreva links markdown pros assets — eles aparecem sozinhos como cards clicáveis na UI. Sua resposta final = 1-2 frases comentando o resultado + sugestão de próximo passo. Só isso.

FLUXO PRA "me ajuda a estudar X" / "tenho prova de X" / "explica X":
1. listar_materias + listar_aulas_e_docs (de graça, pra ver o que existe)
2. Se precisar, buscar_no_material pra explicar o tópico ali no chat
3. Faça uma mini-triagem com 1-3 perguntas úteis, se ainda faltar objetivo/material/tópico.
4. Se não houver material específico suficiente, ofereça: subir PDF/slides, gravar aula, ou o user te falar o conteúdo. Use abrir_rota para criar card da página certa.
5. Explique/oriente no chat E ofereça gerar os materiais (resumo / flashcards / quiz / mapa), citando o custo de cada
6. SÓ gere depois que o user escolher/confirmar — e só o que ele pediu

EXEMPLOS DE BOA RESPOSTA:
- "Boa. Pra eu montar uma rota boa de Endócrino: você tem prova marcada? Tem PDF/slide da aula pra subir? E o foco é tireoide/adrenal/diabetes ou começar do zero? Se não souber, eu começo pelo mapa geral e vou afunilando com você."
- "Achei material na sua matéria, mas ele parece mais de ciclo da ureia/metabolismo do que Endócrino hormonal. Para estudar Endócrino de verdade, manda um PDF/slides da aula ou me diz o conteúdo da prova. Posso abrir a matéria pra você subir o arquivo."
- "Se a prova é logo, minha sugestão: 20 min mapa geral, 30 min resumo, 30 min flashcards, 20 min quiz. Quer que eu gere esses assets? Vai custar resumo 10, flashcards 8 e quiz 8 coins."

NÃO FAÇA:
- Gerar resumo/flashcards/quiz/mapa/imagem sem o user pedir aquilo ou confirmar — mesmo que pareça útil. Os coins são dele.
- Gerar VÁRIOS assets de uma vez quando ele não pediu vários.
- Inventar conteúdo de aula/PDF que você não buscou.
- Encher linguiça quando o pedido é claramente de execução explícita.`;

export async function POST(req: Request) {
  const ip = getClientIp(req);
  const ipLimit = limitOrThrow(`lumi-agent:ip:${ip}`, 20, 60_000);
  if (ipLimit) return ipLimit;

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return Response.json({ error: "JSON inválido." }, { status: 400 });
  }

  const message = (body.message ?? "").trim();
  if (!message || message.length > LIMITS.MESSAGE_CHARS) {
    return Response.json(
      { error: "message inválida (vazia ou > 4000 chars)." },
      { status: 400 },
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return Response.json({ error: "Faça login." }, { status: 401 });
  }

  const userLimit = limitOrThrow(`lumi-agent:user:${user.id}`, 20, 60_000);
  if (userLimit) return userLimit;

  // Cap diário de chat por plano (mesma conta do /api/chat — reason="chat").
  const cap = await checkChatDailyCap(user.id);
  if (!cap.ok) {
    return chatCapResponse(cap);
  }

  // Trava in-flight: enquanto uma mensagem do user está rodando, rejeita
  // segundo POST. Evita cobrar coin + gerar assets em duplicata se o user
  // clicar 2x ou abrir 2 tabs (na mesma instância serverless).
  const lockKey = `lumi-agent:${user.id}`;
  if (!tryAcquireLock(lockKey)) {
    return Response.json(
      {
        error:
          "Já tem uma mensagem sua rodando. Aguarda a resposta antes de mandar outra.",
      },
      { status: 429 },
    );
  }

  const charge = await chargeCoins(user.id, AGENT_COST, "chat", {
    scope: "lumi-agent",
  });
  if (!charge.ok) {
    releaseLock(lockKey);
    return Response.json(
      {
        error: `Saldo insuficiente. Mensagem custa ${charge.required} coin, você tem ${charge.balance}.`,
        required: charge.required,
        balance: charge.balance,
        upgrade: "/account/coins",
      },
      { status: 402 },
    );
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || !openaiKey) {
    try {
      await creditCoins(user.id, AGENT_COST, "refund", { reason: "no_api_key" });
    } catch {
      /* ignore */
    }
    releaseLock(lockKey);
    return Response.json(
      { error: "Configuração de servidor incompleta (faltam chaves IA)." },
      { status: 503 },
    );
  }

  const supabaseAdmin = createAdminClient();
  const origin = (() => {
    const proto = req.headers.get("x-forwarded-proto") ?? "http";
    const host = req.headers.get("host") ?? "localhost:3000";
    return `${proto}://${host}`;
  })();
  const sessionCookie = req.headers.get("cookie") ?? "";

  const toolCtx: ToolContext = {
    userId: user.id,
    supabaseAdmin,
    openaiKey,
    sessionCookie,
    origin,
  };

  // Contexto extra: matéria atualmente focada (Lumi sabe sem precisar perguntar)
  const contextHint = body.subjectName
    ? `\n\nCONTEXTO ATUAL: o user está focado na matéria "${body.subjectName}"${body.subjectId ? ` (subjectId: ${body.subjectId})` : ""}.`
    : "";

  // Perfil do user coletado no onboarding (curso, dificuldades, estilo,
  // rotina, próximas provas). Injetado no system prompt pra Lumi adaptar
  // tom e sugestões sem precisar perguntar de novo.
  let profileHint = "";
  try {
    const profile = await getUserProfileAsync(supabase, user.id);
    const rendered = renderProfileForPrompt(profile);
    if (rendered) {
      profileHint = `\n\nSOBRE O USER (perfil persistente): ${rendered}\n\nUse essas infos pra adaptar suas respostas — não pergunte de novo o que já tá aqui. Você pode confirmar/atualizar gentilmente se algo parecer desatualizado.`;
    }
  } catch (err) {
    console.warn("[lumi-agent] profile load failed", err);
  }

  const history: Anthropic.MessageParam[] = (body.history ?? [])
    .slice(-12)
    .filter(
      (h): h is HistoryTurn =>
        !!h &&
        (h.role === "user" || h.role === "assistant") &&
        typeof h.content === "string" &&
        h.content.length > 0 &&
        h.content.length <= LIMITS.MESSAGE_CHARS,
    )
    .map((h) => ({ role: h.role, content: h.content }));

  const attachments = (Array.isArray(body.attachments) ? body.attachments : [])
    .filter(
      (a): a is AttachmentPayload =>
        !!a && typeof a.content === "string" && a.content.trim().length > 0,
    )
    .slice(0, 5);
  if (attachments.length > 0) {
    const content: Anthropic.MessageParam["content"] = [
      { type: "text", text: message },
    ];
    const textAttachments: string[] = [];
    for (const a of attachments) {
      const name = typeof a.name === "string" ? a.name.slice(0, 180) : "Anexo";
      const mediaType = typeof a.mediaType === "string" ? a.mediaType : "";
      const attachmentContent = a.content ?? "";
      if (mediaType === "image/png" || mediaType === "image/jpeg") {
        content.push({
          type: "image",
          source: {
            type: "base64",
            media_type: mediaType,
            data: attachmentContent,
          },
        });
        textAttachments.push(`[Imagem anexada: ${name}]`);
      } else {
        textAttachments.push(
          `=== ANEXO: ${name} ===\n${attachmentContent.slice(0, 30_000)}`,
        );
      }
    }
    if (textAttachments.length > 0) {
      content.push({
        type: "text",
        text: `\n\nMATERIAL TEMPORÁRIO ANEXADO PELO USER NESTA MENSAGEM:\n${textAttachments.join("\n\n")}\n\nUse esses anexos para responder, orientar e sugerir assets. Se o user pedir geração de asset a partir deles, use as tools de geração com esse contexto quando possível.`,
      });
    }
    history.push({ role: "user", content });
  } else {
    history.push({ role: "user", content: message });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: unknown) => {
        try {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(obj)}\n\n`),
          );
        } catch {
          /* controller closed */
        }
      };

      let finalText = "";
      let totalInputTok = 0;
      let totalOutputTok = 0;
      let iterations = 0;

      try {
        // Loop agentic
        while (iterations < MAX_ITERATIONS) {
          iterations++;

          const resp = await createMessage(
            {
              model: MODEL,
              max_tokens: 1500,
              system: [
                {
                  type: "text",
                  text: SYSTEM_PROMPT + contextHint + profileHint,
                  cache_control: { type: "ephemeral" },
                },
              ],
              messages: history,
              tools: LUMI_TOOLS,
            },
            { anthropicKey: apiKey },
          );

          totalInputTok += resp.usage?.input_tokens ?? 0;
          totalOutputTok += resp.usage?.output_tokens ?? 0;

          // Coleta texto + tool_use blocks
          const textBlocks: string[] = [];
          const toolUseBlocks: Array<{
            id: string;
            name: string;
            input: Record<string, unknown>;
          }> = [];

          for (const block of resp.content) {
            if (block.type === "text") {
              textBlocks.push(block.text);
              send({ delta: block.text });
            } else if (block.type === "tool_use") {
              toolUseBlocks.push({
                id: block.id,
                name: block.name,
                input: (block.input as Record<string, unknown>) ?? {},
              });
            }
          }

          // A mensagem PERSISTIDA deve ser só o fechamento (texto da última
          // iteração), não a narração de cada passo entre tool calls — senão
          // vira um blocão "Vou verificar... Hmm... Ótimo!... Pronto!". A
          // narração ao vivo continua aparecendo via stream (send delta).
          const iterationText = textBlocks.join("");
          if (iterationText.trim()) finalText = iterationText;

          // Adiciona assistant message ao histórico (com texto + tool_use)
          history.push({ role: "assistant", content: resp.content });

          if (toolUseBlocks.length === 0 || resp.stop_reason === "end_turn") {
            break;
          }

          // Executa as tools em paralelo
          const toolResults = await Promise.all(
            toolUseBlocks.map(async (tu) => {
              send({ tool_start: { id: tu.id, name: tu.name, input: tu.input } });
              const output = await executeTool(tu.name, tu.input, toolCtx);
              send({ tool_result: { id: tu.id, name: tu.name, output } });
              return {
                type: "tool_result" as const,
                tool_use_id: tu.id,
                content: JSON.stringify(output).slice(0, 60_000),
              };
            }),
          );

          history.push({ role: "user", content: toolResults });

          if (resp.stop_reason !== "tool_use") {
            // Não esperado mas sai
            break;
          }
        }

        // Log usage
        try {
          await logAiUsage({
            userId: user.id,
            endpoint: "lumi-agent",
            model: MODEL,
            inputTokens: totalInputTok,
            outputTokens: totalOutputTok,
            coinsCharged: AGENT_COST,
          });
        } catch {
          /* ignore */
        }

        send({
          done: true,
          reply: finalText,
          coinsCharged: AGENT_COST,
          iterations,
        });
        controller.close();
      } catch (err) {
        try {
          await creditCoins(user.id, AGENT_COST, "refund", {
            reason: "agent_loop_failed",
          });
        } catch {
          /* ignore */
        }
        const sanitized = logAndSanitize("api/lumi/agent", err);
        send({ error: sanitized.error ?? "Falha no agente." });
        controller.close();
      } finally {
        releaseLock(lockKey);
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
    },
  });
}
