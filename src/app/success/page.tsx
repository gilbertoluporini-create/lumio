import Link from "next/link";
import { Button } from "@/components/ui/button";
import { LumioWordmark } from "@/components/brand/logo";
import { LumiCharacter } from "@/components/brand/lumi";
import { PurchaseTracker } from "./purchase-tracker";

export const metadata = {
  title: "Lumio — Pagamento confirmado",
};

type SearchParams = Promise<{
  session_id?: string;
  plan?: string;
  value?: string;
}>;

export default async function SuccessPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const sp = await searchParams;
  const value = sp.value ? Number(sp.value) : undefined;
  return (
    <div className="relative min-h-screen flex flex-col">
      <PurchaseTracker sessionId={sp.session_id} plan={sp.plan} valueBrl={value} />
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
