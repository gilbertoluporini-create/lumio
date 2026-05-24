// Conteúdo estático da Central de Ajuda do Lumio.
// Para adicionar / editar artigos, basta atualizar os arrays abaixo.
// O body suporta markdown simples (parágrafos separados por linha em branco,
// listas com "- " e headings com "## ").

export type HelpCategoryIcon =
  | "rocket"
  | "mic"
  | "file"
  | "card"
  | "tool";

export type HelpArticle = {
  slug: string;
  title: string;
  excerpt: string;
  body: string;
  readTimeMin: number;
};

export type HelpCategory = {
  slug: string;
  title: string;
  description: string;
  icon: HelpCategoryIcon;
  keywords: string[];
  articles: HelpArticle[];
};

export const helpCategories: HelpCategory[] = [
  {
    slug: "primeiros-passos",
    title: "Primeiros passos",
    description: "Comece sua jornada no Lumio.",
    icon: "rocket",
    keywords: [
      "começar",
      "comecar",
      "iniciar",
      "onboarding",
      "novo",
      "primeira",
      "tutorial",
      "início",
      "inicio",
    ],
    articles: [
      {
        slug: "criar-conta",
        title: "Crie sua conta no Lumio",
        excerpt:
          "Em menos de um minuto você cria sua conta e começa a gravar e resumir aulas.",
        readTimeMin: 2,
        body: `## Crie sua conta em segundos

Para começar a usar o Lumio, acesse [lumioapp.net](https://lumioapp.net) e clique em **"Entrar"**. Você pode criar uma conta de duas formas:

- **Com sua conta Google**: o jeito mais rápido. Um clique e pronto.
- **Com e-mail e senha**: digite seu e-mail, defina uma senha forte e confirme.

Após o primeiro login você será levado ao **onboarding**, onde definimos juntos:

- Seu nome (para personalizar a experiência).
- Suas matérias iniciais (você pode adicionar mais depois).
- Seu objetivo de estudo (semestre, vestibular, residência, OAB etc).

## Próximos passos

Assim que terminar o onboarding, você cai no **Dashboard**. A partir dali, recomendamos:

1. Adicionar sua primeira matéria.
2. Gravar sua primeira aula (mesmo que curta, só pra sentir o fluxo).
3. Gerar o primeiro resumo com IA.

Se travar em alguma etapa, fale com a gente em **contato@lumioapp.net**.`,
      },
      {
        slug: "adicionar-materia",
        title: "Adicione sua primeira matéria",
        excerpt:
          "Organize suas aulas por matéria para ter resumos e flashcards agrupados.",
        readTimeMin: 3,
        body: `## Por que criar matérias?

No Lumio, toda aula vive dentro de uma matéria. Isso permite:

- Agrupar transcrições, resumos, flashcards e quizzes do mesmo tema.
- Ver o quanto você gravou em cada disciplina.
- Filtrar buscas e gerar resumões consolidados por matéria.

## Como adicionar uma matéria

1. No **Dashboard**, clique em **"+ Nova matéria"**.
2. Dê um nome curto e claro (ex: "Anatomia I", "Cardiologia", "Direito Civil").
3. Escolha um **emoji** e uma **cor** para reconhecer rápido na lista.
4. (Opcional) Adicione uma descrição com a ementa ou objetivos.
5. Clique em **"Criar matéria"**.

## Dicas de organização

- Use nomes consistentes ao longo do semestre.
- Se o curso for longo, prefira **uma matéria por disciplina** em vez de uma por aula.
- Você pode arquivar matérias antigas sem perder o conteúdo.`,
      },
      {
        slug: "primeira-aula",
        title: "Grave sua primeira aula",
        excerpt:
          "Aprenda o fluxo completo: começar a gravação, anexar slides e gerar o resumo.",
        readTimeMin: 4,
        body: `## Comece a gravar em 3 cliques

1. Entre em uma matéria.
2. Clique em **"+ Nova aula"**.
3. Pressione o botão **🎙 Gravar** e libere o microfone quando o navegador pedir.

A partir daí, a transcrição aparece em tempo real do lado esquerdo da tela. Você pode acompanhar, marcar dúvidas e até conversar com a IA durante a aula.

## Anexar slides (opcional, mas recomendado)

Se o professor compartilhar PDF dos slides, anexe direto na aula. O Lumio vai:

- Mostrar cada slide ao lado da transcrição.
- Cruzar referências com o que foi falado.
- Melhorar muito a qualidade do resumo gerado.

## Gerando o resumo

Quando você terminar a aula, basta clicar em **"Gerar resumo"**. A IA do Lumio analisa toda a transcrição (e os slides, se houver) e devolve um documento estruturado, com tópicos, definições e pontos de atenção.

Você pode editar livremente o resumo depois.`,
      },
    ],
  },
  {
    slug: "gravacoes",
    title: "Gravações",
    description: "Grave, organize e revise suas aulas.",
    icon: "mic",
    keywords: [
      "gravar",
      "gravação",
      "gravacao",
      "audio",
      "áudio",
      "aula",
      "transcrever",
      "transcrição",
      "microfone",
    ],
    articles: [
      {
        slug: "transcricao-ao-vivo",
        title: "Como funciona a transcrição ao vivo",
        excerpt:
          "Entenda o que acontece nos bastidores e como obter a melhor qualidade.",
        readTimeMin: 4,
        body: `## Transcrição em tempo real

O Lumio usa o reconhecimento de fala do próprio navegador para transcrever sua aula **enquanto ela acontece**. Isso significa:

- Você vê o texto aparecer ao vivo, palavra por palavra.
- Nenhum áudio precisa ser enviado pra servidores externos no momento da gravação.
- O texto fica pronto pra ser usado pelo nosso modelo de IA imediatamente.

## Pra ter a melhor qualidade

- Use **Google Chrome**, **Edge** ou **Brave** (são os que mais funcionam bem).
- Aproxime o microfone do professor sempre que possível.
- Em salas barulhentas, prefira um fone com microfone embutido.
- Idiomas suportados: **Português (BR)** por padrão, com fallback automático.

## E se eu perder conexão?

A transcrição continua no seu dispositivo. Quando a conexão volta, salvamos o conteúdo. Se o navegador travar, o último estado salvo é recuperado.`,
      },
      {
        slug: "anexar-pdf",
        title: "Anexar PDF de slides à aula",
        excerpt:
          "Combine transcrição + slides pra resumos muito mais ricos.",
        readTimeMin: 3,
        body: `## Por que anexar slides?

Quando você anexa o PDF dos slides, o Lumio passa a ter **duas fontes** pra montar o resumo:

1. O que o professor **falou** (transcrição).
2. O que o professor **mostrou** (slides com figuras, tabelas e fórmulas).

O resultado é um resumo muito mais completo, com referências cruzadas.

## Como anexar

1. Abra a aula (durante ou depois da gravação).
2. Clique no ícone de **clipe (Anexar)** ao lado da transcrição.
3. Selecione o arquivo PDF.
4. Aguarde o processamento (geralmente entre 5 e 30 segundos).

Você pode navegar entre slides com as setas do teclado ou clicando direto na miniatura.

## Limites

- Tamanho máximo: **50 MB** por PDF.
- Funciona melhor com PDFs nativos (não escaneados). PDFs digitalizados podem ter qualidade reduzida.`,
      },
      {
        slug: "pausar-retomar",
        title: "Pausar e retomar gravações",
        excerpt:
          "Saiba como interromper e voltar a gravar sem perder nada.",
        readTimeMin: 2,
        body: `## Pausar uma gravação

Durante a aula, clique no botão **"Pausar"** quando precisar:

- Atender o telefone.
- Ir ao banheiro.
- O professor fizer uma pausa.

A transcrição para imediatamente e nada novo é capturado até você retomar.

## Retomar

Basta clicar em **"Retomar"**. A nova transcrição se acumula no mesmo documento, continuando de onde parou.

## Encerrar a aula

Quando terminar, clique em **"Encerrar gravação"**. A aula é salva automaticamente e você pode gerar o resumo, fazer perguntas pra IA ou revisar a transcrição quando quiser.`,
      },
    ],
  },
  {
    slug: "resumos",
    title: "Resumos",
    description: "Crie, edite e aprimore seus resumos.",
    icon: "file",
    keywords: [
      "resumo",
      "resumos",
      "ia",
      "claude",
      "flashcards",
      "quiz",
      "mapa mental",
      "editar",
    ],
    articles: [
      {
        slug: "resumo-ia",
        title: "Como funciona o resumo com IA",
        excerpt:
          "Por baixo dos panos: como o Lumio transforma sua aula em um resumo estruturado.",
        readTimeMin: 4,
        body: `## O que o Lumio faz

Quando você clica em **"Gerar resumo"**, mandamos pra IA:

- A transcrição completa da aula.
- Os slides anexados (texto + estrutura).
- O contexto da matéria (nome, ementa).

A IA então organiza tudo em um documento estruturado, com:

- **Tópicos principais** com hierarquia clara.
- **Definições importantes** destacadas.
- **Exemplos** mencionados na aula.
- **Pontos de atenção** marcados pelo professor.

## Quanto tempo demora?

- Aulas curtas (< 30 min): cerca de **20 segundos**.
- Aulas médias (1h): cerca de **40 segundos**.
- Aulas longas (2h+): até **1 a 2 minutos**.

## O resumo é confiável?

A IA é muito boa, mas pode errar (alucinar) em casos raros. Recomendamos sempre dar uma lida final e ajustar onde fizer sentido. Você pode editar livremente.`,
      },
      {
        slug: "editar-resumos",
        title: "Editar e enriquecer resumos",
        excerpt:
          "Personalize o resumo gerado pela IA com suas próprias anotações.",
        readTimeMin: 3,
        body: `## Editor completo

Todo resumo gerado abre num editor onde você pode:

- Mudar títulos, textos e listas.
- Adicionar suas próprias observações.
- Marcar trechos como **importante** ou **revisar depois**.
- Inserir links pra outras aulas e materiais.

## Pedir pra IA refazer um trecho

Selecione um pedaço do resumo e use a opção **"Reformular"** pra a IA reescrever de outro jeito (mais simples, mais técnico, em formato de bullet etc).

## Salvar automaticamente

O Lumio salva tudo automaticamente conforme você edita. Não precisa apertar "Salvar".`,
      },
      {
        slug: "exportar-resumos",
        title: "Exportar resumos em PDF e Markdown",
        excerpt:
          "Leve seus resumos pra qualquer lugar.",
        readTimeMin: 2,
        body: `## Formatos disponíveis

Você pode exportar qualquer resumo em:

- **PDF**: ótimo pra imprimir ou compartilhar.
- **Markdown**: pra colar no Notion, Obsidian, Bear etc.

## Como exportar

1. Abra o resumo.
2. Clique no menu **"..."** no canto superior direito.
3. Escolha **"Exportar como PDF"** ou **"Copiar como Markdown"**.

## E os flashcards / quizzes?

Flashcards e quizzes gerados a partir do resumo também podem ser exportados em PDF, em formato de cartões/perguntas e respostas.`,
      },
    ],
  },
  {
    slug: "planos",
    title: "Planos",
    description: "Recursos, limites e gerenciamento.",
    icon: "card",
    keywords: [
      "plano",
      "planos",
      "starter",
      "pro",
      "power",
      "assinatura",
      "pagamento",
      "preço",
      "preco",
      "cobrança",
      "cobranca",
      "fatura",
      "coins",
    ],
    articles: [
      {
        slug: "diferenca-planos",
        title: "Diferença entre Starter, Pro e Power",
        excerpt:
          "Veja qual plano combina mais com o seu jeito de estudar.",
        readTimeMin: 3,
        body: `## Starter (gratuito)

Perfeito pra experimentar o Lumio:

- Até **3 gravações** por mês.
- Resumo com IA básico.
- 1 matéria ativa.

## Pro

Pra quem estuda toda semana:

- Gravações **ilimitadas**.
- Resumos completos com IA avançada.
- Flashcards e quizzes ilimitados.
- Mapa mental das aulas.
- Suporte prioritário.

## Power

Pra quem vive de estudar (medicina, residência, OAB, concursos):

- Tudo do Pro.
- Modelos de IA mais potentes pra resumos mais profundos.
- Limite estendido de PDF anexado.
- Acesso antecipado a novas features.

Veja todos os preços e detalhes em [/pricing](/pricing).`,
      },
      {
        slug: "cancelar-assinatura",
        title: "Como cancelar a assinatura",
        excerpt:
          "Você pode cancelar a qualquer momento, sem multa.",
        readTimeMin: 2,
        body: `## Cancelamento em 2 cliques

1. Acesse **Conta → Assinatura**.
2. Clique em **"Cancelar assinatura"**.
3. Confirme o cancelamento.

## O que acontece depois

- Seu acesso ao plano pago continua até o **fim do período já pago** (você não perde nada).
- Após esse período, sua conta volta automaticamente pro **plano Starter** (gratuito).
- Todas as suas aulas, resumos e flashcards **continuam salvos**, sem prazo de expiração.

## Reativar

Mudou de ideia? É só voltar em **Conta → Assinatura** e clicar em **"Reativar"**.`,
      },
      {
        slug: "mudar-plano",
        title: "Mudar de plano (upgrade ou downgrade)",
        excerpt:
          "Upgrade vale na hora; downgrade vale no próximo ciclo.",
        readTimeMin: 2,
        body: `## Upgrade

Se você quer **subir de plano** (ex: Starter → Pro, Pro → Power):

1. Vá em **Conta → Assinatura**.
2. Escolha o novo plano.
3. O acesso aos recursos novos é liberado **imediatamente**.
4. A cobrança é proporcional ao tempo restante do ciclo atual.

## Downgrade

Se você quer **descer de plano**:

1. Mesmo caminho: **Conta → Assinatura**.
2. Escolha o plano menor.
3. A mudança só vale **a partir do próximo ciclo de cobrança**.
4. Você continua com os benefícios do plano atual até lá.

## Dúvidas de cobrança

Mande um e-mail pra **contato@lumioapp.net** com o número da fatura. Respondemos rápido.`,
      },
    ],
  },
  {
    slug: "solucao-problemas",
    title: "Solução de problemas",
    description: "Resolva dúvidas e problemas comuns.",
    icon: "tool",
    keywords: [
      "problema",
      "erro",
      "bug",
      "não funciona",
      "nao funciona",
      "ajuda",
      "suporte",
      "travou",
      "lento",
    ],
    articles: [
      {
        slug: "microfone-nao-funciona",
        title: "O microfone não está funcionando",
        excerpt:
          "Checklist pra destravar a gravação em poucos minutos.",
        readTimeMin: 3,
        body: `## Checklist rápido

1. **Permissão do navegador**: olhe o ícone do cadeado na barra de endereço. O microfone precisa estar como **"Permitir"**.
2. **Sistema operacional**: no Mac, vá em **Ajustes → Privacidade → Microfone** e confirme que o navegador está liberado. No Windows é em **Configurações → Privacidade → Microfone**.
3. **Outro app usando o microfone?** Feche Zoom, Meet, Teams, Discord etc. Apenas um app pode capturar o áudio por vez.
4. **Microfone correto?** Se você usa fone, confirme que ele está selecionado como entrada padrão.

## Ainda não funciona?

- Atualize o navegador pra última versão.
- Tente em **modo anônimo** pra descartar extensões.
- Reinicie o computador (sim, ainda funciona).

Se nada disso resolver, mande um print pra **contato@lumioapp.net** e ajudamos rapidão.`,
      },
      {
        slug: "perdi-a-gravacao",
        title: "Perdi minha gravação",
        excerpt:
          "Quase sempre dá pra recuperar. Veja onde procurar.",
        readTimeMin: 2,
        body: `## Antes de entrar em pânico

O Lumio salva a gravação **a cada poucos segundos** no seu dispositivo. Mesmo se o navegador fechar, geralmente conseguimos recuperar.

## Onde procurar

1. Vá no **Dashboard** e olhe a matéria onde você estava gravando.
2. A aula aparece com um marcador **"Rascunho"** se ainda não foi encerrada.
3. Clique nela pra continuar do ponto que parou.

## Se realmente sumiu

Mande pra gente:

- Seu e-mail de login.
- Data e horário aproximado da gravação.
- Nome da matéria.

Nossa equipe checa os logs e, na maioria dos casos, conseguimos restaurar.`,
      },
      {
        slug: "erro-no-checkout",
        title: "Erro no checkout / pagamento",
        excerpt:
          "Veja causas comuns e como destravar a assinatura.",
        readTimeMin: 2,
        body: `## Causas comuns

- **Cartão recusado**: confira limite, validade e CVV. Cartões corporativos às vezes bloqueiam compras internacionais.
- **3D Secure não confirmado**: alguns bancos pedem aprovação no app. Confira notificações do seu banco.
- **Antifraude do banco**: ligue pro SAC do cartão e libere a transação.

## Tente um outro método

O Lumio aceita:

- Cartão de crédito.
- PIX (instantâneo).
- Boleto (compensação em 1-2 dias úteis).

## Continua dando erro?

Manda print da tela de erro pra **contato@lumioapp.net** com seu e-mail de login. Resolvemos junto com você.`,
      },
    ],
  },
];

