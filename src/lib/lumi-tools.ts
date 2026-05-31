/**
 * Lumi Agent — definições das tools (Anthropic format) + handlers server-side.
 *
 * As tools transformam Lumi de "responde texto" em "executa ações":
 *  - listar_materias        → Lumi descobre as matérias do user
 *  - listar_aulas_e_docs    → Lumi descobre que material existe (por matéria)
 *  - buscar_no_material     → RAG: trechos relevantes pra uma pergunta
 *  - gerar_resumo           → Cria um Summary linkado a uma lecture/doc
 *  - criar_flashcards       → Cria deck de flashcards
 *  - criar_quiz             → Cria quiz
 *  - criar_mapa_mental      → Cria mapa mental
 *  - abrir_rota             → Devolve instrução de navegação pro client
 *
 * Cada handler recebe `ToolContext` com clients + user info.
 * Retorna objeto que vai como tool_result no protocolo Anthropic.
 */

import type Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { searchRelevantChunks } from "./embeddings";

export type LumiToolName =
  | "listar_materias"
  | "listar_aulas_e_docs"
  | "buscar_no_material"
  | "gerar_resumo"
  | "criar_flashcards"
  | "criar_quiz"
  | "criar_mapa_mental"
  | "gerar_imagem"
  | "iniciar_modo_prova"
  | "gerar_rotina_estudo"
  | "criar_plano_de_estudos"
  | "abrir_rota"
  | "marcar_item_plano"
  | "meu_progresso"
  | "agendar_no_calendario";

export type ToolContext = {
  userId: string;
  supabaseAdmin: SupabaseClient;
  /** OpenAI API key — usada pelo buscar_no_material (embedding da query) */
  openaiKey: string;
  /** Cookie da sessão pra encaminhar pra endpoints internos (que cobram coins via user logado) */
  sessionCookie: string;
  /** Origin pra fazer fetch interno */
  origin: string;
};

/**
 * Schema das tools no formato esperado pela Anthropic.
 * Documentação em PT-BR pra Claude conseguir decidir quando chamar cada uma.
 */
