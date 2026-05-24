/**
 * POST /api/tts
 *
 * Text-to-speech via ElevenLabs Multilingual v2 — voz natural com entoação.
 *
 * Estratégia de cache:
 *  - SHA-256(text + voiceId) é a chave em tts_cache (Supabase).
 *  - Hit → retorna { audioUrl, cached: true }, NÃO cobra coins.
 *  - Miss → chama ElevenLabs, salva no bucket tts-audio, registra cache,
 *           cobra 3 coins por chamada (voice_reply) ou 30 por leitura longa
 *           (voice_summary, > 1000 chars).
 *
 * Body: { text: string, voiceId?: string, lectureId?: string }
 * Response:
 *  - 200 { audioUrl, cached, coinsCharged, balanceAfter }
 *  - 503 (sem ELEVENLABS_API_KEY) → client cai pro speechSynthesis nativo
 *  - 402 (sem coins) → upgrade prompt
 */

import { createHash } from "node:crypto";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { chargeCoins, getBalance } from "@/lib/coins";
import { COIN_COSTS } from "@/lib/coins-pricing";
import { checkDailyCostCap, dailyCapResponse } from "@/lib/cost-cap";
import { isFeatureEnabled, featureDisabledResponse } from "@/lib/feature-flags";
import { logAiUsage } from "@/lib/ai-usage";
import { getClientIp, limitOrThrow } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const ELEVENLABS_URL = "https://api.elevenlabs.io/v1/text-to-speech";
/** Will — "Dynamic, Deep and Captivating". Voz masculina jovem com energia.
 *  Override via .env: ELEVENLABS_DEFAULT_VOICE_ID=<id> */
const DEFAULT_VOICE_ID =
  process.env.ELEVENLABS_DEFAULT_VOICE_ID ?? "0YziWIrqiRTHCxeg1lyc";
const MODEL_ID = "eleven_multilingual_v2";
const MAX_CHARS = 4000; // suficiente pra um resumo médio
const BUCKET = "tts-audio";
/** Acima desse tamanho, cobra como "leitura de resumo" (mais caro). */
const SUMMARY_THRESHOLD = 1000;

function textHash(text: string, voiceId: string): string {
  return createHash("sha256")
    .update(`${voiceId}::${text}`)
    .digest("hex");
}

