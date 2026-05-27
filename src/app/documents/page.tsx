import { redirect } from "next/navigation";

// Rota legacy — a tela real de "Meus documentos" é /documentos (português).
// Redirect server-side pra preservar bookmarks antigos sem 404.
export default function DocumentsLegacyRedirect() {
  redirect("/documentos");
}
