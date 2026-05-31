import type { Metadata } from "next";
import {
  PersonaLanding,
  personaJsonLd,
} from "@/components/landing/persona-landing";
import { buildPageMetadata, ogImage, SITE_URL } from "@/lib/seo";

const PATH = "/para-medicina";
const CANONICAL = `${SITE_URL}${PATH}`;

const TITLE = "Lumio para Medicina · Ciclo básico e clínico, com método ativo";
const DESCRIPTION =
  "Pra estudante de medicina do 1º ao 4º ano. Sua aula vira resumo, flashcards, quiz e mapa em minutos — com SEU material e o vocabulário do professor. 50 coins grátis.";

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
        heroTitle="Anatomia, fisio, farmaco — sem decoreba, com método ativo."
        heroSub="Pra estudante de medicina do ciclo básico ao clínico. Lumio transcreve sua aula e devolve em resumo, flashcards, quiz e mapa — com SEU material e o vocabulário que o professor usou."
        pains={[
          "Volume de conteúdo: anatomia, fisio, bioq, farmaco e semio caem juntos no semestre. Releer 4h e esquecer em 3 dias não rola mais.",
          "Releitura passiva não fixa: 70% esquecido em 24h (curva de Ebbinghaus). Mas testar memória ativa é desconfortável — e por isso ninguém faz.",
          "Material genérico de prova não serve pra entender: você precisa do vocabulário do SEU professor, do mecanismo do SEU caso clínico, da matéria que cai no SEU semestre.",
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
            q: "Lumio é pra ciclo básico, clínico ou pra residência?",
            a: "Lumio é pra ciclo básico e clínico — quem ainda tem aula presencial, grava, anota e quer fixar a matéria do semestre com método ativo. Pra prova de residência o ideal é combinar com material de banca (Sanar, Medway, Estratégia). Não competimos com isso — somos a camada de ANTES.",
          },
          {
            q: "Funciona com matérias específicas do ciclo básico (anatomia, histologia, bioq)?",
            a: "Sim. O reconhecimento PT-BR nativo lida bem com termo de latim, nome de estrutura, nome de via metabólica. O resumo gerado preserva o vocabulário técnico e o foco que o professor deu — não vira texto raso.",
          },
          {
            q: "E no ciclo clínico (semio, clínica médica, farmaco)?",
            a: "Funciona. Você anexa PDF da diretriz, do artigo, do slide do professor — e o chat responde cruzando aula + documento. Útil pra fixar mecanismo de fármaco, raciocínio diagnóstico e protocolo de conduta sem ter que abrir 5 abas.",
          },
          {
            q: "Posso anexar PDF de artigo ou diretriz e perguntar pra IA?",
            a: "Sim. Você anexa PDFs (artigos, diretrizes, slides do professor) e o chat do Lumio responde com contexto desses documentos — útil pra cruzar aula com Sanford, Harrison ou diretriz da SBC.",
          },
          {
            q: "Por que não tem banco de questões de prova pronto?",
            a: "Porque Lumio gera quiz e flashcards do SEU material de aula — não vende simulado pré-pronto. Quem quer banco de questão tradicional encontra em outras plataformas. Aqui o método é: você grava, IA processa, você revisa ativo. É outro jeito de estudar.",
          },
        ]}
        closingLine="Sua próxima aula de anatomia, fisio ou farmaco já podia estar virando método."
      />
    </>
  );
}
