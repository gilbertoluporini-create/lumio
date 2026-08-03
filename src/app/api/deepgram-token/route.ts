/**
 * POST /api/deepgram-token
 *
 * Devolve um token EFÊMERO do Deepgram pro navegador abrir o WebSocket de
 * transcrição ao vivo direto (sem passar áudio pelo nosso servidor, que numa
 * aula de 2h seria caro e lento).
 *
 * A chave-mestra `DEEPGRAM_API_KEY` NUNCA sai daqui. O cliente recebe um token
 * que expira em 60s — tempo suficiente pra abrir a conexão; depois de aberto o
 * WebSocket segue vivo mesmo com o token vencido.
 *
 * ⚠️ Diferença deliberada do capi-web (`app/api/deepgram-token/route.ts`): lá,
 * quando a chave-mestra não tem escopo de gestão, o fallback DEVOLVE A PRÓPRIA
 * chave-mestra pro cliente. No Capi isso é aceitável porque o único usuário é o
 * dono da conta. Aqui não: o Lumio tem usuários de fora, e qualquer um deles
 * abriria o DevTools e sairia com a chave da conta inteira. Então aqui falha
 * FECHADO — sem escopo de gestão, sem streaming.
 */

import { createClient } from "@/lib/supabase/server";
import { getClientIp, limitOrThrow } from "@/lib/rate-limit";
import { logAndSanitize } from "@/lib/api-security";
import { buildDeepgramKeyterms } from "@/lib/speech-glossary";
import { getUserProfileAsync } from "@/lib/user-profile";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DG = "https://api.deepgram.com/v1";
/** Curto de propósito: só precisa durar até o handshake do WebSocket. */
const TTL_SECONDS = 60;
/**
 * Quantas aulas passadas alimentam o glossário. Poucas de propósito: o
 * vocabulário do semestre em curso é o que interessa, e transcrição de aula é
 * texto grande — puxar o histórico inteiro custaria mais do que ajuda.
 */
const AULAS_NO_CORPUS = 5;
const CHARS_POR_AULA = 6_000;

/**
 * Monta o glossário do aluno. Nunca lança: sem glossário a transcrição fica
 * pior, mas continua acontecendo.
 */
async function buildKeytermsFor(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
): Promise<string[]> {
  try {
    const [materias, perfil, aulas] = await Promise.all([
      supabase.from("subjects").select("name").eq("user_id", userId),
      getUserProfileAsync(supabase, userId),
      supabase
        .from("lectures")
        .select("transcript")
        .eq("user_id", userId)
        .not("transcript", "is", null)
        .order("created_at", { ascending: false })
        .limit(AULAS_NO_CORPUS),
    ]);

    return buildDeepgramKeyterms({
      subjectNames: ((materias.data ?? []) as Array<{ name: string }>).map(
        (m) => m.name,
      ),
      course: perfil?.course ?? null,
      difficultySubjects: perfil?.difficultySubjects ?? null,
      previousTranscripts: (
        (aulas.data ?? []) as Array<{ transcript: string | null }>
      )
        .map((a) => String(a.transcript ?? "").slice(0, CHARS_POR_AULA))
        .filter(Boolean),
    });
  } catch (err) {
    console.warn("[deepgram-token] glossário indisponível, seguindo sem", err);
    return [];
  }
}

export async function POST(req: Request) {
  // Só usuário logado: cada token é uma sessão de transcrição paga.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return Response.json({ ok: false, error: "não autorizado" }, { status: 401 });
  }

  // Uma aula = uma conexão. 10/min por usuário cobre reconexão de queda de rede
  // (o navegador reabre o socket) sem virar torneira aberta.
  const ip = getClientIp(req);
  const limited =
    limitOrThrow(`deepgram-token:user:${user.id}`, 10, 60_000) ??
    limitOrThrow(`deepgram-token:ip:${ip}`, 20, 60_000);
  if (limited) return limited;

  const master = process.env.DEEPGRAM_API_KEY;
  if (!master) {
    // Mensagem específica: o cliente usa isso pra cair no modo antigo em vez de
    // deixar o aluno sem transcrição nenhuma no meio da aula.
    return Response.json(
      { ok: false, error: "streaming_indisponivel" },
      { status: 503 },
    );
  }

  // Glossário vai JUNTO do token: é uma ida só ao servidor, e ele já está
  // autenticado e com o banco na mão. Se qualquer parte falhar, segue sem
  // glossário — transcrever sem jargão ancorado é pior, mas não transcrever
  // é muito pior.
  const keyterms = await buildKeytermsFor(supabase, user.id);

  try {
    let projectId = process.env.DEEPGRAM_PROJECT_ID || "";
    if (!projectId) {
      const pr = await fetch(`${DG}/projects`, {
        headers: { Authorization: `Token ${master}` },
      });
      const pj = (await pr.json()) as { projects?: Array<{ project_id?: string }> };
      projectId = pj?.projects?.[0]?.project_id || "";
    }
    if (!projectId) {
      console.error("[deepgram-token] sem project id");
      return Response.json(
        { ok: false, error: "streaming_indisponivel" },
        { status: 503 },
      );
    }

    // Caminho preferido: token efêmero moderno (precisa de chave com escopo Owner).
    const gr = await fetch(`${DG}/auth/grant`, {
      method: "POST",
      headers: {
        Authorization: `Token ${master}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ttl_seconds: TTL_SECONDS }),
    });
    if (gr.ok) {
      const gj = (await gr.json()) as { access_token?: string };
      if (gj?.access_token) {
        return Response.json({
          ok: true,
          token: gj.access_token,
          kind: "bearer",
          expiresIn: TTL_SECONDS,
          keyterms,
        });
      }
    }

    // Alternativa: sub-chave de vida curta com escopo mínimo (só enviar áudio).
    const kr = await fetch(`${DG}/projects/${projectId}/keys`, {
      method: "POST",
      headers: {
        Authorization: `Token ${master}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        comment: `lumio-live-${user.id.slice(0, 8)}`,
        scopes: ["usage:write"],
        time_to_live_in_seconds: TTL_SECONDS,
      }),
    });
    if (kr.ok) {
      const kj = (await kr.json()) as { key?: string };
      if (kj?.key) {
        return Response.json({
          ok: true,
          token: kj.key,
          kind: "token",
          expiresIn: TTL_SECONDS,
          keyterms,
        });
      }
    }

    // Aqui o Capi devolveria a chave-mestra. Nós não (ver o cabeçalho).
    console.error(
      "[deepgram-token] a DEEPGRAM_API_KEY não tem escopo de gestão: nem /auth/grant nem criação de sub-chave funcionaram. Gere uma chave 'Owner' no Deepgram — sem isso o streaming fica desligado.",
    );
    return Response.json(
      { ok: false, error: "streaming_indisponivel" },
      { status: 503 },
    );
  } catch (err) {
    return Response.json(logAndSanitize("api/deepgram-token", err), {
      status: 500,
    });
  }
}