export const LUMI_TOOLS: Anthropic.Tool[] = [
  {
    name: "listar_materias",
    description:
      "Lista todas as matérias (subjects) do usuário. Use isso PRIMEIRO quando o user mencionar uma matéria sem deixar claro qual é, ou quando precisar saber o que ele estuda.",
    input_schema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "listar_aulas_e_docs",
    description:
      "Lista aulas gravadas (com transcrição) e documentos (PDFs) de uma matéria específica. Use pra descobrir que material existe antes de gerar resumo/cards/quiz.",
    input_schema: {
      type: "object",
      properties: {
        subjectId: {
          type: "string",
          description: "UUID da matéria. Obrigatório.",
        },
      },
      required: ["subjectId"],
    },
  },
  {
    name: "buscar_no_material",
    description:
      "Busca semântica (RAG) nos materiais do user (aulas gravadas + PDFs). Retorna os 5 trechos mais relevantes pra pergunta. USE SEMPRE antes de responder qualquer pergunta factual sobre o conteúdo de aulas/PDFs — evita inventar.",
    input_schema: {
      type: "object",
      properties: {
        pergunta: {
          type: "string",
          description: "A pergunta ou tópico a buscar no material.",
        },
        subjectId: {
          type: "string",
          description: "Opcional: filtrar por matéria específica.",
        },
        limit: {
          type: "number",
          description: "Quantos trechos retornar (default 5, max 10).",
        },
      },
      required: ["pergunta"],
    },
  },
  {
    name: "gerar_resumo",
    description:
      "Gera um resumo em Markdown a partir de aulas/documentos. Cria registro no banco e devolve um link clicável. Custa coins do user (10 sem imagens, 30 com).",
    input_schema: {
      type: "object",
      properties: {
        subjectId: {
          type: "string",
          description: "UUID da matéria (obrigatório).",
        },
        lectureIds: {
          type: "array",
          items: { type: "string" },
          description: "IDs das aulas gravadas pra incluir.",
        },
        documentIds: {
          type: "array",
          items: { type: "string" },
          description: "IDs dos documentos (PDFs) pra incluir.",
        },
        focoCustom: {
          type: "string",
          description:
            "Instrução opcional pra IA — ex: 'foco em tópicos da prova', 'só conceitos chave', 'detalhe mecanismos'.",
        },
        profundidade: {
          type: "string",
          enum: ["concise", "standard", "detailed"],
          description: "Tamanho: concise (1-2pg), standard (2-4pg), detailed (5+pg). Default standard.",
        },
        comImagens: {
          type: "boolean",
          description: "Incluir 3-4 imagens geradas (gpt-image-1). +20 coins. Default false.",
        },
      },
      required: ["subjectId"],
    },
  },
  {
    name: "criar_flashcards",
    description:
      "Cria deck de flashcards a partir de aulas/documentos. 5-30 cards. Custa 8 coins (25 com imagens).",
    input_schema: {
      type: "object",
      properties: {
        subjectId: { type: "string" },
        lectureIds: { type: "array", items: { type: "string" } },
        documentIds: { type: "array", items: { type: "string" } },
        quantidade: {
          type: "number",
          description: "Quantos cards (5-30). Default 15.",
        },
        nivel: {
          type: "string",
          enum: ["beginner", "intermediate", "advanced"],
          description: "Default intermediate.",
        },
        focoCustom: {
          type: "string",
          description: "Instrução opcional pra IA.",
        },
      },
      required: ["subjectId"],
    },
  },
  {
    name: "criar_quiz",
    description:
      "Cria quiz de múltipla escolha. 5-20 questões. Custa 8 coins (25 com imagens).",
    input_schema: {
      type: "object",
      properties: {
        subjectId: { type: "string" },
        lectureIds: { type: "array", items: { type: "string" } },
        documentIds: { type: "array", items: { type: "string" } },
        quantidade: { type: "number", description: "5-20. Default 10." },
        dificuldade: {
          type: "string",
          enum: ["easy", "medium", "hard"],
          description: "Default medium.",
        },
        focoCustom: { type: "string" },
      },
      required: ["subjectId"],
    },
  },
  {
    name: "criar_mapa_mental",
    description: "Cria mapa mental (mindmap). Custa 6 coins.",
    input_schema: {
      type: "object",
      properties: {
        subjectId: { type: "string" },
        lectureIds: { type: "array", items: { type: "string" } },
        documentIds: { type: "array", items: { type: "string" } },
        complexidade: {
          type: "string",
          enum: ["simple", "medium", "deep"],
          description: "Default medium.",
        },
        focoCustom: { type: "string" },
      },
      required: ["subjectId"],
    },
  },
  {
    name: "gerar_imagem",
    description:
      "Gera UMA imagem educacional (diagrama, esquema, ilustração anotada) com labels e título, no estilo de uma figura de livro-texto — como o ChatGPT faz quando alguém pede um diagrama. O formato e o estilo se adaptam ao pedido. Use quando o user pedir 'faça uma imagem sobre esse resumo', 'me mostra em diagrama', 'desenha a via X', 'visualiza isso pra mim'. Custa 30 coins (gpt-image-1 high). Avise o custo ANTES de chamar. A imagem JÁ inclui os labels/texto na própria figura — você não precisa redesenhar em texto, mas pode complementar com uma explicação curta. Pode passar APENAS um contexto (lectureId/summaryId/documentId) — o sistema busca o conteúdo automaticamente e gera. Devolve URL formatada como markdown ![](url).",
    input_schema: {
      type: "object",
      properties: {
        prompt: {
          type: "string",
          description:
            "Descrição em PT-BR do que ilustrar. Pode ser CURTO ('faça uma imagem sobre esse resumo', 'mostra o ciclo da ureia'). Se vier junto com lectureId/summaryId/documentId, o servidor usa o conteúdo do asset como contexto pra enriquecer o prompt antes de gerar. Mín 4 chars, máx 1500.",
        },
        lectureId: {
          type: "string",
          description:
            "Opcional. UUID de uma aula gravada. Se passado, o servidor lê transcript+slides e usa como contexto pro enhancement do prompt.",
        },
        summaryId: {
          type: "string",
          description:
            "Opcional. UUID de um resumo. Se passado, o servidor lê o markdown e usa como contexto.",
        },
        documentId: {
          type: "string",
          description:
            "Opcional. UUID de um document (PDF). Se passado, o servidor lê o sourceText e usa como contexto.",
        },
      },
      required: ["prompt"],
    },
  },
  {
    name: "iniciar_modo_prova",
    description:
      "MODO PROVA — gera EM PARALELO resumo (10) + flashcards (8) + quiz (8) focados na prova + monta cronograma. Custo total ~26 coins. PROTOCOLO OBRIGATÓRIO: (1) PRIMEIRA chamada SEMPRE com `confirmado: false` — o handler vai retornar pedindo pra você confirmar explicitamente com o user no chat antes de executar; (2) só depois do user responder 'sim'/'pode'/'manda'/'bora' você chama de novo com `confirmado: true`. NUNCA chame com confirmado: true sem ter recebido o sim do user na conversa. Se o user pediu só 1 asset (só resumo OU só quiz OU só flashcards), NÃO use esta tool — use a tool individual correspondente. Em 1 chamada com confirmado:true faz: (1) lista material, (2) busca tópicos via RAG, (3) gera os 3 assets, (4) monta cronograma.",
    input_schema: {
      type: "object",
      properties: {
        subjectId: {
          type: "string",
          description: "UUID da matéria da prova (obrigatório).",
        },
        confirmado: {
          type: "boolean",
          description:
            "OBRIGATÓRIO. false na primeira chamada (handler devolve pedido de confirmação). true SOMENTE depois que o user responder 'sim/pode/bora' na conversa pro custo de ~26 coins.",
        },
        horasDisponiveis: {
          type: "number",
          description:
            "Quantas horas o user tem pra estudar antes da prova. Default 3.",
        },
        dataProva: {
          type: "string",
          description:
            "Data da prova (formato livre, ex: 'amanhã', '2026-05-27'). Usado só pro cronograma.",
        },
        topicosFoco: {
          type: "array",
          items: { type: "string" },
          description:
            "Opcional: tópicos específicos que o user disse que vão cair. Se não, Lumi infere dos materiais.",
        },
      },
      required: ["subjectId", "confirmado"],
    },
  },
  {
    name: "gerar_rotina_estudo",
    description:
      "Gera um PDF padrão Lumio com a ROTINA DE ESTUDO SEMANAL pra uma matéria — calcula sozinho os horários livres do user (07:00-23:00 menos as aulas agendadas) e distribui blocos de estudo focados nos tópicos/aulas que ele te passou. O PDF é salvo automaticamente na pasta daquela matéria (vira um Document). Custo: 12 coins. Use quando o user pedir 'monta um plano/rotina/cronograma' OU quando ele mandar foto/texto com tópicos de prova/aulas e você ofereceu rotina e ele confirmou. Antes de chamar: descubra a matéria-alvo (subjectId via listar_materias se preciso). NÃO chame se o user só mandou conteúdo sem confirmar geração — primeiro ofereça 'quer que eu monte uma rotina semanal? São 12 coins'.",
    input_schema: {
      type: "object",
      properties: {
        subjectId: {
          type: "string",
          description: "UUID da matéria-alvo (obrigatório). O PDF vai pra pasta dela.",
        },
        conteudo: {
          type: "string",
          description:
            "Texto com os tópicos da prova / conteúdo a estudar (extraído da imagem que o user mandou, ou que ele digitou).",
        },
        nomesAulas: {
          type: "array",
          items: { type: "string" },
          description:
            "Opcional: lista de nomes das aulas que vão cair na prova (alternativa/complemento ao conteúdo).",
        },
        dataProva: {
          type: "string",
          description:
            "Opcional: data da prova em formato livre ('amanhã', '12/jun', '2026-06-12') — usado só como contexto.",
        },
        horasSemanais: {
          type: "number",
          description:
            "Opcional: quantas horas/semana o user quer dedicar (6-30). Se não passar, Lumi decide entre 6 e 18.",
        },
        titulo: {
          type: "string",
          description: "Opcional: título do PDF. Default: 'Rotina — {matéria}'.",
        },
      },
      required: ["subjectId"],
    },
  },
  {
    name: "criar_plano_de_estudos",
    description:
      "Cria um PLANO DE ESTUDOS completo na aba /planos: uma trilha de 6 a 10 itens ordenados (documentos, resumos, mapas, quiz, flashcards, rotina, notas) que guia o aluno passo a passo até a prova. Você DESENHA a trilha (LLM decide a ordem ideal) e o sistema persiste no banco. O aluno vê o plano em /planos/<id> e marca itens como concluídos. Custo: 8 coins. Use quando o user pedir 'monta um plano de estudos / roteiro / trilha pra essa matéria' OU quando ele estiver com pouco tempo até uma prova e precisar de uma estrutura completa (não só rotina de horários). Diferença pro gerar_rotina_estudo: rotina é PDF de cronograma semanal; plano é trilha de assets/tarefas na aba dedicada. SEMPRE confirme custo (8 coins) e tópicos antes de chamar — esta tool não pergunta nada depois de disparada.",
    input_schema: {
      type: "object",
      properties: {
        subjectId: {
          type: "string",
          description: "UUID da matéria-alvo (obrigatório).",
        },
        conteudo: {
          type: "string",
          description:
            "Texto com os tópicos da prova / conteúdo a estudar — você usa pra desenhar a trilha (obrigatório).",
        },
        dataProva: {
          type: "string",
          description:
            "Opcional: data da prova. Aceita 'YYYY-MM-DD' OU 'DD/MM/YYYY' OU texto livre.",
        },
        horasSemanais: {
          type: "number",
          description:
            "Opcional: horas/semana que o aluno tem disponível. Influencia o ritmo dos itens.",
        },
        titulo: {
          type: "string",
          description:
            "Opcional: título do plano. Default: 'Plano — {matéria}'.",
        },
      },
      required: ["subjectId", "conteudo"],
    },
  },
  {
    name: "marcar_item_plano",
    description:
      "Marca um item de plano de estudos como pending/in_progress/done. Use quando o user disser 'já fiz X', 'comecei o resumo', 'concluí o quiz' E você tiver o itemId daquele item (vem do output de outras tools ou do contexto da página /planos). Grátis (0 coins). NUNCA invente itemIds — só use UUIDs reais que apareceram em outputs anteriores.",
    input_schema: {
      type: "object",
      properties: {
        itemId: {
          type: "string",
          description: "UUID do study_plan_item. Obrigatório.",
        },
        status: {
          type: "string",
          enum: ["pending", "in_progress", "done"],
          description:
            "Novo status. 'in_progress' quando o user começou; 'done' quando concluiu; 'pending' pra desfazer.",
        },
      },
      required: ["itemId", "status"],
    },
  },
  {
    name: "meu_progresso",
    description:
      "Snapshot do estado do user: saldo de coins, gastos últimos 7 dias por categoria, número de aulas/resumos/planos ativos, e próxima ação sugerida. Use quando o user perguntar 'como estou indo?', 'quantos coins tenho?', 'no que eu gastei?', 'o que estudo agora?'. Grátis (0 coins). Se vier subjectId, escopa contagens àquela matéria.",
    input_schema: {
      type: "object",
      properties: {
        subjectId: {
          type: "string",
          description:
            "Opcional: UUID da matéria. Se passado, conta aulas/resumos/planos só dela.",
        },
      },
    },
  },
  {
    name: "agendar_no_calendario",
    description:
      "Cria um evento no calendário do user (aula avulsa, bloco de estudo, prova, trabalho, outro). Calendar é localStorage — esta tool retorna um clientAction que o frontend precisa executar pra de fato persistir. Use quando o user disser 'agenda minha prova de X dia Y', 'bloca 2h amanhã pra estudar Z', 'marca trabalho de X pra sexta'. Grátis (0 coins). SEMPRE confirme título, data/hora e tipo no chat antes de chamar. Datas devem ser ISO 8601 completo (com timezone ou Z).",
    input_schema: {
      type: "object",
      properties: {
        titulo: {
          type: "string",
          description: "Título do evento (ex: 'Prova Endócrino', 'Estudar suprarrenais').",
        },
        tipo: {
          type: "string",
          enum: ["aula", "bloco", "prova", "trabalho", "outro"],
          description:
            "Tipo do evento. bloco = bloco de estudo agendado; outro = genérico.",
        },
        startsAt: {
          type: "string",
          description: "Início em ISO 8601 (ex: '2026-06-12T14:00:00-03:00').",
        },
        endsAt: {
          type: "string",
          description: "Opcional: fim em ISO 8601. Se omitido, evento dura 1h.",
        },
        subjectId: {
          type: "string",
          description: "Opcional: UUID da matéria associada.",
        },
        descricao: {
          type: "string",
          description: "Opcional: notas extras do evento.",
        },
      },
      required: ["titulo", "tipo", "startsAt"],
    },
  },
  {
    name: "abrir_rota",
    description:
      "Devolve uma instrução pro frontend navegar pra uma rota interna. Use quando o user pedir explicitamente 'me leva pra X' ou quando faz sentido abrir um asset gerado. Não executa nada server-side.",
    input_schema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description:
            "Path relativo (ex: '/resumos', '/dashboard', '/resumo/<id>', '/lecture/<id>').",
        },
        motivo: {
          type: "string",
          description: "Por que está abrindo (mostrado ao user no card).",
        },
      },
      required: ["path"],
    },
  },
];