export async function POST(req: Request) {
  const ip = getClientIp(req);
  const ipLimit = limitOrThrow(`tts:ip:${ip}`, 20, 60_000);
  if (ipLimit) return ipLimit;

  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    return Response.json(
      { error: "ElevenLabs não configurado.", fallback: "browser" },
      { status: 503 },
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return Response.json({ error: "Não autenticado." }, { status: 401 });
  }

  let body: { text?: string; voiceId?: string; lectureId?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ error: "JSON inválido." }, { status: 400 });
  }
  const rawText = (body.text ?? "").trim();
  if (!rawText) {
    return Response.json({ error: "text obrigatório." }, { status: 400 });
  }
  const text = rawText.slice(0, MAX_CHARS);
  const voiceId = body.voiceId ?? DEFAULT_VOICE_ID;
  const lectureId = body.lectureId ?? null;
  const hash = textHash(text, voiceId);

  const admin = createAdminClient();

  /* ---------------- 1) Cache lookup ---------------- */
  const { data: cached } = await admin
    .from("tts_cache")
    .select("audio_url")
    .eq("user_id", user.id)
    .eq("text_hash", hash)
    .eq("voice_id", voiceId)
    .maybeSingle();

  if (cached?.audio_url) {
    return Response.json({
      audioUrl: cached.audio_url,
      cached: true,
      coinsCharged: 0,
    });
  }

  /* ---------------- 2) Pre-check saldo ---------------- */
  const isLong = text.length >= SUMMARY_THRESHOLD;
  const coinCost = isLong ? 30 : COIN_COSTS.voiceReply;
  const reason = isLong ? "summary_with_images" : "voice_reply";
  const balance = await getBalance(user.id);
  if (balance < coinCost) {
    return Response.json(
      {
        error: `Saldo insuficiente. Precisa de ${coinCost} coins.`,
        upgrade: "/account/coins",
        balance,
      },
      { status: 402 },
    );
  }

  /* ---------------- 2.0) Kill-switch global (admin pode desligar TTS) ---------------- */
  if (!(await isFeatureEnabled("features.tts.enabled"))) {
    return featureDisabledResponse("features.tts.enabled");
  }

  /* ---------------- 2a) Cap diário USD por user (anti-abuse forte) ---------------- */
  const cap = await checkDailyCostCap(user.id);
  if (!cap.ok) return dailyCapResponse(cap);

  /* ---------------- 2b) Cap diário de voice replies (anti-abuse) ----------------
   * Conta voice_reply nas últimas 24h. Acima do cap → 429 amigável.
   * Não aplica pra summary_with_images (leitura longa é cobrada por chamada). */
  if (reason === "voice_reply") {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { count: dailyVoiceCount } = await admin
      .from("coin_transactions")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("reason", "voice_reply")
      .gte("created_at", since);
    const used = dailyVoiceCount ?? 0;
    if (used >= COIN_COSTS.voiceReplyDailyCap) {
      return Response.json(
        {
          error: `Limite diário de respostas por voz atingido (${COIN_COSTS.voiceReplyDailyCap}/dia). Volta amanhã ou usa o chat por texto.`,
          fallback: "browser",
          dailyUsed: used,
          dailyCap: COIN_COSTS.voiceReplyDailyCap,
        },
        { status: 429 },
      );
    }
  }

  /* ---------------- 3) Chamada ElevenLabs ---------------- */
  const elResp = await fetch(
    `${ELEVENLABS_URL}/${voiceId}?output_format=mp3_44100_128`,
    {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
        "content-type": "application/json",
        accept: "audio/mpeg",
      },
      body: JSON.stringify({
        text,
        model_id: MODEL_ID,
        voice_settings: {
          stability: 0.45,
          similarity_boost: 0.75,
          style: 0.35,
          use_speaker_boost: true,
        },
      }),
    },
  );

  if (!elResp.ok) {
    const errBody = await elResp.text().catch(() => "");
    console.error(
      "[tts] elevenlabs non-ok",
      elResp.status,
      errBody.slice(0, 300),
    );
    return Response.json(
      { error: "Falha ao gerar áudio.", fallback: "browser" },
      { status: 502 },
    );
  }

  const audio = await elResp.arrayBuffer();

  /* ---------------- 4) Upload no bucket ---------------- */
  const fileName = `${user.id}/${hash}.mp3`;
  const { error: upErr } = await admin.storage
    .from(BUCKET)
    .upload(fileName, Buffer.from(audio), {
      contentType: "audio/mpeg",
      upsert: true,
    });
  if (upErr) {
    console.error("[tts] upload failed", upErr);
    return Response.json(
      { error: "Falha ao salvar áudio.", fallback: "browser" },
      { status: 502 },
    );
  }
  const { data: pub } = admin.storage.from(BUCKET).getPublicUrl(fileName);
  const audioUrl = pub.publicUrl;

  /* ---------------- 5) Charge coins ---------------- */
  const charge = await chargeCoins(user.id, coinCost, reason, {
    chars: text.length,
    voiceId,
    cached: false,
  });
  if (!charge.ok) {
    return Response.json(
      { error: "Falha ao cobrar coins.", fallback: "browser" },
      { status: 402 },
    );
  }

  /* ---------------- 5b) Log gasto USD em ai_usage_log ----------------
   * ElevenLabs cobra $0.30/1k chars. logAiUsage calcula chars × $0.0003
   * e insere a row pra alimentar /admin/health + cap diário USD. */
  void logAiUsage({
    userId: user.id,
    endpoint: "/api/tts",
    model: "elevenlabs-multilingual-v2",
    chars: text.length,
    coinsCharged: coinCost,
  });

  /* ---------------- 6) Grava cache ---------------- */
  await admin.from("tts_cache").insert({
    user_id: user.id,
    text_hash: hash,
    voice_id: voiceId,
    audio_url: audioUrl,
    char_count: text.length,
    coins_charged: coinCost,
    lecture_id: lectureId,
  });

  return Response.json({
    audioUrl,
    cached: false,
    coinsCharged: coinCost,
    balanceAfter: charge.balanceAfter,
  });
}
