import type { Metadata } from "next";
import { buildPageMetadata } from "@/lib/seo";

export const metadata: Metadata = buildPageMetadata({
  title: "Entrar · Lumio",
  description:
    "Acesse sua conta Lumio pra transcrever aulas, gerar resumos e estudar com IA. Login por email ou Google.",
  path: "/login",
  ogImageType: "default",
  noindex: true,
});

export default function LoginLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
