import type { Metadata } from "next";
import {
  Bricolage_Grotesque,
  Geist_Mono,
  Instrument_Serif,
} from "next/font/google";
import "./globals.css";
import { Toaster } from "sonner";
import { ThemeScript } from "@/components/theme-script";
import { SmoothScroll } from "@/components/landing/smooth-scroll";
import { AnalyticsScripts } from "@/components/analytics/analytics-scripts";

// Bricolage Grotesque — variable display+body font, editorial + amigável,
// substitui Geist Sans pra fugir do template de IA.
const bricolage = Bricolage_Grotesque({
  variable: "--font-sans",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
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

export const metadata: Metadata = {
  title: "Lumio — Transcreva. Pergunte. Aprenda.",
  description:
    "Lumi escuta sua aula, transcreve em tempo real e responde suas dúvidas com contexto. Resumo automático por matéria.",
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3001",
  ),
  openGraph: {
    title: "Lumio — Volte a olhar pro professor",
    description:
      "Transcrição ao vivo + chat IA com contexto da sua aula. Tudo organizado por matéria.",
    type: "website",
    locale: "pt_BR",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "Lumio — transcrição de aulas com IA",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Lumio — Volte a olhar pro professor",
    description:
      "Transcrição ao vivo + chat IA com contexto. Resumo automático por matéria.",
    images: ["/og-image.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="pt-BR"
      className={`${bricolage.variable} ${geistMono.variable} ${instrumentSerif.variable} antialiased`}
      suppressHydrationWarning
    >
      <head>
        <ThemeScript />
      </head>
      <body className="bg-background text-foreground">
        <SmoothScroll>{children}</SmoothScroll>
        <Toaster
          position="bottom-right"
          theme="system"
          richColors
          closeButton
        />
        <AnalyticsScripts />
      </body>
    </html>
  );
}
