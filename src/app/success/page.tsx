import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LumioWordmark } from "@/components/brand/logo";

export const metadata = {
  title: "Lumio — Pagamento confirmado",
};

export default function SuccessPage() {
  return (
    <div className="relative min-h-screen flex flex-col">
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
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/10 ring-4 ring-emerald-500/20">
            <CheckCircle2 className="h-8 w-8 text-emerald-500" />
          </div>
          <h1 className="text-3xl md:text-4xl font-semibold tracking-tight">
            Pagamento <span className="font-serif italic">confirmado</span>.
          </h1>
          <p className="mt-4 text-muted-foreground leading-relaxed">
            Sua assinatura está ativa. Em instantes você recebe o recibo por email. Já pode entrar e usar tudo.
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
