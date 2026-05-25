import type { Metadata } from "next";
import {
  PersonaLanding,
  personaJsonLd,
} from "@/components/landing/persona-landing";

const URL_BASE = process.env.NEXT_PUBLIC_APP_URL ?? "https://lumioapp.net";
const CANONICAL = `${URL_BASE}/para-administracao`;

const TITLE = "Administração no Lumio · Resumo e flashcards com IA";
const DESCRIPTION =
  "Transcreva aulas de finanças, marketing, macroeconomia e gestão. O Lumio gera resumo, flashcards e quiz por matéria. 50 coins grátis.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: CANONICAL },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: CANONICAL,
    type: "website",
    locale: "pt_BR",
    siteName: "Lumio",
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
  },
};

export default function ParaAdministracaoPage() {
  const jsonLd = personaJsonLd({
    name: "Lumio para estudantes de Administração",
    description: DESCRIPTION,
    url: CANONICAL,
    courseName: "Administração",
  });

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <PersonaLanding
        slug="para-administracao"
        courseName="Administração"
        courseLabel="Administração"
        heroTitle="Da aula de macroeconomia ao caso de marketing — tudo virando material de estudo."
        heroSub="Lumio transcreve sua aula em tempo real e transforma em resumo, flashcards e quiz — com a estrutura de framework, modelo e métrica preservada."
        pains={[
          "Matérias muito diferentes na mesma semana: contabilidade, estatística, marketing, recursos humanos. Cada uma com sua linguagem.",
          "Aulas de case discussion: muito debate, muita ideia solta. Difícil capturar o framework no meio da discussão.",
          "Estágio em paralelo: tempo de estudo é o que sobra entre reunião e entrega — material precisa ser direto ao ponto.",
        ]}
        subjects={[
          "Macroeconomia",
          "Microeconomia",
          "Contabilidade gerencial",
          "Finanças corporativas",
          "Marketing estratégico",
          "Gestão de pessoas",
          "Estatística aplicada",
          "Estratégia empresarial",
        ]}
        solutionLead="Resumos que preservam framework, fórmula e métrica — não viram bullet point genérico."
        demoTitle="Sua aula de finanças, em 4 formatos."
        demoExample={{
          inputLabel: "Aula de 2h sobre estrutura de capital e WACC",
          inputText:
            "Professor cobre Modigliani-Miller, custo médio ponderado de capital (WACC), trade-off entre dívida e equity, efeito do imposto e exemplo de cálculo numa empresa de varejo.",
          outputs: [
            {
              title: "Resumo estruturado",
              body: "Fórmula do WACC desmembrada, premissas de Modigliani-Miller com e sem imposto, e tabela de trade-off entre dívida e equity por estágio da empresa.",
            },
            {
              title: "Flashcards de revisão",
              body: "Cards de fórmula (WACC, CAPM, beta alavancado), definição de termo (debt-to-equity, kd, ke) e diferença entre custo contábil e custo econômico.",
            },
            {
              title: "Quiz de fixação",
              body: "Cálculo de WACC dado kd, ke e estrutura D/E; impacto do imposto na escolha de financiamento; e questão conceitual sobre a proposição I de MM.",
            },
            {
              title: "Mapa mental",
              body: "Visão da decisão de financiamento ramificada em fontes (dívida vs equity), custos associados e indicadores de avaliação (WACC, ROE, ROIC).",
            },
          ],
        }}
        faqs={[
          {
            q: "Funciona pra matérias quantitativas como estatística e finanças?",
            a: "Sim. Quando o professor cita fórmula ou faz cálculo no quadro, a IA preserva a estrutura no resumo. Você pode anexar PDF da apostila ou planilha exemplo pra reforçar o contexto.",
          },
          {
            q: "Serve pra estudar pra entrevista de consultoria ou banco?",
            a: "Lumio acelera revisão da matéria do semestre — finanças, estratégia, marketing. Pra case interview ou prova de banco o ideal é combinar com material específico, mas a base de conceitos vem do que você já estudou em aula.",
          },
          {
            q: "Posso anexar artigo de Harvard Business Review ou case da aula?",
            a: "Sim. Anexa PDF de case, paper ou capítulo de livro e o chat do Lumio responde com contexto. Útil pra pré-aula de estratégia ou pra revisar o framework de Porter, Blue Ocean ou Kotler.",
          },
          {
            q: "Funciona pra graduação, pós e MBA?",
            a: "Funciona pra qualquer nível. Você cria a matéria, transcreve as aulas e o material gerado fica organizado — graduação, especialização ou MBA. O conteúdo vem das suas aulas, não de um banco genérico.",
          },
        ]}
        closingLine="Sua próxima aula de finanças já podia estar resumida."
      />
    </>
  );
}
