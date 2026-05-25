import Link from "next/link";
import { Button } from "@/components/ui/button";
import { LumioWordmark } from "@/components/brand/logo";
import { LumiCharacter } from "@/components/brand/lumi";
import { getStripe, isStripeConfigured } from "@/lib/stripe";
import { PurchaseTracker } from "./purchase-tracker";

export const metadata = {
  title: "Lumio — Pagamento confirmado",
};

type SearchParams = Promise<{
  session_id?: string;
  plan?: string;
  value?: string;
}>;

/**
 * Fallback server-side: se o success_url veio sem plan/value (ex. redirect
 * manual, link antigo, share), resolve via Stripe API com session_id. Garante
 * que PurchaseTracker sempre dispara Analytics.purchase com dados reais.
 */
async function resolveCheckoutDetails(
  sessionId: string | undefined,
  plan: string | undefined,
  value: number | undefined,
): Promise<{ plan: string; value: number }> {
  if (plan && typeof value === "number" && value > 0) {
    return { plan, value };
  }
  if (!sessionId || !isStripeConfigured()) {
    return { plan: plan ?? "unknown", value: value ?? 0 };
  }
  try {
    const stripe = getStripe();
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    const resolvedPlan =
      plan ??
      session.metadata?.plan ??
      (typeof session.subscription === "object" && session.subscription
        ? session.subscription.metadata?.plan
        : undefined) ??
      "unknown";
    const resolvedValue =
      typeof value === "number" && value > 0
        ? value
        : typeof session.amount_total === "number"
          ? session.amount_total / 100
          : 0;
    return { plan: resolvedPlan, value: resolvedValue };
  } catch {
    return { plan: plan ?? "unknown", value: value ?? 0 };
  }
}

export default async function SuccessPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const sp = await searchParams;
  const valueParam = sp.value ? Number(sp.value) : undefined;
  const resolved = await resolveCheckoutDetails(
    sp.session_id,
    sp.plan,
    valueParam,
  );
  return (
    <div className="relative min-h-screen flex flex-col">
      <PurchaseTracker
        sessionId={sp.session_id}
        plan={resolved.plan}
        valueBrl={resolved.value}
      />
      <div className="pointer-events-none fixed inset-0 grid-bg opacity-40" />
      <header className="relative z-10">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-5">
          <Link href="/" className="flex items-center">
            <LumioWordmark />
          </Link>
        </div>
      </header>
      <main className="relative z-10 flex-1 flex items-center justify-center px-6">
        <div className="text-center max-w-lg">
          <div className="flex justify-center mb-4">
            <LumiCharacter mood="celebrating" size="xl" float />
          </div>
          <h1 className="text-3xl md:text-4xl font-semibold tracking-tight">
            Pagamento <span className="font-serif italic">confirmado</span>.
          </h1>
          <p className="mt-4 text-muted-foreground leading-relaxed">
            Sua assinatura tá ativa e seus Lumi Coins já foram creditados. Em instantes você recebe o recibo por email — já pode entrar e usar tudo.
          </p>
          <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
            <Button asChild variant="gradient" size="lg" className="min-w-[200px]">
              <Link href="/dashboard">Abrir dashboard</Link>
            </Button>
            <Button asChild variant="ghost" size="lg">
              <Link href="/">Voltar pro site</Link>
            </Button>
          </div>
        </div>
      </main>
    </div>
  );
}
