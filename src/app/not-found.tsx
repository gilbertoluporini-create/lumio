import Link from "next/link";
import { ArrowLeft, Home } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LumiCharacter } from "@/components/brand/lumi";
import { LumioWordmark } from "@/components/brand/logo";

export default function NotFound() {
  return (
    <div className="relative min-h-screen flex flex-col">
      <div className="pointer-events-none fixed inset-0 grid-bg opacity-30" />
      <div
        className="pointer-events-none fixed top-1/3 left-1/2 -translate-x-1/2 h-[500px] w-[500px] opacity-20 blur-3xl"
        style={{
          background:
            "radial-gradient(closest-side, oklch(0.65 0.22 290 / 0.35), transparent 70%)",
        }}
      />

      <header className="relative z-10 border-b border-border/40 backdrop-blur bg-background/70">
        <div className="mx-auto max-w-6xl px-6 py-4">
          <Link href="/">
            <LumioWordmark />
          </Link>
        </div>
      </header>

      <main className="relative z-10 flex-1 flex items-center justify-center px-6 py-20">
        <div className="text-center max-w-lg">
          <div className="flex justify-center mb-6">
            <LumiCharacter mood="confused" size="hero" float />
          </div>
          <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground font-medium mb-3">
            Erro 404
          </p>
          <h1 className="text-4xl md:text-5xl font-semibold tracking-tight">
            O Lumi não achou{" "}
            <span className="font-serif italic font-normal">essa página</span>.
          </h1>
          <p className="mt-4 text-base text-muted-foreground leading-relaxed">
            Pode ter sido movida, excluída, ou nunca existiu. Vamos de volta pro
            que importa.
          </p>
          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
            <Button asChild variant="gradient" size="lg">
              <Link href="/dashboard">
                <Home className="h-4 w-4" /> Voltar ao dashboard
              </Link>
            </Button>
            <Button asChild variant="outline" size="lg">
              <Link href="/">
                <ArrowLeft className="h-4 w-4" /> Página inicial
              </Link>
            </Button>
          </div>
        </div>
      </main>

      <footer className="relative z-10 border-t border-border/40 py-4 text-center text-xs text-muted-foreground">
        © {new Date().getFullYear()} Lumio · Voltar é parte do caminho.
      </footer>
    </div>
  );
}
