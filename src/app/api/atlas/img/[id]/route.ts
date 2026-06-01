/**
 * GET /api/atlas/img/[id]
 *
 * Proxy de signed URL pra imagens do Atlas (`pdf_extracted_images`).
 *
 * Por que esse endpoint existe:
 *  - Antes persistíamos a signed URL diretamente em `image_url` na tabela.
 *    Como signed URLs do Supabase têm TTL (ex: 24h), depois de expirar a
 *    galeria ficava com `<img>` quebrado e o markdown do resumo também.
 *  - Agora `storage_path` é a source of truth e este endpoint regenera uma
 *    signed URL fresca on-demand (TTL 15min) e redireciona o browser.
 *
 * Auth: sessão Supabase (cookie). Bypass não suportado — só o dono da row
 * pode ler. RLS no admin client é bypass, então fazemos eq(user_id) à mão.
 *
 * Rate limit: 120 req/min por user (galeria/resumo podem renderizar várias
 * imgs por página).
 *
 * Resposta de erro retorna 404 (mesmo pra "não autorizado") pra não revelar
 * existência de rows alheios.
 */

import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { getClientIp, limitOrThrow } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** TTL do signed URL devolvido. 15 min cobre o tempo de leitura de um resumo
 *  longo + reaproveita cache do browser (Cache-Control abaixo). */
const SIGNED_URL_TTL_SEC = 15 * 60;

/** Bucket onde extract-images persiste os binários. */
const BUCKET = "pdf-extracted-images";

type PdfImageRow = {
  id: string;
  user_id: string;
  storage_path: string | null;
};

function notFound(): NextResponse {
  // 404 genérico — não diferencia "row não existe" de "row é de outro user"
  // pra evitar enumeration attack via IDs sequenciais (uuid mitiga, mas
  // defesa em profundidade).
  return NextResponse.json({ error: "Imagem não encontrada." }, { status: 404 });
}

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await ctx.params;
  if (!id || typeof id !== "string") {
    return notFound();
  }

  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.SUPABASE_SERVICE_ROLE_KEY
  ) {
    return NextResponse.json(
      { error: "Configuração de servidor incompleta." },
      { status: 503 },
    );
  }

  // Auth via sessão Supabase.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    // Pra recurso protegido fora de fluxo logado, 401 explícito é OK aqui
    // (não estamos revelando se o id existe — só que precisa login).
    return NextResponse.json({ error: "Faça login." }, { status: 401 });
  }
  const userId = user.id;

  // Rate limit: 120 req/min por user. Galeria + resumo educativo podem
  // renderizar 5-15 imgs por página view; deixamos folga.
  const ip = getClientIp(req);
  const ipLimit = limitOrThrow(`atlas-img:ip:${ip}`, 240, 60_000);
  if (ipLimit) return ipLimit as NextResponse;
  const userLimit = limitOrThrow(`atlas-img:user:${userId}`, 120, 60_000);
  if (userLimit) return userLimit as NextResponse;

  const admin = createAdminClient();

  // Carrega a row. eq(user_id) explícito pq admin client bypassa RLS.
  const { data: rowRaw, error: rowErr } = await admin
    .from("pdf_extracted_images")
    .select("id, user_id, storage_path")
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle();
  if (rowErr) {
    console.warn("[atlas/img] lookup falhou", { id, err: rowErr.message });
    return notFound();
  }
  const row = rowRaw as PdfImageRow | null;
  if (!row || !row.storage_path) {
    return notFound();
  }

  // Gera signed URL fresca.
  const { data: signed, error: signErr } = await admin.storage
    .from(BUCKET)
    .createSignedUrl(row.storage_path, SIGNED_URL_TTL_SEC);
  if (signErr || !signed?.signedUrl) {
    console.warn("[atlas/img] signed url falhou", {
      id,
      path: row.storage_path,
      err: signErr?.message,
    });
    return notFound();
  }

  // 302 redirect — `<img src="/api/atlas/img/:id">` segue redirect
  // transparentemente. Cache-Control private/short pra browser reusar a URL
  // por algum tempo sem nova round-trip, mas sem CDN público (signed URL é
  // por-user).
  const res = NextResponse.redirect(signed.signedUrl, 302);
  res.headers.set("Cache-Control", "private, max-age=600");
  return res;
}
