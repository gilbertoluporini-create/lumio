/**
 * POST /api/ai/illustrate
 *
 * Gera UMA imagem educacional médico-acadêmica via gpt-image-1 a partir de
 * um prompt simples em pt-BR. Cobra 20 coins (mesmo preço do mindmap c/ imagem).
 *
 * Body: { prompt: string }
 * Response: { url: string, coinsCharged: number, balanceAfter: number }
 *
 * Uso primário: tool `gerar_imagem` do Lumi chat (user pede "me mostra a
 * via glicolítica em diagrama" e Lumi chama isso). Pode ser reusado em
 * outros lugares — endpoint genérico de single-shot illustration.
 *
 * Não persiste em lecture_assets — quem chama decide se salva o link.
 * O Lumi guarda o link na mensagem do chat (markdown).
 */

import { createClient, createAdminClient } from "@/lib/supabase/server";
import { limitOrThrow } from "@/lib/rate-limit";
import { checkDailyCostCap, dailyCapResponse } from "@/lib/cost-cap";
import { chargeCoins, creditCoins } from "@/lib/coins";
import { logAiUsage } from "@/lib/ai-usage";
import {
  generateImageOpenAI,
  isOpenAIImageConfigured,
  wrapPromptForMedicalDiagram,
} from "@/lib/openai-image";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const STORAGE_BUCKET = "ai-images";
const COIN_COST = 20;

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return Response.json({ error: "Faça login." }, { status: 401 });
    }

    // Rate limit + cost cap — geração de imagem é cara, não pode ficar livre.
    // 20 chamadas / hora por user. limitOrThrow devolve Response em vez de throw.
    const rl = limitOrThrow(`illustrate:${user.id}`, 20, 3_600_000);
    if (rl) return rl;
    const capCheck = await checkDailyCostCap(user.id);
    if (!capCheck.ok) return dailyCapResponse(capCheck);

    if (!isOpenAIImageConfigured()) {
      return Response.json(
        { error: "Geração de imagem desabilitada (sem OPENAI_API_KEY)." },
        { status: 503 },
      );
    }

    const body = (await req.json().catch(() => ({}))) as { prompt?: string };
    const rawPrompt = (body.prompt ?? "").trim();
    if (!rawPrompt || rawPrompt.length < 4) {
      return Response.json(
        { error: "Prompt obrigatório (mín 4 chars)." },
        { status: 400 },
      );
    }
    if (rawPrompt.length > 1500) {
      return Response.json(
        { error: "Prompt muito longo (máx 1500 chars)." },
        { status: 400 },
      );
    }

    // Charge ANTES (reembolsa se falhar)
    const charge = await chargeCoins(user.id, COIN_COST, "image_generation", {
      endpoint: "illustrate",
      prompt_preview: rawPrompt.slice(0, 80),
    });
    if (!charge.ok) {
      return Response.json(
        {
          error: `Saldo insuficiente. Precisa de ${charge.required} coins, você tem ${charge.balance}.`,
          required: charge.required,
          balance: charge.balance,
          upgrade: "/account/coins",
        },
        { status: 402 },
      );
    }

    let url: string;
    try {
      const { b64 } = await generateImageOpenAI({
        prompt: wrapPromptForMedicalDiagram(rawPrompt),
        // 16:9 landscape — pedido explícito no prompt (estilo coleção)
        size: "1536x1024",
        quality: "medium",
        apiKey: process.env.OPENAI_API_KEY!,
      });

      const admin = createAdminClient();
      const buffer = Buffer.from(b64, "base64");
      const key = `${user.id}/illustrate-${Date.now()}-${Math.random()
        .toString(36)
        .slice(2, 8)}.png`;
      const { error: upErr } = await admin.storage
        .from(STORAGE_BUCKET)
        .upload(key, buffer, {
          contentType: "image/png",
          upsert: false,
        });
      if (upErr) {
        throw new Error(`upload falhou: ${upErr.message}`);
      }
      const { data: pub } = admin.storage
        .from(STORAGE_BUCKET)
        .getPublicUrl(key);
      if (!pub?.publicUrl) {
        throw new Error("getPublicUrl vazio");
      }
      url = pub.publicUrl;

      void logAiUsage({
        userId: user.id,
        endpoint: "illustrate",
        model: "gpt-image-1",
        imagesCount: 1,
      }).catch(() => {});
    } catch (err) {
      // Reembolsa se falhou a geração/upload
      await creditCoins(user.id, COIN_COST, "refund", {
        original_reason: "image_generation",
        endpoint: "illustrate",
        failure: (err as Error).message?.slice(0, 200),
      }).catch(() => {});
      console.error("[illustrate] generation failed", err);
      return Response.json(
        { error: "Falha ao gerar imagem. Coins reembolsados." },
        { status: 500 },
      );
    }

    return Response.json({
      url,
      coinsCharged: COIN_COST,
      balanceAfter: charge.balanceAfter,
    });
  } catch (err) {
    console.error("[illustrate] crash", err);
    return Response.json({ error: "Erro interno." }, { status: 500 });
  }
}
