import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "sonner";
import { ThemeScript } from "@/components/theme-script";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Lumio — Transcreva. Pergunte. Aprenda.",
  description:
    "A plataforma de estudos com IA que transcreve sua aula em tempo real e responde suas dúvidas com contexto.",
  metadataBase: new URL("https://lumio.app"),
  openGraph: {
    title: "Lumio — Transcreva. Pergunte. Aprenda.",
    description:
      "Transcrição ao vivo + chat IA com contexto da sua aula. Tudo organizado por matéria.",
    type: "website",
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
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <ThemeScript />
      </head>
      <body className="min-h-full bg-background text-foreground">
        {children}
        <Toaster
          position="bottom-right"
          theme="system"
          richColors
          closeButton
        />
      </body>
    </html>
  );
}
