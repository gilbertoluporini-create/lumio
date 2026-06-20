import type { Metadata } from "next";
import { LumiImg } from "@/components/brand/lumi";
import { LinksCards } from "@/components/links/links-cards";
import { resolveChannel } from "@/components/links/utm";

/**
 * /links — "Linktree próprio" do Lumio.
 * Usado nas bios de IG/TikTok/LinkedIn/Twitter. 90% mobile.
 *
 * Channel attribution via `?c=instagram` (ou tiktok/linkedin/twitter/youtube/email).
 * Todos os links internos recebem utm_source=<channel>&utm_medium=bio&utm_campaign=links_page.
 *
 * `noindex`: linktree não precisa ranquear. Não está no sitemap.
 */

export const metadata: Metadata = {
  title: "Lumio · Links",
  description: "Tudo do Lumio em um só lugar. Comece grátis em pt-BR.",
  robots: {
    index: false,
    follow: true,
    googleBot: { index: false, follow: true },
  },
  openGraph: {
    title: "Lumio · Links",
    description: "Tudo do Lumio em um só lugar. Comece grátis em pt-BR.",
    type: "website",
    url: "/links",
    images: ["/og-default.png"],
  },
  twitter: {
    card: "summary_large_image",
    title: "Lumio · Links",
    description: "Tudo do Lumio em um só lugar.",
    images: ["/og-default.png"],
  },
};

export default async function LinksPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const channel = resolveChannel(params.c);

  return (
    <main
      className="relative min-h-[100dvh] w-full overflow-x-clip"
      style={{
        background:
          "linear-gradient(180deg, oklch(0.985 0.015 305) 0%, oklch(0.96 0.03 305) 100%)",
      }}
    >
      {/* Dot grid sutil — só no light mode (dark vira praticamente invisível) */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-[0.35] dark:opacity-[0.18]"
        style={{
          backgroundImage:
            "radial-gradient(oklch(0.55 0.22 280 / 0.18) 1px, transparent 1px)",
          backgroundSize: "22px 22px",
          maskImage:
            "radial-gradient(ellipse 80% 70% at 50% 0%, black 50%, transparent 90%)",
          WebkitMaskImage:
            "radial-gradient(ellipse 80% 70% at 50% 0%, black 50%, transparent 90%)",
        }}
      />

      {/* Em dark mode: cor de fundo do tema. Light mode: overlay lavender via inline style acima.
          Esse overlay aqui garante que dark fica consistente. */}
      <div className="absolute inset-0 -z-10 hidden dark:block bg-background" />

      <section className="relative mx-auto flex w-full max-w-[480px] flex-col items-center px-5 pt-10 pb-12 sm:pt-14">
        {/* Mascote */}
        <div className="relative h-[160px] w-[160px] select-none animate-lumi-float">
          <LumiImg
            src="/illustrations/lumi-waving.png"
            alt="Lumi, mascote do Lumio, acenando"
            width={320}
            height={320}
            priority
            unoptimized
            draggable={false}
            className="object-contain"
          />
        </div>

        {/* Wordmark */}
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Lumio</h1>

        {/* Headline + tagline */}
        <p className="mt-5 text-center text-[22px] leading-tight font-semibold text-display sm:text-2xl">
          Tudo do Lumio em{" "}
          <span className="gradient-text font-bold">um só lugar.</span>
        </p>
        <p className="mt-2 text-center text-sm text-muted-foreground">
          Estude menos. Entenda mais.
        </p>

        {/* Cards + socials (client component pra rodar tracking) */}
        <div className="mt-7 w-full">
          <LinksCards channel={channel} />
        </div>
      </section>
    </main>
  );
}
