import type { Metadata } from "next";
import {
  PersonaLanding,
  personaJsonLd,
} from "@/components/landing/persona-landing";
import { buildPageMetadata, ogImage, SITE_URL } from "@/lib/seo";

const PATH = "/para-medicina";
const CANONICAL = `${SITE_URL}${PATH}`;

const TITLE = "Medicina no Lumio · Resumo, flashcards e quiz com IA";
const DESCRIPTION =
  "Transcreva aulas de farmacologia, anatomia e semiologia. O Lumio gera resumo, flashcards e quiz organizados por matéria. 50 coins grátis.";

export const metadata: Metadata = buildPageMetadata({
  title: TITLE,
  description: DESCRIPTION,
  path: PATH,
  ogImageType: "persona",
  ogImagePersona: "medicina",
});

export default function ParaMedicinaPage() {
  const jsonLd = personaJsonLd({
    name: "Lumio para estudantes de Medicina",
    description: DESCRIPTION,
    url: CANONICAL,
    courseName: "Medicina",
    image: ogImage({
      title: TITLE,
      subtitle: DESCRIPTION,
      type: "persona",
      persona: "medicina",
    }),
  });

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <PersonaLanding
        slug="para-medicina"
        courseName="Medicina"
        courseLabel="Medicina"
        heroTitle="Volte a olhar pro paciente da prática. A gente cuida da farmacologia."
        heroSub="Lumio transcreve sua aula em tempo real e transforma em resumo, flashcards e quiz — preservando o vocabulário clínico do jeito que o professor usou."
        pains={[
          "Carga horária pesada: ambulatório de manhã, aula à tarde, plantão à noite. Não sobra tempo pra digitar caderno.",
          "Volume de conteúdo: farmacologia clínica, anatomia, fisiopatologia e semiologia caem juntos nas provas — e em residência.",
          "Vocabulário técnico denso: mecanismo de ação, dose, interação medicamentosa. Resumo genérico não serve.",
        ]}
        subjects={[
          "Farmacologia clínica",
          "Anatomia humana",
          "Fisiologia",
          "Bioquímica médica",
          "Semiologia",
          "Patologia",
          "Microbiologia",
          "Saúde coletiva",
        ]}
        solutionLead="Resumos que preservam mecanismo, dose e interação — não viram texto raso."
        demoTitle="Sua aula de farmacologia, em 4 formatos."
        demoExample={{
          inputLabel: "Aula de 90 minutos sobre antibióticos beta-lactâmicos",
          inputText:
            "Professor cobre penicilinas, cefalosporinas e carbapenêmicos. Discute mecanismo de inibição da PBP, espectro de ação, principais resistências e casos clínicos de pneumonia e ITU.",
          outputs: [
            {
              title: "Resumo estruturado",
              body: "Tabela por classe (penicilinas, cefalosporinas, carbapenêmicos) com mecanismo, espectro, principais resistências e indicação clínica preferencial.",
            },
            {
              title: "Flashcards de revisão",
              body: "Cards com pergunta-resposta: nome comercial, dose usual, ajuste renal, eventos adversos e contraindicações. Pronto pra spaced repetition.",
            },
            {
              title: "Quiz de fixação",
              body: "Questões no estilo prova: caso clínico de pneumonia comunitária com escolha do antibiótico, mecanismo de resistência da MRSA e interação com varfarina.",
            },
            {
              title: "Mapa mental",
              body: "Visão da família beta-lactâmicos ramificada por geração de cefalosporina, com link visual entre espectro Gram-positivo e Gram-negativo.",
            },
          ],
        }}
        faqs={[
          {
            q: "Funciona com matérias do ciclo básico e do ciclo clínico?",
            a: "Sim. Lumio cobre desde bioquímica e histologia no ciclo básico até semiologia, clínica médica e cirurgia no ciclo clínico. Você organiza por disciplina e o material gerado preserva o vocabulário técnico de cada uma.",
          },
          {
            q: "Os flashcards servem pra estudar pra prova de residência?",
            a: "Os flashcards seguem o conteúdo da aula. Pra prova de residência o ideal é combinar com material específico de banca, mas o Lumio acelera a revisão da matéria do semestre, que é a base do que cai no R1.",
          },
          {
            q: "Posso anexar PDF de artigo ou diretriz e perguntar pra IA?",
            a: "Sim. Você anexa PDFs (artigos, diretrizes, slides do professor) e o chat do Lumio responde com contexto desses documentos — útil pra cruzar aula com Sanford, Harrison ou diretriz da SBC.",
          },
          {
            q: "A transcrição entende termos médicos em latim e nomes de fármacos?",
            a: "O reconhecimento usa português brasileiro nativo do navegador e funciona bem com terminologia médica. Em palavras muito raras pode haver pequeno erro, mas o resumo gerado pela IA corrige a partir do contexto da aula.",
          },
        ]}
        closingLine="Sua próxima aula de farmacologia já podia estar resumida."
      />
    </>
  );
}
