import type { Metadata } from "next";
import {
  Geist_Mono,
  Instrument_Serif,
  Outfit,
} from "next/font/google";
import "./globals.css";
import { Toaster } from "sonner";
import { ThemeScript } from "@/components/theme-script";
import { SmoothScroll } from "@/components/landing/smooth-scroll";
import { AnalyticsScripts } from "@/components/analytics/analytics-scripts";
import { AuthTracker } from "@/components/analytics/auth-tracker";
import { UtmCapture } from "@/components/analytics/utm-capture";
import { Suspense } from "react";
import { ogImage, SITE_URL } from "@/lib/seo";

// Outfit — geometric sans variable, mesmo estilo chunky/punchy da landing.
// Suporta 100-900, ótimo pra displays grandes + body UI.
const outfit = Outfit({
  variable: "--font-sans",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800", "900"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  display: "swap",
});

const instrumentSerif = Instrument_Serif({
  variable: "--font-serif",
  subsets: ["latin"],
  weight: ["400"],
  style: ["normal", "italic"],
  display: "swap",
});

const ROOT_OG_IMAGE = ogImage({
  title: "Volte a olhar pro professor.",
  subtitle: "Transcrição ao vivo + IA com contexto da sua aula. Por matéria.",
  type: "landing",
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Lumio · Transcreva. Pergunte. Aprenda.",
    template: "%s · Lumio",
  },
  description:
    "Lumi escuta sua aula, transcreve em tempo real e responde dúvidas com contexto. Resumo, flashcards e quiz automáticos por matéria. 50 coins grátis.",
  applicationName: "Lumio",
  keywords: [
    "transcrição de aula",
    "estudar com IA",
    "resumo de aula",
    "flashcards",
    "faculdade",
    "estudo pt-BR",
    "active recall",
    "spaced repetition",
  ],
  authors: [{ name: "Equipe Lumio", url: SITE_URL }],
  creator: "Equipe Lumio",
  publisher: "Lumio",
  alternates: { canonical: SITE_URL },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  icons: {
    icon: "/icon.png",
    apple: "/apple-icon.png",
  },
  openGraph: {
    title: "Lumio · Volte a olhar pro professor",
    description:
      "Transcrição ao vivo + chat IA com contexto. Resumo, flashcards e quiz por matéria. 50 coins grátis ao criar conta.",
    url: SITE_URL,
    siteName: "Lumio",
    type: "website",
    locale: "pt_BR",
    images: [
      {
        url: ROOT_OG_IMAGE,
        width: 1200,
        height: 630,
        alt: "Lumio — transcrição de aulas com IA",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Lumio · Volte a olhar pro professor",
    description:
      "Transcrição ao vivo + chat IA com contexto. Resumo, flashcards e quiz por matéria.",
    images: [ROOT_OG_IMAGE],
  },
};

/**
 * JSON-LD root: Organization + WebSite + SoftwareApplication.
 * Inline no <head> via <script type="application/ld+json"> no body
 * (Next.js App Router não tem head() — usamos <script> dentro do layout).
 */
const ROOT_JSON_LD = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": `${SITE_URL}/#organization`,
      name: "Lumio",
      url: SITE_URL,
      logo: `${SITE_URL}/og-image.png`,
      sameAs: [],
    },
    {
      "@type": "WebSite",
      "@id": `${SITE_URL}/#website`,
      url: SITE_URL,
      name: "Lumio",
      description:
        "Transcrição de aula com IA, resumo, flashcards e quiz por matéria.",
      inLanguage: "pt-BR",
      publisher: { "@id": `${SITE_URL}/#organization` },
      potentialAction: {
        "@type": "SearchAction",
        target: `${SITE_URL}/blog?q={search_term_string}`,
        "query-input": "required name=search_term_string",
      },
    },
    {
      "@type": "SoftwareApplication",
      name: "Lumio",
      operatingSystem: "Web",
      applicationCategory: "EducationalApplication",
      url: SITE_URL,
      description:
        "App de transcrição de aula + IA com contexto. Resumos, flashcards e quizzes por matéria, em português brasileiro.",
      inLanguage: "pt-BR",
      offers: {
        "@type": "AggregateOffer",
        priceCurrency: "BRL",
        lowPrice: "0",
        highPrice: "119",
        offerCount: 4,
      },
    },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="pt-BR"
      className={`${outfit.variable} ${geistMono.variable} ${instrumentSerif.variable} antialiased`}
      suppressHydrationWarning
    >
      <head>
        <ThemeScript />
        <meta
          name="facebook-domain-verification"
          content="hh356m62bbctkrbb5mqm83p9krezsb"
        />
      </head>
      <body className="bg-background text-foreground">
        <script
          type="application/ld+json"
          // eslint-disable-next-line react/no-danger -- structured data
          dangerouslySetInnerHTML={{ __html: JSON.stringify(ROOT_JSON_LD) }}
        />
        <SmoothScroll>{children}</SmoothScroll>
        <Toaster
          position="bottom-right"
          theme="system"
          richColors
          closeButton
        />
        <AnalyticsScripts />
        <Suspense fallback={null}>
          <AuthTracker />
        </Suspense>
        <Suspense fallback={null}>
          <UtmCapture />
        </Suspense>
      </body>
    </html>
  );
}
