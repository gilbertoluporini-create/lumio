import { redirect } from "next/navigation";

// Rota legacy — tela "Produtos gerados" foi removida. Cada feature (resumo,
// flashcards, quiz, mapa) tem hub próprio. Redirect server-side preserva
// bookmarks antigos.
export default async function ProductsLegacyRedirect({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/lecture/${id}`);
}
