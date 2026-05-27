/**
 * Lista oficial dos 9 posts IG warmup do Lumio.
 *
 * Origem: `docs/marketing/CAPTIONS_LAUNCH.md` (fonte humana editorial).
 * Aqui ficam serializados pra consumo programático (publicação via Graph API
 * + UI do painel /admin/marketing/crescimento).
 *
 * Manter sincronizado: se editar uma caption aqui, atualizar lá tb (e vice-versa).
 * No futuro, podemos automatizar parsing do MD — por ora, mantém em sync manual
 * porque são só 9 posts e isso muda raramente.
 */

export type IgPost = {
  id: string;
  filename: string;
  /** Ordem editorial (1-9, post 08 descartado) */
  order: number;
  /** Etiqueta tipográfica curta */
  type: string;
  /** Dia ideal de publicação na sequência warmup */
  dia: string;
  /** Hora ideal (HH:MM em São Paulo) */
  hora: string;
  caption: string;
};

export const IG_POSTS: IgPost[] = [
  {
    id: "01",
    filename: "01-lancamento.jpg",
    order: 1,
    type: "Lançamento soft",
    dia: "Seg",
    hora: "12:00",
    caption: `Existe um jeito mais inteligente de estudar.

Você grava a aula. O Lumi entende.

Em minutos, sua aula vira:
↳ transcrição completa
↳ resumo direto ao ponto
↳ flashcards pra fixar
↳ quiz pra testar

Tudo organizado por matéria, num só lugar.

Feito em pt-BR, pra realidade da faculdade brasileira.

→ 50 coins grátis pra começar. Link na bio.

#estudante #universidade #faculdade #estudoonline #produtividadenosestudos #ensinosuperior #lumio #lumioapp #transcricaodeaula #estudocomia`,
  },
  {
    id: "04",
    filename: "04-motivacao.jpg",
    order: 2,
    type: "Gancho emocional",
    dia: "Ter",
    hora: "19:00",
    caption: `Você não precisa estudar mais.
Você precisa estudar melhor.

A diferença entre quem passa fácil e quem sofre na semana de prova nunca foi quantidade.

Foi sempre método.

— time Lumio

→ Salva esse post pra lembrar antes da próxima prova.

#estudante #metodoestudo #faculdade #motivacaoestudos #ensinosuperior #produtividade #lumio #estudoeficiente #aprendizado #vidauniversitaria`,
  },
  {
    id: "07",
    filename: "07-tudo-num-lugar.jpg",
    order: 3,
    type: "Proposta de valor",
    dia: "Qua",
    hora: "12:00",
    caption: `De UMA aula gravada, 4 formas de revisar:

📄 Resumo — pra ler antes da prova
🎴 Flashcards — pra fixar com repetição espaçada
❓ Quiz — pra testar o que você lembra
🧠 Mapa mental — pra ver as conexões

Você escolhe o método. O Lumi monta tudo a partir da sua aula.

Sem você anotar nada.

→ Link na bio pra testar.

#flashcards #resumosdeaula #mapamental #quizz #revisaoespacada #activerecall #estudoeficiente #faculdade #lumio #lumioapp`,
  },
  {
    id: "06",
    filename: "06-transcricao.jpg",
    order: 4,
    type: "Feature destaque",
    dia: "Qui",
    hora: "19:00",
    caption: `Pergunta nasceu no meio da aula?

O Lumi tá ouvindo. Você pergunta, ele responde — com base no que o professor acabou de dizer.

Tipo um colega que prestou MUITA atenção na aula e nunca esquece.

Sem precisar parar de ouvir o professor pra pesquisar.

→ Experimenta na próxima aula. Link na bio.

#aulaonline #faculdade #estudante #estudocomia #transcricaodeaula #anotacoesdeaula #universidade #lumio #lumioapp #estudo`,
  },
  {
    id: "02",
    filename: "02-dica-estudo.jpg",
    order: 5,
    type: "Educacional",
    dia: "Sex",
    hora: "19:00",
    caption: `3 técnicas que mudam como você estuda:

1. Revisão Espaçada → revisa em intervalos crescentes (1d, 3d, 7d) ao invés de tudo de uma vez. Retenção sobe de 20% pra 80%.

2. Active Recall → tentar lembrar sem olhar a fonte. Quiz dói, mas é o que fixa de verdade.

3. Pomodoro → 25min foco total + 5min pausa. Cérebro não aguenta 3h direto.

O Lumi automatiza 1 e 2 a partir da sua aula. O 3 é só você apertar o timer.

→ Salva pra usar na próxima prova.

#revisaoespacada #activerecall #pomodoro #tecnicasdeestudo #estudoeficiente #aprendizado #faculdade #produtividade #lumio #estudante`,
  },
  {
    id: "03",
    filename: "03-recurso.jpg",
    order: 6,
    type: "Feature áudio",
    dia: "Sáb",
    hora: "11:00",
    caption: `Qualquer áudio vira resumo.

→ Áudio da aula
→ Reunião do TCC
→ Podcast da matéria
→ Palestra que você gravou

Manda pro Lumi. Ele entrega resumo + tópicos + você pode fazer flashcards e quiz em cima.

Pt-BR nativo. Reconhece sotaque, termos técnicos, abreviação.

→ Link na bio.

#audioparatexto #transcricao #estudoonline #faculdade #produtividade #estudante #ferramentadeestudo #lumio #lumioapp #ia`,
  },
  {
    id: "05",
    filename: "05-planner.jpg",
    order: 7,
    type: "Feature planner",
    dia: "Seg",
    hora: "12:00",
    caption: `Sua semana de estudo, organizada pelo Lumi.

Você diz o que precisa aprender. Ele monta o plano:

📚 Seg — matéria mais densa, cabeça fresca
🗓 Ter — revisão da segunda
🧪 Qua — matéria nova
📝 Qui — exercícios
✅ Sex — revisão geral

Sem planilha. Sem app de planner extra. Tudo no mesmo lugar onde você tem as aulas.

→ Link na bio.

#cronogramadeestudos #planejamentoestudos #organizacao #estudante #faculdade #produtividade #planneerdigital #lumio #estudoonline #vidauniversitaria`,
  },
  {
    id: "10",
    filename: "10-anexe-pdf.jpg",
    order: 8,
    type: "Feature conexão",
    dia: "Ter",
    hora: "19:00",
    caption: `Anexa a apostila no Lumi. Ele liga sozinho com a aula.

PDF + áudio da aula = um material só, organizado por matéria.

→ Lê a aula com o capítulo certo da apostila ao lado
→ Faz quiz com pergunta do livro + resposta que o professor falou
→ Resumo cruza as duas fontes

Acabou de copiar trecho de PDF e procurar a parte certa da aula gravada.

→ Testa: link na bio.

#apostiladigital #pdfdeaula #estudante #faculdade #materialdeestudo #organizacao #lumio #lumioapp #estudoeficiente #universidade`,
  },
  {
    id: "09",
    filename: "09-coins.jpg",
    order: 9,
    type: "CTA conversão",
    dia: "Qua",
    hora: "12:00",
    caption: `50 coins de graça, só pra você começar.

Sem cartão. Sem assinatura forçada. Só testar mesmo.

Os 50 coins dão pra:
↳ transcrever uma aula completa
↳ gerar resumo + 10 flashcards
↳ fazer 1 quiz de revisão

Suficiente pra você ver se faz diferença na sua próxima prova.

→ Link na bio. Começa em pt-BR.

#estudantegratis #experimentar #faculdade #estudante #produtividade #lumio #lumioapp #50coinsgratis #ferramentadeestudo #vidauniversitaria`,
  },
];

export function getPostById(id: string): IgPost | undefined {
  return IG_POSTS.find((p) => p.id === id);
}