export function findCategory(slug: string): HelpCategory | undefined {
  return helpCategories.find((cat) => cat.slug === slug);
}

export function findArticle(
  categorySlug: string,
  articleSlug: string,
): { category: HelpCategory; article: HelpArticle } | undefined {
  const category = findCategory(categorySlug);
  if (!category) return undefined;
  const article = category.articles.find((a) => a.slug === articleSlug);
  if (!article) return undefined;
  return { category, article };
}

export type SearchResult =
  | { kind: "category"; category: HelpCategory }
  | { kind: "article"; category: HelpCategory; article: HelpArticle };

/**
 * Filtra categorias + artigos por um termo de busca.
 * Match em título, descrição, excerpt, body (artigo) ou keywords (categoria).
 */
export function searchHelp(query: string): SearchResult[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  const results: SearchResult[] = [];

  for (const category of helpCategories) {
    const catHaystack = [
      category.title,
      category.description,
      ...category.keywords,
    ]
      .join(" ")
      .toLowerCase();
    if (catHaystack.includes(q)) {
      results.push({ kind: "category", category });
    }
    for (const article of category.articles) {
      const artHaystack = [article.title, article.excerpt, article.body]
        .join(" ")
        .toLowerCase();
      if (artHaystack.includes(q)) {
        results.push({ kind: "article", category, article });
      }
    }
  }

  return results;
}

