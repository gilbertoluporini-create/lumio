import type { Metadata } from "next";
import { buildPageMetadata } from "@/lib/seo";

export const metadata: Metadata = buildPageMetadata({
  title: "Criar conta · Lumio",
  description:
    "Crie sua conta Lumio em 30 segundos e ganhe 50 coins grátis pra transcrever aula, gerar resumo, flashcards e quiz com IA.",
  path: "/signup",
  ogImageType: "default",
  noindex: true,
});

export default function SignupLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
