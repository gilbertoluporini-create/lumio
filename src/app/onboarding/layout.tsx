import type { Metadata } from "next";
import { buildPageMetadata } from "@/lib/seo";

export const metadata: Metadata = buildPageMetadata({
  title: "Configurando · Lumio",
  description: "Configure suas matérias pra começar a usar o Lumio.",
  path: "/onboarding",
  noindex: true,
});

export default function OnboardingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
