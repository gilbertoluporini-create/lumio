import type { Metadata } from "next";
import {
  PersonaLanding,
  personaJsonLd,
} from "@/components/landing/persona-landing";

const URL_BASE = process.env.NEXT_PUBLIC_APP_URL ?? "https://lumioapp.net";
const CANONICAL = `${URL_BASE}/para-engenharia`;

const TITLE = "Engenharia no Lumio · Resumo, flashcards e quiz com IA";
const DESCRIPTION =
  "Transcreva aulas de cálculo, física, termodinâmica e resistência. Lumio gera resumo, flashcards e quiz por matéria. 50 coins grátis, sem cartão.";

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

export default function ParaEngenhariaPage() {
  const jsonLd = personaJsonLd({
    name: "Lumio para estudantes de Engenharia",
    description: DESCRIPTION,
    url: CANONICAL,
    courseName: "Engenharia",
  });

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <PersonaLanding
        slug="para-engenharia"
        courseName="Engenharia"
        courseLabel="Engenharia"
        heroTitle="Da dedução do quadro à lista de exercício — sem perder uma derivação."
        heroSub="Lumio transcreve sua aula em tempo real e transforma em resumo, flashcards e quiz — com fórmula, dedução e contexto de aplicação preservados."
        pains={[
          "Aulas com muita dedução no quadro: blink and you'll miss it. Copiar e entender ao mesmo tempo é difícil.",
          "Listas de exercício pesadas: precisa revisar conceito antes de resolver — e revisão genérica não cobre o que o professor enfatizou.",
          "Cadeia de pré-requisitos: cálculo, física, termodinâmica. Lacuna numa matéria trava o semestre seguinte.",
        ]}
        subjects={[
          "Cálculo I, II e III",
          "Física I, II e III",
          "Termodinâmica",
          "Resistência dos materiais",
          "Mecânica dos fluidos",
          "Eletromagnetismo",
          "Álgebra linear",
          "Equações diferenciais",
        ]}
        solutionLead="Resumos que preservam dedução, condição de contorno e unidade — não viram texto vago."
        demoTitle="Sua aula de termodinâmica, em 4 formatos."
        demoExample={{
          inputLabel: "Aula de 2h sobre primeira e segunda lei da termodinâmica",
          inputText:
            "Professor deduz a primeira lei (ΔU = Q − W), discute processos isobáricos e isotérmicos, introduz entropia e a segunda lei, e resolve um ciclo de Carnot no quadro.",
          outputs: [
            {
              title: "Resumo estruturado",
              body: "Dedução da primeira lei passo a passo, tabela de processos termodinâmicos com fórmula de trabalho e calor, e roteiro do ciclo de Carnot com rendimento.",
            },
            {
              title: "Flashcards de revisão",
              body: "Cards de fórmula (ΔU, ΔS, W, Q), definição de processo (adiabático, isobárico, isocórico) e enunciados das leis com unidade no SI.",
            },
            {
              title: "Quiz de fixação",
              body: "Cálculo do rendimento de Carnot dado Tquente e Tfria, variação de entropia num gás ideal e identificação do processo a partir do diagrama PV.",
            },
            {
              title: "Mapa mental",
              body: "Ramificação das leis da termodinâmica em processos, ciclos térmicos e aplicações de engenharia (motor, refrigerador, bomba de calor).",
            },
          ],
        }}
        faqs={[
          {
            q: "A IA preserva fórmula matemática e dedução do professor?",
            a: "Sim. A IA captura fórmulas mencionadas em aula e as estrutura no resumo. Pra equações que dependem de notação visual no quadro, você pode anexar foto ou PDF da apostila pra reforçar contexto.",
          },
          {
            q: "Funciona pra civil, mecânica, elétrica, química, produção?",
            a: "Funciona pra qualquer ênfase. As matérias básicas (cálculo, física, química) são iguais; nas específicas (resistência, circuitos, processos químicos) o material gerado segue o conteúdo da sua aula, não um genérico.",
          },
          {
            q: "Posso anexar lista de exercício e pedir resolução comentada?",
            a: "Sim. Anexa PDF da lista e o chat do Lumio resolve passo a passo usando o contexto da matéria. Útil pra entender onde travou na própria lógica do problema.",
          },
          {
            q: "Serve pra revisar pra prova de ENADE ou processo seletivo de pós?",
            a: "Lumio acelera revisão da grade. Pra ENADE ou prova de pós o conteúdo vem das suas matérias do curso — combine com material específico de banca pra simulado.",
          },
        ]}
        closingLine="Sua próxima aula de cálculo já podia estar resumida."
      />
    </>
  );
}