// =================== HANDLERS ===================

type ToolHandler = (
  input: Record<string, unknown>,
  ctx: ToolContext,
) => Promise<unknown>;

/** Sanitiza pra string ou retorna default */
function str(v: unknown, dflt = ""): string {
  return typeof v === "string" ? v : dflt;
}
function num(v: unknown, dflt: number): number {
  return typeof v === "number" && Number.isFinite(v) ? v : dflt;
}
function arr(v: unknown): string[] {
  return Array.isArray(v) ? (v.filter((x) => typeof x === "string") as string[]) : [];
}

const handlers: Record<LumiToolName, ToolHandler> = {
  async listar_materias(_input, ctx) {
    const { data, error } = await ctx.supabaseAdmin
      .from("subjects")
      .select("id, name, color")
      .eq("user_id", ctx.userId)
      .order("created_at", { ascending: true });
    if (error) throw error;
    return {
      materias: (data ?? []).map((s) => ({
        id: s.id,
        nome: s.name,
      })),
    };
  },

  async listar_aulas_e_docs(input, ctx) {
    const subjectId = str(input.subjectId);
    if (!subjectId) return { error: "subjectId obrigatório" };

    const [lec, doc] = await Promise.all([
      ctx.supabaseAdmin
        .from("lectures")
        .select("id, title, transcript, duration_sec, created_at, status, slides")
        .eq("user_id", ctx.userId)
        .eq("subject_id", subjectId)
        .order("created_at", { ascending: false })
        .limit(50),
      ctx.supabaseAdmin
        .from("documents")
        .select("id, title, source_kind, page_count, created_at")
        .eq("user_id", ctx.userId)
        .eq("subject_id", subjectId)
        .order("created_at", { ascending: false })
        .limit(50),
    ]);

    type LecRow = {
      id: string;
      title: string;
      transcript: string | null;
      duration_sec: number;
      created_at: string;
      status: string;
      slides: unknown[] | null;
    };
    type DocRow = {
      id: string;
      title: string;
      source_kind: string;
      page_count: number | null;
      created_at: string;
    };

    return {
      aulas: ((lec.data ?? []) as LecRow[]).map((l) => ({
        id: l.id,
        titulo: l.title,
        tem_transcricao: !!(l.transcript && l.transcript.length > 50),
        duracao_min: Math.round((l.duration_sec ?? 0) / 60),
        tem_slides: Array.isArray(l.slides) && l.slides.length > 0,
        criada_em: l.created_at,
      })),
      documentos: ((doc.data ?? []) as DocRow[]).map((d) => ({
        id: d.id,
        titulo: d.title,
        tipo: d.source_kind,
        paginas: d.page_count,
        criado_em: d.created_at,
      })),
    };
  },

  async buscar_no_material(input, ctx) {
    const pergunta = str(input.pergunta);
    if (!pergunta) return { error: "pergunta obrigatória" };
    const subjectId = str(input.subjectId);
    const limit = Math.min(Math.max(num(input.limit, 5), 1), 10);

    const chunks = await searchRelevantChunks({
      userId: ctx.userId,
      query: pergunta,
      subjectId: subjectId || null,
      limit,
      supabaseAdmin: ctx.supabaseAdmin,
      apiKey: ctx.openaiKey,
    });

    if (chunks.length === 0) {
      return {
        encontrados: 0,
        mensagem:
          "Nenhum trecho relevante encontrado. Talvez não tenha material indexado dessa matéria ainda — sugira o user gravar uma aula ou subir um PDF.",
      };
    }

    return {
      encontrados: chunks.length,
      trechos: chunks.map((c) => ({
        fonte_tipo: c.source_kind,
        fonte_id: c.source_id,
        trecho: c.content,
        similaridade: Math.round(c.similarity * 100) / 100,
        metadata: c.metadata,
      })),
    };
  },

  async gerar_resumo(input, ctx) {
    return callGenerateEndpoint("summary", input, ctx);
  },
  async criar_flashcards(input, ctx) {
    return callGenerateEndpoint("flashcards", input, ctx);
  },
  async criar_quiz(input, ctx) {
    return callGenerateEndpoint("quiz", input, ctx);
  },
  async criar_mapa_mental(input, ctx) {
    return callGenerateEndpoint("mindmap", input, ctx);
  },

  async gerar_imagem(input, ctx) {
    const prompt = str(input.prompt).trim();
    if (!prompt || prompt.length < 4) {
      return { error: "prompt obrigatório (mín 4 chars)" };
    }
    // Contexto opcional: passa SOMENTE um dos 3 (a tool não força só um;
    // o endpoint decide qual usar se múltiplos vierem).
    const lectureId = str(input.lectureId) || undefined;
    const summaryId = str(input.summaryId) || undefined;
    const documentId = str(input.documentId) || undefined;
    const resp = await fetch(`${ctx.origin}/api/ai/illustrate`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: ctx.sessionCookie,
      },
      body: JSON.stringify({ prompt, lectureId, summaryId, documentId }),
    });
    const json = (await resp.json()) as {
      url?: string;
      coinsCharged?: number;
      balanceAfter?: number;
      error?: string;
      required?: number;
      balance?: number;
    };
    if (!resp.ok || !json.url) {
      return {
        error: json.error ?? "Falha ao gerar imagem.",
        saldo_atual: json.balance,
        custo_necessario: json.required,
      };
    }
    return {
      url: json.url,
      // Markdown pronto pro Lumi colar na resposta — modelo costuma esquecer
      // de formatar como imagem, então entregamos pronto.
      markdown: `![Imagem gerada](${json.url})`,
      coins_gastos: json.coinsCharged,
      saldo_apos: json.balanceAfter,
    };
  },

  async abrir_rota(input) {
    const path = str(input.path);
    const motivo = str(input.motivo, "");
    if (!path || !path.startsWith("/")) {
      return { error: "path inválido (deve começar com /)" };
    }
    return {
      navegacao: { path, motivo },
      instrucao_pro_client:
        "Renderize um card clicável com este path. Não navegue automaticamente.",
    };
  },

  async marcar_item_plano(input, ctx) {
    const itemId = str(input.itemId);
    const status = str(input.status) as
      | "pending"
      | "in_progress"
      | "done"
      | "";
    if (!itemId) return { ok: false, error: "itemId obrigatório" };
    if (status !== "pending" && status !== "in_progress" && status !== "done") {
      return {
        ok: false,
        error: "status inválido (use pending | in_progress | done)",
      };
    }

    // Valida ownership via join com study_plans.user_id — não dá pra usar
    // updateItemStatusAsync (client lib) aqui; reimplementamos via admin.
    const { data: itemRow, error: readErr } = await ctx.supabaseAdmin
      .from("study_plan_items")
      .select("id, plan_id, study_plans!inner(user_id)")
      .eq("id", itemId)
      .maybeSingle();
    if (readErr) {
      return { ok: false, error: readErr.message };
    }
    if (!itemRow) {
      return { ok: false, error: "Item não encontrado." };
    }
    const ownerId =
      (itemRow as { study_plans?: { user_id?: string } | { user_id?: string }[] })
        .study_plans;
    const ownerUserId = Array.isArray(ownerId)
      ? ownerId[0]?.user_id
      : ownerId?.user_id;
    if (ownerUserId !== ctx.userId) {
      return { ok: false, error: "Item não pertence ao usuário." };
    }

    const patch: Record<string, unknown> = { status };
    patch.completed_at = status === "done" ? new Date().toISOString() : null;
    const { error: updErr } = await ctx.supabaseAdmin
      .from("study_plan_items")
      .update(patch)
      .eq("id", itemId);
    if (updErr) {
      return { ok: false, error: updErr.message };
    }
    return { ok: true, itemId, novoStatus: status };
  },

  async meu_progresso(input, ctx) {
    const scopeSubjectId = str(input.subjectId) || undefined;

    // 1. Saldo atual
    const { data: profile } = await ctx.supabaseAdmin
      .from("profiles")
      .select("coin_balance")
      .eq("id", ctx.userId)
      .maybeSingle();
    const saldoAtual =
      (profile as { coin_balance?: number } | null)?.coin_balance ?? 0;

    // 2. Gastos últimos 7 dias (amount < 0)
    const sevenDaysAgo = new Date(
      Date.now() - 7 * 24 * 60 * 60 * 1000,
    ).toISOString();
    const { data: txns } = await ctx.supabaseAdmin
      .from("coin_transactions")
      .select("amount, reason, created_at")
      .eq("user_id", ctx.userId)
      .lt("amount", 0)
      .gte("created_at", sevenDaysAgo)
      .limit(500);
    type TxRow = { amount: number; reason: string; created_at: string };
    const txnsList = (txns ?? []) as TxRow[];

    let gastos7dTotal = 0;
    const porCategoria: Record<string, number> = {};
    for (const t of txnsList) {
      const abs = Math.abs(t.amount);
      gastos7dTotal += abs;
      porCategoria[t.reason] = (porCategoria[t.reason] ?? 0) + abs;
    }
    const distribuicao = Object.entries(porCategoria)
      .map(([reason, total]) => ({ reason, total }))
      .sort((a, b) => b.total - a.total);

    // 3. Contagens de aulas / resumos / planos ativos
    const lecturesQ = ctx.supabaseAdmin
      .from("lectures")
      .select("id", { count: "exact", head: true })
      .eq("user_id", ctx.userId);
    const summariesQ = ctx.supabaseAdmin
      .from("summaries")
      .select("id", { count: "exact", head: true })
      .eq("user_id", ctx.userId);
    const plansActiveQ = ctx.supabaseAdmin
      .from("study_plans")
      .select("id", { count: "exact", head: true })
      .eq("user_id", ctx.userId)
      .eq("status", "active");
    if (scopeSubjectId) {
      lecturesQ.eq("subject_id", scopeSubjectId);
      summariesQ.eq("subject_id", scopeSubjectId);
      plansActiveQ.eq("subject_id", scopeSubjectId);
    }
    const [lecRes, sumRes, planRes] = await Promise.all([
      lecturesQ,
      summariesQ,
      plansActiveQ,
    ]);
    const numAulas = lecRes.count ?? 0;
    const numResumos = sumRes.count ?? 0;
    const numPlanosAtivos = planRes.count ?? 0;

    // 4. Próxima ação sugerida: item in_progress mais antigo de planos ativos,
    // ou criar plano se não tem nenhum ativo.
    let proximaAcao: {
      tipo: "retomar_item" | "criar_plano" | "tudo_em_dia";
      mensagem: string;
      itemId?: string;
      itemTitulo?: string;
      planoId?: string;
    } = {
      tipo: "tudo_em_dia",
      mensagem:
        "Nada pendente — bom momento pra gravar uma aula nova ou montar um plano.",
    };

    // Busca plano ativo + item in_progress mais antigo
    const planIdsQ = ctx.supabaseAdmin
      .from("study_plans")
      .select("id, title")
      .eq("user_id", ctx.userId)
      .eq("status", "active");
    if (scopeSubjectId) planIdsQ.eq("subject_id", scopeSubjectId);
    const { data: activePlans } = await planIdsQ;
    type PlanLite = { id: string; title: string };
    const planList = (activePlans ?? []) as PlanLite[];

    if (planList.length === 0) {
      proximaAcao = {
        tipo: "criar_plano",
        mensagem:
          "Você não tem plano de estudos ativo. Quer que eu monte um pra uma matéria?",
      };
    } else {
      const planIds = planList.map((p) => p.id);
      const { data: inProg } = await ctx.supabaseAdmin
        .from("study_plan_items")
        .select("id, plan_id, title, created_at")
        .in("plan_id", planIds)
        .eq("status", "in_progress")
        .order("created_at", { ascending: true })
        .limit(1);
      type ItemLite = {
        id: string;
        plan_id: string;
        title: string;
        created_at: string;
      };
      const oldest = ((inProg ?? []) as ItemLite[])[0];
      if (oldest) {
        const plan = planList.find((p) => p.id === oldest.plan_id);
        const ageDays = Math.floor(
          (Date.now() - new Date(oldest.created_at).getTime()) /
            (24 * 60 * 60 * 1000),
        );
        proximaAcao = {
          tipo: "retomar_item",
          mensagem: `Você tem "${oldest.title}" em andamento${
            ageDays > 0 ? ` há ${ageDays}d` : ""
          } no plano "${plan?.title ?? "plano"}". Quer retomar?`,
          itemId: oldest.id,
          itemTitulo: oldest.title,
          planoId: oldest.plan_id,
        };
      }
    }

    return {
      saldo_atual: saldoAtual,
      gastos_7d: {
        total: gastos7dTotal,
        por_categoria: distribuicao,
      },
      contagens: {
        aulas: numAulas,
        resumos: numResumos,
        planos_ativos: numPlanosAtivos,
        escopo: scopeSubjectId ? "materia" : "geral",
      },
      proxima_acao: proximaAcao,
    };
  },

  async agendar_no_calendario(input, ctx) {
    const titulo = str(input.titulo).trim();
    const tipo = str(input.tipo);
    const startsAt = str(input.startsAt).trim();
    const endsAt = str(input.endsAt).trim() || undefined;
    const subjectId = str(input.subjectId).trim() || undefined;
    const descricao = str(input.descricao).trim() || undefined;

    if (!titulo) return { ok: false, error: "titulo obrigatório" };
    const allowedTipos = ["aula", "bloco", "prova", "trabalho", "outro"];
    if (!allowedTipos.includes(tipo)) {
      return {
        ok: false,
        error: `tipo inválido (use ${allowedTipos.join(" | ")})`,
      };
    }
    const startDate = new Date(startsAt);
    if (!startsAt || Number.isNaN(startDate.getTime())) {
      return { ok: false, error: "startsAt inválido (use ISO 8601)" };
    }
    let endIso: string | undefined = undefined;
    if (endsAt) {
      const endDate = new Date(endsAt);
      if (Number.isNaN(endDate.getTime())) {
        return { ok: false, error: "endsAt inválido (use ISO 8601)" };
      }
      if (endDate.getTime() <= startDate.getTime()) {
        return { ok: false, error: "endsAt precisa ser depois de startsAt" };
      }
      endIso = endDate.toISOString();
    } else {
      // Default: 1h de duração
      endIso = new Date(startDate.getTime() + 60 * 60 * 1000).toISOString();
    }

    // Valida ownership da matéria, se vier
    if (subjectId) {
      const { data: subj, error: subjErr } = await ctx.supabaseAdmin
        .from("subjects")
        .select("id")
        .eq("id", subjectId)
        .eq("user_id", ctx.userId)
        .maybeSingle();
      if (subjErr) return { ok: false, error: subjErr.message };
      if (!subj) {
        return { ok: false, error: "subjectId não pertence ao usuário." };
      }
    }

    // Calendar persiste em localStorage no client; servidor só prepara payload.
    // Cliente precisa escutar `clientAction.type === 'add_calendar_event'` e
    // chamar `addEventAsync` do `@/lib/calendar-events`.
    return {
      ok: true,
      clientAction: {
        type: "add_calendar_event",
        payload: {
          type: tipo,
          title: titulo,
          subject_id: subjectId,
          starts_at: startDate.toISOString(),
          ends_at: endIso,
          description: descricao,
        },
      },
      navegacao: {
        path: "/schedule",
        motivo: `Evento "${titulo}" agendado — ver no calendário`,
      },
      observacao:
        "Evento ainda não persistido — depende do client executar a clientAction. Confirme com o user pelo card.",
    };
  },

  async criar_plano_de_estudos(input, ctx) {
    const subjectId = str(input.subjectId);
    if (!subjectId) return { error: "subjectId obrigatório" };
    const conteudo = str(input.conteudo).trim();
    if (!conteudo) {
      return {
        error:
          "Forneça `conteudo` (tópicos da prova) — sem isso não dá pra desenhar a trilha.",
      };
    }
    const dataProva = str(input.dataProva) || undefined;
    const horasSemanais =
      typeof input.horasSemanais === "number" ? input.horasSemanais : undefined;
    const titulo = str(input.titulo) || undefined;

    const resp = await fetch(`${ctx.origin}/api/lumi/study-plan`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: ctx.sessionCookie,
      },
      body: JSON.stringify({
        subjectId,
        conteudo,
        dataProva,
        horasSemanais,
        titulo,
      }),
    });
    const json = (await resp.json()) as {
      planId?: string;
      url?: string;
      title?: string;
      itemCount?: number;
      coinsCharged?: number;
      balanceAfter?: number;
      error?: string;
      required?: number;
      balance?: number;
    };
    if (!resp.ok || !json.planId) {
      return {
        error: json.error ?? "Falha ao criar plano de estudos.",
        saldo_atual: json.balance,
        custo_necessario: json.required,
      };
    }
    return {
      titulo: json.title,
      itens_criados: json.itemCount,
      url: json.url,
      navegacao: {
        path: json.url,
        motivo: `Abrir plano — ${json.title ?? "trilha de estudos"}`,
      },
      coins_gastos: json.coinsCharged,
      saldo_apos: json.balanceAfter,
      observacao:
        "Plano salvo em /planos. Cada item da trilha tem checkbox de concluído — o aluno avança e o sistema acompanha o progresso até a prova.",
    };
  },

  async gerar_rotina_estudo(input, ctx) {
    const subjectId = str(input.subjectId);
    if (!subjectId) return { error: "subjectId obrigatório" };
    const conteudo = str(input.conteudo).trim();
    const nomesAulas = arr(input.nomesAulas);
    if (!conteudo && nomesAulas.length === 0) {
      return {
        error:
          "Forneça `conteudo` (tópicos da prova) OU `nomesAulas` (lista de aulas). Sem isso não dá pra montar plano.",
      };
    }
    const dataProva = str(input.dataProva) || undefined;
    const horasSemanais =
      typeof input.horasSemanais === "number" ? input.horasSemanais : undefined;
    const titulo = str(input.titulo) || undefined;

    const resp = await fetch(`${ctx.origin}/api/lumi/routine`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: ctx.sessionCookie,
      },
      body: JSON.stringify({
        subjectId,
        conteudo: conteudo || undefined,
        nomesAulas: nomesAulas.length > 0 ? nomesAulas : undefined,
        dataProva,
        horasSemanais,
        titulo,
      }),
    });
    const json = (await resp.json()) as {
      documentId?: string;
      url?: string;
      publicUrl?: string;
      title?: string;
      subjectId?: string;
      coinsCharged?: number;
      balanceAfter?: number;
      error?: string;
      required?: number;
      balance?: number;
    };
    if (!resp.ok || !json.documentId) {
      return {
        error: json.error ?? "Falha ao gerar rotina.",
        saldo_atual: json.balance,
        custo_necessario: json.required,
      };
    }
    return {
      titulo: json.title,
      url: json.url,
      navegacao: {
        path: json.url,
        motivo: `Abrir rotina — ${json.title ?? "rotina de estudo"}`,
      },
      pdf_publico: json.publicUrl,
      coins_gastos: json.coinsCharged,
      saldo_apos: json.balanceAfter,
      observacao:
        "Rotina salva como PDF na pasta da matéria. Avise o user que o PDF pode ser baixado/aberto pelo card.",
    };
  },

  async iniciar_modo_prova(input, ctx) {
    const subjectId = str(input.subjectId);
    if (!subjectId) return { error: "subjectId obrigatório" };
    const confirmado = input.confirmado === true;
    if (!confirmado) {
      // Gate de proteção: 26+ coins é caro. Forçamos o agent a pedir confirmação
      // explícita antes de gastar. Esse retorno faz o Claude voltar pra conversa,
      // perguntar "quer rodar Modo Prova? gasta ~26 coins" e SÓ chamar de novo
      // com confirmado:true após o sim.
      return {
        needsConfirmation: true,
        message:
          "PRECISA_CONFIRMACAO. Antes de gastar ~26 coins, pergunte ao user: 'Quer rodar Modo Prova? Vou gerar resumo + flashcards + quiz da matéria em paralelo, custa ~26 coins.' Só me chame de novo com confirmado:true depois do user responder sim/pode/manda.",
        costPreview: 26,
      };
    }
    const horasDisponiveis = num(input.horasDisponiveis, 3);
    const dataProva = str(input.dataProva, "");
    const topicosFoco = arr(input.topicosFoco);

    // 1. Lista material da matéria
    const [lecRes, docRes, subjRes] = await Promise.all([
      ctx.supabaseAdmin
        .from("lectures")
        .select("id, title, transcript, slides, duration_sec")
        .eq("user_id", ctx.userId)
        .eq("subject_id", subjectId)
        .order("created_at", { ascending: false })
        .limit(20),
      ctx.supabaseAdmin
        .from("documents")
        .select("id, title, source_text, page_count")
        .eq("user_id", ctx.userId)
        .eq("subject_id", subjectId)
        .order("created_at", { ascending: false })
        .limit(20),
      ctx.supabaseAdmin
        .from("subjects")
        .select("name")
        .eq("user_id", ctx.userId)
        .eq("id", subjectId)
        .maybeSingle(),
    ]);

    type LecRow = {
      id: string;
      title: string;
      transcript: string | null;
      slides: unknown;
      duration_sec: number;
    };
    type DocRow = {
      id: string;
      title: string;
      source_text: string | null;
      page_count: number | null;
    };

    let lectures = ((lecRes.data ?? []) as LecRow[]).filter(
      (l) => l.transcript && l.transcript.length > 80,
    );
    let documents = ((docRes.data ?? []) as DocRow[]).filter(
      (d) => d.source_text && d.source_text.length > 80,
    );
    let subjectName =
      (subjRes.data as { name?: string } | null)?.name ?? "Matéria";
    let effectiveSubjectId = subjectId;

    // REDE DE SEGURANÇA: com contexto "Livre" o Lumi às vezes mira a matéria
    // errada e essa fica vazia. Em vez de falar "sem material / grave de novo"
    // (errado), buscamos o conteúdo por embeddings em TODAS as matérias e
    // corrigimos pra onde o material realmente está.
    if (lectures.length === 0 && documents.length === 0) {
      const probe =
        topicosFoco.length > 0 ? topicosFoco.join(" ") : subjectName;
      const chunks = await searchRelevantChunks({
        userId: ctx.userId,
        query: probe,
        subjectId: null,
        limit: 8,
        supabaseAdmin: ctx.supabaseAdmin,
        apiKey: ctx.openaiKey,
      }).catch(() => []);
      const foundDocIds = [
        ...new Set(
          chunks
            .filter((c) => c.source_kind === "document")
            .map((c) => c.source_id),
        ),
      ];
      const foundLecIds = [
        ...new Set(
          chunks
            .filter((c) => c.source_kind === "lecture")
            .map((c) => c.source_id),
        ),
      ];
      if (foundDocIds.length > 0 || foundLecIds.length > 0) {
        type DocRowS = DocRow & { subject_id: string | null };
        type LecRowS = LecRow & { subject_id: string | null };
        const [d2, l2] = await Promise.all([
          foundDocIds.length
            ? ctx.supabaseAdmin
                .from("documents")
                .select("id, title, source_text, page_count, subject_id")
                .eq("user_id", ctx.userId)
                .in("id", foundDocIds)
            : Promise.resolve({ data: [] as DocRowS[] }),
          foundLecIds.length
            ? ctx.supabaseAdmin
                .from("lectures")
                .select("id, title, transcript, slides, duration_sec, subject_id")
                .eq("user_id", ctx.userId)
                .in("id", foundLecIds)
            : Promise.resolve({ data: [] as LecRowS[] }),
        ]);
        const foundDocs = ((d2.data ?? []) as DocRowS[]).filter(
          (d) => d.source_text && d.source_text.length > 80,
        );
        const foundLecs = ((l2.data ?? []) as LecRowS[]).filter(
          (l) => l.transcript && l.transcript.length > 80,
        );
        // Vota na matéria dominante entre o material achado e corrige.
        const votes = new Map<string, number>();
        for (const d of foundDocs)
          if (d.subject_id)
            votes.set(d.subject_id, (votes.get(d.subject_id) ?? 0) + 1);
        for (const l of foundLecs)
          if (l.subject_id)
            votes.set(l.subject_id, (votes.get(l.subject_id) ?? 0) + 1);
        const corrected = [...votes.entries()].sort(
          (a, b) => b[1] - a[1],
        )[0]?.[0];
        if (corrected) {
          effectiveSubjectId = corrected;
          const { data: sj } = await ctx.supabaseAdmin
            .from("subjects")
            .select("name")
            .eq("id", corrected)
            .maybeSingle();
          subjectName =
            (sj as { name?: string } | null)?.name ?? subjectName;
        }
        documents = foundDocs.filter(
          (d) => !d.subject_id || d.subject_id === effectiveSubjectId,
        );
        lectures = foundLecs.filter(
          (l) => !l.subject_id || l.subject_id === effectiveSubjectId,
        );
      }
    }

    if (lectures.length === 0 && documents.length === 0) {
      return {
        error:
          "Não achei material com texto sobre isso em nenhuma matéria do user. Sugira ANEXAR um PDF ou GRAVAR uma aula sobre o tema — nunca peça pra 'regravar' algo que já existe.",
        materia: subjectName,
      };
    }

    const lectureIds = lectures.map((l) => l.id);
    const documentIds = documents.map((d) => d.id);

    // 2. Descoberta de tópicos críticos (via RAG ou tópicos forçados)
    let topicos: string[] = topicosFoco;
    if (topicos.length === 0) {
      // Faz 2 buscas semânticas com queries genéricas pra mapear o terreno
      const queries = [
        `tópicos principais ${subjectName} prova`,
        `conceitos chave ${subjectName}`,
      ];
      const found = await Promise.all(
        queries.map((q) =>
          searchRelevantChunks({
            userId: ctx.userId,
            query: q,
            subjectId: effectiveSubjectId,
            limit: 3,
            supabaseAdmin: ctx.supabaseAdmin,
            apiKey: ctx.openaiKey,
          }).catch(() => []),
        ),
      );
      const titles = new Set<string>();
      for (const chunks of found) {
        for (const c of chunks) {
          const t = (c.metadata as { title?: string } | null)?.title;
          if (typeof t === "string" && t.trim()) titles.add(t.trim());
        }
      }
      topicos = Array.from(titles).slice(0, 5);
    }

    // 3. Foco custom pros 3 prompts (resumo + cards + quiz)
    const focoComum = [
      topicos.length > 0
        ? `Foco em tópicos da prova: ${topicos.join(", ")}.`
        : `Foco em tópicos críticos da matéria de ${subjectName}.`,
      "Priorize conceitos com alta probabilidade de cair em prova.",
      "Evite divagar — direto ao essencial pra revisão rápida.",
    ].join(" ");

    // 4. Gera 3 assets em paralelo via callGenerateEndpoint
    const sharedInput = {
      subjectId: effectiveSubjectId,
      lectureIds,
      documentIds,
      focoCustom: focoComum,
    };

    const [resumo, cards, quiz] = await Promise.all([
      callGenerateEndpoint("summary", { ...sharedInput, profundidade: "concise" }, ctx),
      callGenerateEndpoint("flashcards", { ...sharedInput, quantidade: 15, nivel: "intermediate" }, ctx),
      callGenerateEndpoint("quiz", { ...sharedInput, quantidade: 10, dificuldade: "medium" }, ctx),
    ]);

    // 5. Monta cronograma — split simples baseado nas horas disponíveis
    const cronograma = montarCronograma({
      horasDisponiveis,
      temResumo: !!(resumo as { sucesso?: boolean }).sucesso,
      temCards: !!(cards as { sucesso?: boolean }).sucesso,
      temQuiz: !!(quiz as { sucesso?: boolean }).sucesso,
    });

    const totalCoins =
      ((resumo as { coins_cobrados?: number }).coins_cobrados ?? 0) +
      ((cards as { coins_cobrados?: number }).coins_cobrados ?? 0) +
      ((quiz as { coins_cobrados?: number }).coins_cobrados ?? 0);

    return {
      sucesso: true,
      tipo: "modo_prova",
      materia: subjectName,
      data_prova: dataProva || "amanhã",
      horas_disponiveis: horasDisponiveis,
      topicos_foco: topicos,
      assets: {
        resumo: resumo as Record<string, unknown>,
        flashcards: cards as Record<string, unknown>,
        quiz: quiz as Record<string, unknown>,
      },
      cronograma,
      total_coins_cobrados: totalCoins,
    };
  },
};