/**
 * Renderizador de markdown bem simples, pensado pra body dos artigos.
 * Suporta:
 *  - "## Título" -> h2
 *  - "- item"    -> lista
 *  - "**negrito**", "*itálico*", "`código`" inline
 *  - "[texto](url)" -> link
 *  - parágrafos separados por linha em branco
 */
export function renderHelpMarkdown(body: string): string {
  const escape = (s: string) =>
    s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");

  const inline = (s: string) =>
    escape(s)
      .replace(
        /\[([^\]]+)\]\(([^)]+)\)/g,
        '<a href="$2" class="text-primary hover:underline" target="_blank" rel="noopener noreferrer">$1</a>',
      )
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/(^|[^*])\*([^*]+)\*(?!\*)/g, "$1<em>$2</em>")
      .replace(
        /`([^`]+)`/g,
        '<code class="rounded bg-muted px-1 py-0.5 text-[0.85em]">$1</code>',
      );

  const blocks = body.split(/\n\s*\n/);
  const html: string[] = [];

  for (const block of blocks) {
    const lines = block.split("\n").map((l) => l.trimEnd());
    if (lines.length === 0) continue;

    if (lines[0].startsWith("## ")) {
      html.push(
        `<h2 class="mt-8 text-xl font-semibold tracking-tight">${inline(lines[0].slice(3))}</h2>`,
      );
      const rest = lines.slice(1).join("\n").trim();
      if (rest) html.push(...renderInnerBlock(rest, inline));
      continue;
    }

    html.push(...renderInnerBlock(block, inline));
  }

  return html.join("\n");
}

function renderInnerBlock(
  block: string,
  inline: (s: string) => string,
): string[] {
  const out: string[] = [];
  const lines = block.split("\n");

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (/^\s*-\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*-\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*-\s+/, ""));
        i += 1;
      }
      out.push(
        `<ul class="mt-3 list-disc space-y-1.5 pl-6 text-sm leading-relaxed text-muted-foreground marker:text-primary/60">${items
          .map((it) => `<li>${inline(it)}</li>`)
          .join("")}</ul>`,
      );
      continue;
    }
    if (/^\s*\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*\d+\.\s+/, ""));
        i += 1;
      }
      out.push(
        `<ol class="mt-3 list-decimal space-y-1.5 pl-6 text-sm leading-relaxed text-muted-foreground marker:text-primary/60">${items
          .map((it) => `<li>${inline(it)}</li>`)
          .join("")}</ol>`,
      );
      continue;
    }

    // parágrafo: agrupa linhas consecutivas que não sejam lista nem heading
    const paragraph: string[] = [];
    while (
      i < lines.length &&
      !/^\s*-\s+/.test(lines[i]) &&
      !/^\s*\d+\.\s+/.test(lines[i]) &&
      !lines[i].startsWith("## ")
    ) {
      paragraph.push(lines[i]);
      i += 1;
    }
    const text = paragraph.join(" ").trim();
    if (text) {
      out.push(
        `<p class="mt-3 text-sm leading-relaxed text-muted-foreground">${inline(text)}</p>`,
      );
    }
  }

  return out;
}
