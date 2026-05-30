import type { Metadata } from "next";
import { buildPageMetadata } from "@/lib/seo";

export const metadata: Metadata = buildPageMetadata({
  title: "Lumi",
  description:
    "Converse com Lumi, sua IA de estudo com voz, anexos e contexto da matéria.",
  path: "/lumi",
  noindex: true,
});

export default function LumiLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