type CronogramaBloco = {
  ordem: number;
  duracao_min: number;
  atividade: string;
  url?: string;
  tipo: "resumo" | "flashcards" | "quiz" | "pausa";
};

/**
 * Heurística simples de cronograma. Não chama IA — distribui as horas
 * em blocos de revisão ativa intercalados com pausas curtas (Pomodoro-like).
 */
function montarCronograma(opts: {
  horasDisponiveis: number;
  temResumo: boolean;
  temCards: boolean;
  temQuiz: boolean;
}): CronogramaBloco[] {
  const totalMin = Math.round(opts.horasDisponiveis * 60);
  const blocks: CronogramaBloco[] = [];
  let order = 0;
  let remaining = totalMin;

  // Bloco 1: resumo (~30% do tempo, max 30min)
  if (opts.temResumo && remaining > 0) {
    const d = Math.min(Math.round(totalMin * 0.3), 30);
    blocks.push({
      ordem: ++order,
      duracao_min: d,
      atividade: "Ler resumo completo, marcar dúvidas",
      tipo: "resumo",
    });
    remaining -= d;
  }
  // Pausa curta
  if (remaining > 15) {
    blocks.push({
      ordem: ++order,
      duracao_min: 5,
      atividade: "Pausa curta — água, alongamento",
      tipo: "pausa",
    });
    remaining -= 5;
  }
  // Bloco 2: flashcards (~35% do total, max 40min)
  if (opts.temCards && remaining > 0) {
    const d = Math.min(Math.round(totalMin * 0.35), Math.max(remaining - 25, 15));
    blocks.push({
      ordem: ++order,
      duracao_min: d,
      atividade: "Flashcards — revisão ativa, marcar errados",
      tipo: "flashcards",
    });
    remaining -= d;
  }
  // Pausa
  if (remaining > 10) {
    blocks.push({
      ordem: ++order,
      duracao_min: 5,
      atividade: "Pausa — dar uma volta",
      tipo: "pausa",
    });
    remaining -= 5;
  }
  // Bloco 3: quiz (restante)
  if (opts.temQuiz && remaining > 0) {
    blocks.push({
      ordem: ++order,
      duracao_min: remaining,
      atividade: "Quiz simulação — modo prova, revisar erros no final",
      tipo: "quiz",
    });
  }
  return blocks;
}

