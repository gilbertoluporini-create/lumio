import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Guia de Revisão da Semana de Prova — Lumio",
  description:
    "Baixe grátis o guia em 3 passos pra organizar 4 horas de aula em 40 minutos de estudo focado. PDF de 4 páginas + 50 coins extras se criar conta.",
  openGraph: {
    title: "Guia de Revisão da Semana de Prova",
    description:
      "3 passos pra transformar 4 horas de aula em 40 minutos de estudo focado. PDF gratuito.",
    type: "article",
    siteName: "Lumio",
  },
  twitter: {
    card: "summary_large_image",
    title: "Guia de Revisão da Semana de Prova — Lumio",
    description:
      "3 passos pra transformar 4 horas de aula em 40 minutos de estudo focado. PDF gratuito.",
  },
  robots: { index: true, follow: true },
};

export default function GuiaRevisaoLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
