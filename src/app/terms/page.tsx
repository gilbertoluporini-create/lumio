import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { LumioWordmark } from "@/components/brand/logo";
import { buildPageMetadata } from "@/lib/seo";

export const metadata: Metadata = buildPageMetadata({
  title: "Termos de Uso · Lumio",
  description:
    "Termos e condições de uso do Lumio: regras de assinatura, conteúdo gerado por IA e responsabilidades.",
  path: "/terms",
});

export default function TermsPage() {
  return (
    <div className="relative min-h-screen flex flex-col">
      <div className="pointer-events-none fixed inset-0 grid-bg opacity-30" />

      <header className="relative z-10 border-b border-border/40 backdrop-blur bg-background/70">
        <div className="mx-auto max-w-3xl px-6 py-4 flex items-center justify-between">
          <Link href="/">
            <LumioWordmark />
          </Link>
          <Link
            href="/"
            className="text-xs text-muted-foreground hover:text-foreground transition-colors inline-flex items-center gap-1"
          >
            <ArrowLeft className="h-3 w-3" /> Voltar
          </Link>
        </div>
      </header>

      <main className="relative z-10 flex-1 mx-auto max-w-3xl px-6 py-12">
        <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground font-medium mb-3">
          — Termos de Uso —
        </p>
        <h1 className="text-3xl md:text-4xl heading-display mb-2">
          Termos de Uso do Lumio
        </h1>
        <p className="text-sm text-muted-foreground mb-10">
          Última atualização: 23 de maio de 2026.
        </p>

        <div className="prose prose-neutral dark:prose-invert max-w-none prose-headings:font-semibold prose-headings:tracking-tight prose-h2:text-xl prose-h2:mt-10 prose-h2:mb-3 prose-p:text-foreground/85 prose-p:leading-relaxed prose-li:text-foreground/85 prose-li:my-1">
          <section>
            <p>
              Bem-vindo ao <strong>Lumio</strong>. Ao criar uma conta ou usar
              nosso serviço, você concorda com estes Termos. Se não concordar,
              não use o Lumio.
            </p>
          </section>

          <h2>1. Quem somos</h2>
          <p>
            O Lumio é uma plataforma de transcrição de aulas universitárias com
            assistente de IA, oferecida em modelo SaaS para estudantes. O
            serviço está em fase beta privado e em desenvolvimento contínuo.
          </p>

          <h2>2. Conta e idade mínima</h2>
          <ul>
            <li>
              Pra usar o Lumio você precisa ter <strong>16 anos ou mais</strong>
              . Menores de 18 precisam de autorização do responsável legal.
            </li>
            <li>
              Você é responsável por manter sua conta segura. Não compartilhe
              senhas e nos avise imediatamente se suspeitar de acesso não
              autorizado.
            </li>
            <li>
              Uma pessoa pode ter apenas uma conta gratuita. Contas duplicadas
              criadas pra burlar limites do plano grátis podem ser suspensas.
            </li>
          </ul>

          <h2>3. Uso permitido</h2>
          <p>Você pode usar o Lumio pra:</p>
          <ul>
            <li>Transcrever aulas das quais você participa legitimamente.</li>
            <li>
              Anexar slides e materiais didáticos que você tem direito de usar.
            </li>
            <li>Gerar resumos, flash cards, quizzes e mapas mentais.</li>
            <li>Compartilhar seus próprios assets gerados com colegas.</li>
          </ul>

          <h2>4. Uso proibido</h2>
          <p>
            Você concorda em <strong>não</strong>:
          </p>
          <ul>
            <li>
              Gravar pessoas sem consentimento quando isso violar a legislação
              local da sua instituição ou do local da gravação.
            </li>
            <li>
              Subir conteúdo protegido por direitos autorais sem autorização.
            </li>
            <li>
              Usar o serviço pra atividades ilegais, fraudulentas, ameaçadoras
              ou que violem direitos de terceiros.
            </li>
            <li>
              Tentar burlar gates de coins, limites de aulas/mês ou outros
              mecanismos de cobrança.
            </li>
            <li>
              Fazer engenharia reversa, scrape massivo, ou usar o serviço pra
              treinar modelos concorrentes.
            </li>
            <li>
              Compartilhar credenciais com terceiros pra contornar limites de
              plano.
            </li>
          </ul>

          <h2>5. Lumi Coins</h2>
          <ul>
            <li>
              Lumi Coins são <strong>créditos internos</strong>, não constituem
              moeda corrente nem têm valor monetário fora da plataforma.
            </li>
            <li>
              Coins são consumidos ao gerar produtos da aula (resumo, flash
              cards, quiz, mapa mental). Chat IA, transcrição e anexo de slides
              não consomem coins.
            </li>
            <li>
              Coins acumulam por até <strong>90 dias</strong>. Após esse prazo o
              saldo é zerado quando da renovação do plano.
            </li>
            <li>
              Em caso de falha técnica do nosso lado durante a geração de um
              produto, o valor é reembolsado automaticamente em coins.
            </li>
            <li>
              Coins não são restituíveis em dinheiro, salvo nas hipóteses
              previstas no Código de Defesa do Consumidor.
            </li>
          </ul>

          <h2>6. Assinaturas e pagamentos</h2>
          <ul>
            <li>
              As assinaturas (Starter, Pro, Power) são <strong>mensais</strong>
              com renovação automática. Você pode cancelar a qualquer momento e
              continuará com acesso até o fim do período já pago.
            </li>
            <li>
              Pagamentos são processados pela <strong>Stripe</strong>. O Lumio
              não armazena dados de cartão.
            </li>
            <li>
              Reembolso integral em até <strong>7 dias</strong> da contratação,
              conforme art. 49 do CDC (arrependimento em compras à distância).
            </li>
            <li>
              Cobranças recorrentes serão feitas no mesmo dia do mês de cada
              ciclo de cobrança.
            </li>
          </ul>

          <h2>7. Conteúdo do usuário</h2>
          <ul>
            <li>
              Suas transcrições, slides e produtos gerados são{" "}
              <strong>seus</strong>. O Lumio não reivindica propriedade sobre
              esse conteúdo.
            </li>
            <li>
              Você concede ao Lumio uma licença não-exclusiva, temporária e
              limitada pra processar esse conteúdo exclusivamente pra entregar o
              serviço (transcrição, geração de produtos, sincronização entre
              dispositivos).
            </li>
            <li>
              Você pode exportar e excluir seu conteúdo a qualquer momento nas
              configurações da conta.
            </li>
          </ul>

          <h2>8. Inteligência artificial — disclaimer</h2>
          <ul>
            <li>
              O Lumio usa modelos de IA (Claude da Anthropic) pra gerar
              transcrições, resumos e outros produtos. <strong>IA pode errar</strong>.
            </li>
            <li>
              Não confie cegamente nas respostas. Sempre confira informações
              críticas (especialmente em medicina, direito, engenharia) nas
              fontes originais antes de tomar decisões.
            </li>
            <li>
              O Lumio não substitui o estudo direto do material original ou a
              orientação do professor.
            </li>
          </ul>

          <h2>9. Propriedade intelectual do Lumio</h2>
          <p>
            O nome &ldquo;Lumio&rdquo;, o mascote Lumi, os ícones, o design e
            todo código fonte são propriedade exclusiva dos operadores do
            serviço. É proibido copiar, distribuir ou criar obras derivadas sem
            autorização por escrito.
          </p>

          <h2>10. Limitação de responsabilidade</h2>
          <p>
            O Lumio é oferecido &ldquo;como está&rdquo;. Não nos
            responsabilizamos por:
          </p>
          <ul>
            <li>Notas, aprovação ou reprovação em provas e cursos.</li>
            <li>
              Falhas momentâneas do serviço, do reconhecimento de voz do
              navegador, ou da API de IA.
            </li>
            <li>Perda de dados causada por ações do usuário ou de terceiros.</li>
            <li>
              Uso indevido por parte de outros usuários (consulte a Política de
              Privacidade).
            </li>
          </ul>
          <p>
            Em hipótese alguma a responsabilidade total do Lumio excederá o
            valor pago por você nos 12 meses anteriores ao evento que motivou a
            reclamação.
          </p>

          <h2>11. Encerramento</h2>
          <ul>
            <li>
              Você pode encerrar sua conta a qualquer momento nas
              configurações.
            </li>
            <li>
              O Lumio pode suspender ou encerrar contas que violem estes Termos,
              com aviso prévio quando possível.
            </li>
            <li>
              Após o encerramento, seus dados são excluídos em até{" "}
              <strong>30 dias</strong>, salvo obrigação legal de retenção.
            </li>
          </ul>

          <h2>12. Mudanças nestes Termos</h2>
          <p>
            Podemos atualizar estes Termos. Mudanças relevantes serão
            comunicadas por email ou no app, com pelo menos 15 dias de
            antecedência. Continuar usando o Lumio após mudanças constitui
            aceite.
          </p>

          <h2>13. Foro e lei aplicável</h2>
          <p>
            Estes Termos são regidos pelas leis da República Federativa do
            Brasil. Fica eleito o foro da comarca de domicílio do consumidor pra
            dirimir qualquer controvérsia, conforme art. 101 do CDC.
          </p>

          <h2>14. Contato</h2>
          <p>
            Dúvidas sobre estes Termos? Manda email pra{" "}
            <a
              href="mailto:contato@lumioapp.net"
              className="text-primary hover:underline"
            >
              contato@lumioapp.net
            </a>
            .
          </p>
        </div>

        <div className="mt-12 pt-8 border-t border-border/40 text-xs text-muted-foreground">
          Veja também:{" "}
          <Link href="/privacy" className="text-primary hover:underline">
            Política de Privacidade
          </Link>
        </div>
      </main>

      <footer className="relative z-10 border-t border-border/40 py-4 text-center text-xs text-muted-foreground">
        © {new Date().getFullYear()} Lumio
      </footer>
    </div>
  );
}