/**
 * Helper unificado pros 4 modes de geração. Pega aulas/docs do input,
 * monta payload no formato esperado pelo `/api/ai/generate`, chama-o
 * com o cookie de sessão do user (cobra coins do user logado).
 */
async function callGenerateEndpoint(
  mode: "summary" | "flashcards" | "quiz" | "mindmap",
  input: Record<string, unknown>,
  ctx: ToolContext,
): Promise<unknown> {
  const subjectId = str(input.subjectId);
  if (!subjectId) return { error: "subjectId obrigatório" };

  const lectureIds = arr(input.lectureIds);
  const documentIds = arr(input.documentIds);
  if (lectureIds.length === 0 && documentIds.length === 0) {
    return {
      error:
        "Forneça pelo menos um lectureId ou documentId. Use buscar_no_material/listar_aulas_e_docs antes pra descobrir.",
    };
  }

  // Carrega transcripts + sourceTexts
  const transcripts: string[] = [];
  const pdfTexts: string[] = [];

  if (lectureIds.length > 0) {
    const { data } = await ctx.supabaseAdmin
      .from("lectures")
      .select("id, transcript, slides")
      .eq("user_id", ctx.userId)
      .in("id", lectureIds);
    type LecRow = { id: string; transcript: string | null; slides: unknown };
    for (const l of (data ?? []) as LecRow[]) {
      const t = (l.transcript ?? "").trim();
      if (t.length > 0) {
        let combined = t;
        const slides = l.slides;
        if (Array.isArray(slides) && slides.length > 0) {
          type Slide = { pageNumber?: number; title?: string; text?: string };
          const slidesText = (slides as Slide[])
            .map(
              (s) =>
                `[Slide ${s.pageNumber ?? "?"}${s.title ? ` — ${s.title}` : ""}]\n${s.text ?? ""}`,
            )
            .join("\n\n");
          combined = `${combined}\n\n${slidesText}`;
        }
        transcripts.push(combined);
      }
    }
  }
  if (documentIds.length > 0) {
    const { data } = await ctx.supabaseAdmin
      .from("documents")
      .select("id, source_text")
      .eq("user_id", ctx.userId)
      .in("id", documentIds);
    for (const d of ((data ?? []) as Array<{ source_text: string | null }>)) {
      if (d.source_text && d.source_text.length > 0) pdfTexts.push(d.source_text);
    }
  }

  if (transcripts.length === 0 && pdfTexts.length === 0) {
    return {
      error:
        "As fontes selecionadas estão vazias (sem transcript/source_text). Avise o user.",
    };
  }

  const comImagens = !!input.comImagens;
  const options: Record<string, unknown> = {
    withImages: comImagens && mode !== "mindmap",
    userInstructions: str(input.focoCustom) || undefined,
  };
  if (mode === "summary") options.depth = str(input.profundidade, "standard");
  if (mode === "flashcards") {
    options.count = Math.min(Math.max(num(input.quantidade, 15), 5), 30);
    options.level = str(input.nivel, "intermediate");
  }
  if (mode === "quiz") {
    options.count = Math.min(Math.max(num(input.quantidade, 10), 5), 20);
    options.difficulty = str(input.dificuldade, "medium");
  }
  if (mode === "mindmap") {
    options.complexity = str(input.complexidade, "medium");
  }

  const resp = await fetch(`${ctx.origin}/api/ai/generate`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      cookie: ctx.sessionCookie,
    },
    body: JSON.stringify({
      mode,
      sources: { transcripts, pdfTexts },
      options,
    }),
  });

  const json = (await resp.json()) as {
    mode?: string;
    content?: unknown;
    coinsCharged?: number;
    balanceAfter?: number;
    error?: string;
    required?: number;
    balance?: number;
  };

  if (!resp.ok) {
    return {
      error: json.error ?? "Falha na geração.",
      saldo_atual: json.balance,
      custo_necessario: json.required,
    };
  }

  // Persistência básica: cria asset com o subjectId vindo do input.
  // (replica lógica do wizard de forma simplificada)
  const titleGuess = inferTitle(mode, json.content);
  let assetUrl: string | undefined;
  let assetId: string | undefined;

  if (mode === "summary") {
    const md =
      typeof json.content === "object" && json.content
        ? (json.content as { markdown?: string }).markdown ?? ""
        : "";
    const summaryContent = {
      generatedAt: new Date().toISOString(),
      generalSummary: md,
      highlights: extractHighlights(md, 6),
      sections: [],
    };
    if (lectureIds.length > 0) {
      // Upsert summary lecture-linked
      const { data } = await ctx.supabaseAdmin
        .from("summaries")
        .upsert(
          {
            user_id: ctx.userId,
            subject_id: subjectId,
            lecture_id: lectureIds[0],
            document_id: null,
            title: titleGuess,
            content: summaryContent,
          },
          { onConflict: "lecture_id" },
        )
        .select("id")
        .single();
      assetId = data?.id;
      assetUrl = data?.id ? `/resumo/${lectureIds[0]}` : undefined;
    } else if (documentIds.length > 0) {
      const { data } = await ctx.supabaseAdmin
        .from("summaries")
        .insert({
          user_id: ctx.userId,
          subject_id: subjectId,
          lecture_id: null,
          document_id: documentIds[0],
          title: titleGuess,
          content: summaryContent,
        })
        .select("id")
        .single();
      assetId = data?.id;
      assetUrl = data?.id ? `/resumo/doc/${data.id}` : undefined;
    }
  } else {
    // Pra flashcards/quiz/mindmap: cria lecture wrapper + lecture_asset
    const { data: lec } = await ctx.supabaseAdmin
      .from("lectures")
      .insert({
        user_id: ctx.userId,
        subject_id: subjectId,
        title: titleGuess,
        transcript: "",
        duration_sec: 0,
        status: "draft",
        messages: [],
      })
      .select("id")
      .single();
    if (lec) {
      let payload: Record<string, unknown> = {};
      if (mode === "flashcards") {
        payload = {
          generatedAt: new Date().toISOString(),
          cards: (json.content as { cards?: unknown[] }).cards ?? [],
        };
      } else if (mode === "quiz") {
        payload = {
          generatedAt: new Date().toISOString(),
          questions: (json.content as { questions?: unknown[] }).questions ?? [],
        };
      } else {
        const c = json.content as { centralTopic?: string; branches?: unknown[] };
        payload = {
          generatedAt: new Date().toISOString(),
          centralTopic: c.centralTopic ?? titleGuess,
          branches: c.branches ?? [],
        };
      }
      // IMPORTANTE: as rotas /deck/[id], /quiz-banco/[id] e /mapa/[id] buscam
      // lecture_assets POR id do asset — não da aula. Capturamos o id da linha
      // inserida; usar lec.id aqui fazia o card abrir em "não encontrado".
      const { data: assetRow } = await ctx.supabaseAdmin
        .from("lecture_assets")
        .insert({
          lecture_id: lec.id,
          user_id: ctx.userId,
          kind: mode,
          payload,
          coins_spent: json.coinsCharged ?? 0,
        })
        .select("id")
        .single();
      const newAssetId = assetRow?.id as string | undefined;
      assetId = newAssetId;
      assetUrl = newAssetId
        ? mode === "flashcards"
          ? `/deck/${newAssetId}`
          : mode === "quiz"
            ? `/quiz-banco/${newAssetId}`
            : `/mapa/${newAssetId}`
        : undefined;
    }
  }

  return {
    sucesso: true,
    tipo: mode,
    titulo: titleGuess,
    asset_id: assetId,
    url: assetUrl,
    coins_cobrados: json.coinsCharged ?? 0,
    saldo_apos: json.balanceAfter,
  };
}

