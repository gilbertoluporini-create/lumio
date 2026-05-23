import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { LumioWordmark } from "@/components/brand/logo";

export const metadata = {
  title: "Política de Privacidade · Lumio",
  description:
    "Como o Lumio coleta, usa e protege seus dados pessoais. LGPD-compliant.",
};

export default function PrivacyPage() {
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
          — Política de Privacidade —
        </p>
        <h1 className="text-3xl md:text-4xl font-semibold tracking-tight mb-2">
          Política de Privacidade
        </h1>
        <p className="text-sm text-muted-foreground mb-10">
          Última atualização: 23 de maio de 2026. Conforme a Lei Geral de
          Proteção de Dados (LGPD — Lei nº 13.709/2018).
        </p>

        <div className="prose prose-neutral dark:prose-invert max-w-none prose-headings:font-semibold prose-headings:tracking-tight prose-h2:text-xl prose-h2:mt-10 prose-h2:mb-3 prose-p:text-foreground/85 prose-p:leading-relaxed prose-li:text-foreground/85 prose-li:my-1">
          <section>
            <p>
              O Lumio leva sua privacidade a sério. Esta política explica{" "}
              <strong>quais dados</strong> coletamos, <strong>por que</strong>,
              com <strong>quem</strong> compartilhamos e quais são os{" "}
              <strong>seus direitos</strong> como titular dos dados.
            </p>
          </section>

          <h2>1. Quem é o controlador</h2>
          <p>
            O controlador dos seus dados pessoais é a equipe operadora do
            Lumio. Pra exercer seus direitos ou tirar dúvidas sobre privacidade,
            entre em contato:{" "}
            <a
              href="mailto:privacidade@lumio.fun"
              className="text-primary hover:underline"
            >
              privacidade@lumio.fun
            </a>
            .
          </p>

          <h2>2. Quais dados coletamos</h2>
          <h3 className="text-base font-medium mt-5 mb-2">
            Dados que você fornece
          </h3>
          <ul>
            <li>
              <strong>Conta:</strong> nome, email, senha (armazenada em hash).
            </li>
            <li>
              <strong>Conteúdo de aula:</strong> transcrições de áudio
              processadas pelo seu navegador, PDFs de slides que você anexa,
              mensagens do chat IA.
            </li>
            <li>
              <strong>Pagamento:</strong> dados de cartão são processados
              diretamente pela Stripe. Nós recebemos apenas confirmação de
              transação e os últimos 4 dígitos do cartão.
            </li>
            <li>
              <strong>Preferências:</strong> tema, idioma, configurações de
              notificação.
            </li>
          </ul>

          <h3 className="text-base font-medium mt-5 mb-2">
            Dados coletados automaticamente
          </h3>
          <ul>
            <li>
              <strong>Uso do serviço:</strong> número de aulas criadas,
              transcrições refinadas, produtos gerados, saldo de coins.
            </li>
            <li>
              <strong>Técnico:</strong> endereço IP (rate limit), tipo de
              navegador, sistema operacional.
            </li>
            <li>
              <strong>Cookies essenciais:</strong> sessão de autenticação,
              preferência de tema. Não usamos cookies de rastreamento de
              terceiros.
            </li>
          </ul>

          <h3 className="text-base font-medium mt-5 mb-2">
            Dados que NÃO coletamos
          </h3>
          <ul>
            <li>
              <strong>Áudio:</strong> a transcrição é feita 100% no seu
              navegador (Web Speech API). O áudio bruto{" "}
              <strong>não sai do seu dispositivo</strong>. Só o texto
              transcrito é enviado pros nossos servidores.
            </li>
            <li>
              <strong>Localização precisa.</strong>
            </li>
            <li>
              <strong>Dados de cartão completos.</strong>
            </li>
          </ul>

          <h2>3. Por que coletamos (finalidade e base legal)</h2>
          <table className="w-full text-sm my-4">
            <thead>
              <tr className="border-b border-border/60">
                <th className="text-left py-2 pr-3">Finalidade</th>
                <th className="text-left py-2">Base legal (LGPD)</th>
              </tr>
            </thead>
            <tbody className="text-foreground/85">
              <tr className="border-b border-border/30">
                <td className="py-2 pr-3">Criar e manter sua conta</td>
                <td className="py-2">Execução de contrato (art. 7, V)</td>
              </tr>
              <tr className="border-b border-border/30">
                <td className="py-2 pr-3">
                  Processar transcrições, gerar produtos
                </td>
                <td className="py-2">Execução de contrato</td>
              </tr>
              <tr className="border-b border-border/30">
                <td className="py-2 pr-3">Processar pagamentos</td>
                <td className="py-2">
                  Execução de contrato + obrigação legal (fiscal)
                </td>
              </tr>
              <tr className="border-b border-border/30">
                <td className="py-2 pr-3">Enviar emails transacionais</td>
                <td className="py-2">Execução de contrato</td>
              </tr>
              <tr className="border-b border-border/30">
                <td className="py-2 pr-3">
                  Detectar fraude e proteger o serviço
                </td>
                <td className="py-2">Legítimo interesse (art. 7, IX)</td>
              </tr>
              <tr>
                <td className="py-2 pr-3">Analytics agregado e melhorias</td>
                <td className="py-2">Legítimo interesse</td>
              </tr>
            </tbody>
          </table>

          <h2>4. Com quem compartilhamos</h2>
          <p>
            Compartilhamos dados estritamente com os{" "}
            <strong>operadores de serviço</strong> necessários pra entregar o
            Lumio:
          </p>
          <ul>
            <li>
              <strong>Anthropic (Claude API):</strong> recebe suas transcrições,
              slides e mensagens pra processar respostas de IA. Não usa seus
              dados pra treinar modelos.
              <br />
              <a
                href="https://www.anthropic.com/legal/privacy"
                target="_blank"
                rel="noopener"
                className="text-primary hover:underline text-xs"
              >
                Política da Anthropic →
              </a>
            </li>
            <li>
              <strong>Supabase:</strong> armazena seus dados de conta,
              transcrições e produtos gerados. Servidores na AWS, com
              criptografia em repouso e em trânsito.
              <br />
              <a
                href="https://supabase.com/privacy"
                target="_blank"
                rel="noopener"
                className="text-primary hover:underline text-xs"
              >
                Política do Supabase →
              </a>
            </li>
            <li>
              <strong>Stripe:</strong> processa pagamentos. Você se conecta
              diretamente a eles na hora do checkout.
              <br />
              <a
                href="https://stripe.com/br/privacy"
                target="_blank"
                rel="noopener"
                className="text-primary hover:underline text-xs"
              >
                Política da Stripe →
              </a>
            </li>
            <li>
              <strong>Resend:</strong> envia emails transacionais (recibos,
              recuperação de senha).
              <br />
              <a
                href="https://resend.com/legal/privacy-policy"
                target="_blank"
                rel="noopener"
                className="text-primary hover:underline text-xs"
              >
                Política do Resend →
              </a>
            </li>
            <li>
              <strong>Vercel:</strong> hospedagem do app. Logs operacionais e
              métricas de performance.
            </li>
          </ul>
          <p>
            <strong>Nunca vendemos seus dados</strong> pra terceiros, anunciantes
            ou data brokers.
          </p>

          <h2>5. Transferência internacional</h2>
          <p>
            Alguns provedores (Anthropic, Stripe, Supabase, Vercel) processam
            dados em servidores fora do Brasil, principalmente nos EUA e UE.
            Garantimos que esses fornecedores adotam padrões de proteção
            equivalentes à LGPD, conforme art. 33 da lei.
          </p>

          <h2>6. Por quanto tempo guardamos</h2>
          <ul>
            <li>
              <strong>Conta ativa:</strong> enquanto sua conta existir.
            </li>
            <li>
              <strong>Após exclusão da conta:</strong> dados são removidos em
              até 30 dias.
            </li>
            <li>
              <strong>Pagamentos:</strong> mantidos por até 5 anos por obrigação
              fiscal (art. 195 CTN).
            </li>
            <li>
              <strong>Logs técnicos:</strong> 90 dias.
            </li>
          </ul>

          <h2>7. Seus direitos como titular (LGPD art. 18)</h2>
          <p>Você tem direito a:</p>
          <ul>
            <li>
              <strong>Confirmação</strong> de que processamos seus dados.
            </li>
            <li>
              <strong>Acesso</strong> aos dados que temos sobre você.
            </li>
            <li>
              <strong>Correção</strong> de dados incompletos, inexatos ou
              desatualizados.
            </li>
            <li>
              <strong>Anonimização, bloqueio ou eliminação</strong> de dados
              desnecessários ou tratados em desconformidade.
            </li>
            <li>
              <strong>Portabilidade</strong> dos seus dados em formato
              estruturado.
            </li>
            <li>
              <strong>Eliminação</strong> dos dados tratados com base no seu
              consentimento.
            </li>
            <li>
              <strong>Informação</strong> sobre com quem compartilhamos.
            </li>
            <li>
              <strong>Revogar consentimento</strong> a qualquer momento.
            </li>
          </ul>
          <p>
            Pra exercer qualquer um desses direitos, escreva pra{" "}
            <a
              href="mailto:privacidade@lumio.fun"
              className="text-primary hover:underline"
            >
              privacidade@lumio.fun
            </a>
            . Respondemos em até <strong>15 dias</strong>.
          </p>

          <h2>8. Segurança</h2>
          <ul>
            <li>Senhas armazenadas em hash (bcrypt).</li>
            <li>Comunicação 100% HTTPS (TLS 1.2+).</li>
            <li>Dados em repouso criptografados (Supabase + AWS).</li>
            <li>Row Level Security ativo em todas as tabelas sensíveis.</li>
            <li>Rate limiting e proteção contra abuso.</li>
            <li>
              Em caso de incidente de segurança, notificaremos os afetados e a
              ANPD em até 72h, conforme art. 48 LGPD.
            </li>
          </ul>

          <h2>9. Crianças e adolescentes</h2>
          <p>
            O Lumio é destinado a maiores de 16 anos. Menores de 18 precisam de
            consentimento dos responsáveis. Não coletamos intencionalmente dados
            de crianças menores de 12.
          </p>

          <h2>10. Cookies</h2>
          <p>Usamos apenas cookies estritamente necessários:</p>
          <ul>
            <li>
              <strong>Sessão de autenticação</strong> (Supabase) — mantém você
              logado.
            </li>
            <li>
              <strong>Preferências</strong> (tema, sidebar) — armazenadas no
              localStorage do navegador.
            </li>
          </ul>
          <p>
            Não usamos cookies de rastreamento de terceiros, pixels do Facebook,
            ou ads.
          </p>

          <h2>11. Mudanças nesta política</h2>
          <p>
            Atualizações relevantes serão comunicadas por email com no mínimo
            15 dias de antecedência. O histórico de versões fica disponível
            mediante solicitação.
          </p>

          <h2>12. Encarregado de Dados (DPO)</h2>
          <p>
            Encarregado pelo Tratamento de Dados Pessoais:{" "}
            <a
              href="mailto:dpo@lumio.fun"
              className="text-primary hover:underline"
            >
              dpo@lumio.fun
            </a>
            .
          </p>
        </div>

        <div className="mt-12 pt-8 border-t border-border/40 text-xs text-muted-foreground">
          Veja também:{" "}
          <Link href="/terms" className="text-primary hover:underline">
            Termos de Uso
          </Link>
        </div>
      </main>

      <footer className="relative z-10 border-t border-border/40 py-4 text-center text-xs text-muted-foreground">
        © {new Date().getFullYear()} Lumio
      </footer>
    </div>
  );
}
