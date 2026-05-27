import type { Metadata } from "next";
import { buildPageMetadata } from "@/lib/seo";

const TITLE = "Guia de Revisão da Semana de Prova · Lumio";
const DESCRIPTION =
  "E-book grátis de 4 páginas: como transformar 4h de aula em 40min de estudo focado. 3 passos pra qualquer matéria densa. Baixa agora.";

export const metadata: Metadata = buildPageMetadata({
  title: TITLE,
  description: DESCRIPTION,
  path: "/guia-revisao",
  ogTitle: "Guia de Revisão da Semana de Prova",
  ogDescription:
    "E-book grátis: 4h de aula em 40min de estudo focado. 3 passos pra qualquer matéria densa.",
  ogImageType: "landing",
});

export default function GuiaRevisaoLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