function inferTitle(mode: string, content: unknown): string {
  if (mode === "summary") {
    const md =
      typeof content === "object" && content
        ? (content as { markdown?: string }).markdown ?? ""
        : "";
    const m = md.match(/^#\s+(.+)$/m);
    if (m) return m[1].trim().slice(0, 200);
  }
  if (typeof content === "object" && content) {
    const t = (content as { title?: string }).title;
    if (typeof t === "string" && t.trim()) return t.trim().slice(0, 200);
    if (mode === "mindmap") {
      const c = (content as { centralTopic?: string }).centralTopic;
      if (c) return c.slice(0, 200);
    }
  }
  const labels: Record<string, string> = {
    summary: "Resumo",
    flashcards: "Flashcards",
    quiz: "Quiz",
    mindmap: "Mapa mental",
  };
  return `${labels[mode] ?? "Asset"} ${new Date().toLocaleDateString("pt-BR")}`;
}

function extractHighlights(markdown: string, max: number): string[] {
  const out: string[] = [];
  const lines = markdown.split("\n");
  let inH = false;
  for (const line of lines) {
    if (/^##\s+pontos[- ]chave/i.test(line.trim())) {
      inH = true;
      continue;
    }
    if (inH) {
      if (/^##\s/.test(line)) break;
      const m = line.match(/^\s*-\s+(.+)/);
      if (m) {
        out.push(m[1].replace(/\[\[([^\]]+)\]\]/g, "$1").slice(0, 120));
        if (out.length >= max) break;
      }
    }
  }
  return out;
}

/**
 * Executa uma tool. Retorna o resultado serializado pra mandar de volta
 * pro Claude no formato `tool_result`.
 */
export async function executeTool(
  name: string,
  input: Record<string, unknown>,
  ctx: ToolContext,
): Promise<unknown> {
  const handler = handlers[name as LumiToolName];
  if (!handler) {
    return { error: `Tool desconhecida: ${name}` };
  }
  try {
    return await handler(input, ctx);
  } catch (err) {
    console.error(`[lumi-tools] ${name} failed`, err);
    return { error: (err as Error).message ?? "Erro ao executar tool." };
  }
}
