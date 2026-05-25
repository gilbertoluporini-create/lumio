import type { Metadata } from "next";
import {
  PersonaLanding,
  personaJsonLd,
} from "@/components/landing/persona-landing";

const URL_BASE = process.env.NEXT_PUBLIC_APP_URL ?? "https://lumioapp.net";
const CANONICAL = `${URL_BASE}/para-psicologia`;

const TITLE = "Psicologia no Lumio · Resumo, flashcards e quiz com IA";
const DESCRIPTION =
  "Transcreva aulas de psicopatologia, psicanálise e neurociência. Lumio gera resumo, flashcards e quiz por matéria. 50 coins grátis, sem cartão.";

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

export default function ParaPsicologiaPage() {
  const jsonLd = personaJsonLd({
    name: "Lumio para estudantes de Psicologia",
    description: DESCRIPTION,
    url: CANONICAL,
    courseName: "Psicologia",
  });

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <PersonaLanding
        slug="para-psicologia"
        courseName="Psicologia"
        courseLabel="Psicologia"
        heroTitle="Da aula de psicopatologia ao estágio clínico — sem perder a teoria por trás."
        heroSub="Lumio transcreve sua aula em tempo real e transforma em resumo, flashcards e quiz — preservando autor, abordagem e critério diagnóstico do jeito que o professor expôs."
        pains={[
          "Abordagens teóricas concorrentes: psicanálise, cognitivo-comportamental, fenomenológica, sistêmica. Cada uma com vocabulário próprio.",
          "Volume de leitura primária: Freud, Skinner, Rogers, Beck. Aula é o filtro — perder a aula é perder o mapa da leitura.",
          "Estágio supervisionado em paralelo: tempo de leitura é curto, e teoria precisa estar acessível na hora da supervisão.",
        ]}
        subjects={[
          "Psicopatologia",
          "Psicanálise",
          "Terapia cognitivo-comportamental",
          "Neurociência",
          "Psicologia do desenvolvimento",
          "Avaliação psicológica",
          "Psicologia social",
          "Ética profissional",
        ]}
        solutionLead="Resumos que preservam autor, abordagem e critério diagnóstico — não viram texto raso."
        demoTitle="Sua aula de psicopatologia, em 4 formatos."
        demoExample={{
          inputLabel:
            "Aula de 2h sobre transtornos de ansiedade segundo DSM-5-TR",
          inputText:
            "Professor cobre TAG, transtorno de pânico e fobia social, critérios diagnósticos do DSM-5-TR, diagnóstico diferencial e abordagens terapêuticas: TCC, psicodinâmica e farmacologia adjuvante.",
          outputs: [
            {
              title: "Resumo estruturado",
              body: "Quadro comparativo dos transtornos com critério A, duração, prejuízo funcional e diagnóstico diferencial. Coluna de abordagem terapêutica preferencial.",
            },
            {
              title: "Flashcards de revisão",
              body: "Cards de critério diagnóstico (DSM-5-TR), conceito-chave (preocupação livre-flutuante, ataque de pânico, esquiva fóbica) e técnica terapêutica (exposição, reestruturação cognitiva).",
            },
            {
              title: "Quiz de fixação",
              body: "Vinheta clínica com queixa do paciente pra escolha do diagnóstico, diferenciação entre TAG e transtorno de pânico, e indicação de abordagem terapêutica.",
            },
            {
              title: "Mapa mental",
              body: "Visão dos transtornos de ansiedade ramificada por sintoma nuclear, critério temporal e principais técnicas de intervenção da TCC.",
            },
          ],
        }}
        faqs={[
          {
            q: "A IA respeita a abordagem teórica do professor ou mistura?",
            a: "Respeita o que o professor expôs. Se a aula é de orientação psicanalítica, o resumo usa o vocabulário psicanalítico. Se é TCC, segue o framework cognitivo-comportamental. Você pode anexar a bibliografia da disciplina pra reforçar.",
          },
          {
            q: "Funciona pra estudar pra prova do CFP ou pra concurso de psicólogo?",
            a: "Lumio acelera revisão das matérias do curso — psicopatologia, avaliação, ética. Pra concursos do CFP ou de psicólogo organizacional combine com material específico de banca pra simulado direcionado.",
          },
          {
            q: "Posso anexar texto de Freud, Beck ou Rogers pra discutir com a IA?",
            a: "Sim. Anexa PDF do texto primário e o chat do Lumio responde com base nele — útil pra preparar leitura antes da aula ou pra entender trecho citado pelo professor.",
          },
          {
            q: "Serve pra registrar caso de estágio?",
            a: "O Lumio é pra material de aula, não pra prontuário clínico (que tem exigência ética e técnica própria do CFP). Use pra teoria, supervisão de teoria e estudo de conceito — não pra dados de paciente.",
          },
        ]}
        closingLine="Sua próxima aula de psicopatologia já podia estar resumida."
      />
    </>
  );
}
