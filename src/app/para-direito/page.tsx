import type { Metadata } from "next";
import {
  PersonaLanding,
  personaJsonLd,
} from "@/components/landing/persona-landing";
import { buildPageMetadata, ogImage, SITE_URL } from "@/lib/seo";

const PATH = "/para-direito";
const CANONICAL = `${SITE_URL}${PATH}`;

const TITLE = "Direito no Lumio · Resumo, flashcards e quiz com IA";
const DESCRIPTION =
  "Transcreva aulas de constitucional, civil, penal e processual. O Lumio gera resumo, flashcards e quiz por matéria. 50 coins grátis, sem cartão.";

export const metadata: Metadata = buildPageMetadata({
  title: TITLE,
  description: DESCRIPTION,
  path: PATH,
  ogImageType: "persona",
  ogImagePersona: "direito",
});

export default function ParaDireitoPage() {
  const jsonLd = personaJsonLd({
    name: "Lumio para estudantes de Direito",
    description: DESCRIPTION,
    url: CANONICAL,
    courseName: "Direito",
    image: ogImage({
      title: TITLE,
      subtitle: DESCRIPTION,
      type: "persona",
      persona: "direito",
    }),
  });

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <PersonaLanding
        slug="para-direito"
        courseName="Direito"
        courseLabel="Direito"
        heroTitle="Pare de escrever caderno. Comece a entender jurisprudência."
        heroSub="Lumio transcreve a aula em tempo real e transforma em resumo, flashcards e quiz — preservando artigos, súmulas e o vocabulário técnico do professor."
        pains={[
          "Volume de leitura: doutrina, lei seca, jurisprudência e súmula. Não dá tempo de também copiar a aula no caderno.",
          "Matérias paralelas: constitucional, civil e penal rodam no mesmo semestre, cada uma com sua lógica e seu vocabulário.",
          "OAB e concurso no horizonte: cada aula é base pra prova de meses ou anos depois — esquecer não é opção.",
        ]}
        subjects={[
          "Direito constitucional",
          "Direito civil",
          "Direito penal",
          "Processo civil",
          "Processo penal",
          "Direito administrativo",
          "Direito tributário",
          "Direito do trabalho",
        ]}
        solutionLead="Resumos que preservam artigo, súmula e ratio decidendi — não viram texto vago."
        demoTitle="Sua aula de constitucional, em 4 formatos."
        demoExample={{
          inputLabel: "Aula de 2h sobre controle de constitucionalidade",
          inputText:
            "Professor cobre controle difuso vs concentrado, ADI, ADC e ADPF, efeitos da decisão, modulação temporal e julgados recentes do STF sobre amicus curiae.",
          outputs: [
            {
              title: "Resumo estruturado",
              body: "Quadro comparativo difuso vs concentrado, legitimados ativos da ADI, requisitos da ADPF e tabela de efeitos (erga omnes, vinculante, ex tunc/ex nunc).",
            },
            {
              title: "Flashcards de revisão",
              body: "Cards de artigo seco (art. 102, I, a, CF), súmulas vinculantes relevantes e principais julgados citados — formato pergunta-resposta pra repetição espaçada.",
            },
            {
              title: "Quiz de fixação",
              body: "Questões no estilo OAB e concurso: legitimados de ADI, hipóteses de modulação de efeitos e diferença entre ADI por omissão e mandado de injunção.",
            },
            {
              title: "Mapa mental",
              body: "Árvore visual do controle de constitucionalidade ramificando em difuso, concentrado, ações cabíveis e efeitos — pra revisão rápida na véspera.",
            },
          ],
        }}
        faqs={[
          {
            q: "Funciona pra preparação de OAB ou concurso público?",
            a: "Lumio resume e fixa o conteúdo das suas aulas. Pra OAB e concurso ele é ótimo como base — você acelera revisão de constitucional, civil, penal e processuais — mas combine com material específico de banca pra simulados.",
          },
          {
            q: "O resumo cita artigos e súmulas direito do CF/CC/CP?",
            a: "Sim. A IA preserva citação de artigo, inciso e súmula quando o professor menciona em aula. Você também pode anexar PDF da lei seca pra reforçar o contexto do material gerado.",
          },
          {
            q: "Posso anexar acórdão ou peça processual e perguntar pro Lumio?",
            a: "Sim. Anexa PDF de acórdão, parecer ou peça e o chat responde com base no documento — útil pra pré-aula de processual ou pra entender julgado citado pelo professor.",
          },
          {
            q: "Funciona pra direito empresarial, tributário e outras matérias específicas?",
            a: "Funciona pra qualquer disciplina. Você cria a matéria, joga as aulas dentro, e o material gerado fica organizado por disciplina — empresarial, tributário, ambiental, internacional, do trabalho.",
          },
        ]}
        closingLine="Sua próxima aula de constitucional já podia estar resumida."
      />
    </>
  );
}
