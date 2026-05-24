"use client";

import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";

/**
 * Wrapper de upload/download/delete pra Supabase Storage bucket `lectures-audio`.
 *
 * Estrutura de path: `${userId}/${lectureId}.${ext}` — RLS no Supabase deve
 * permitir apenas operações onde `auth.uid()::text = (storage.foldername(name))[1]`.
 *
 * Bucket precisa existir manualmente no Supabase Dashboard antes de funcionar.
 * Configure como PUBLIC pra simplificar leitura (audio_url salvo na lecture
 * é uma URL pública) — ou troque pra createSignedUrl pra restrigir.
 */

const BUCKET = "lectures-audio";

function extFromMime(mime: string): string {
  if (mime.includes("webm")) return "webm";
  if (mime.includes("mp4") || mime.includes("aac")) return "mp4";
  if (mime.includes("ogg")) return "ogg";
  if (mime.includes("wav")) return "wav";
  return "webm";
}

function audioPath(userId: string, lectureId: string, mime: string): string {
  return `${userId}/${lectureId}.${extFromMime(mime)}`;
}

export type UploadResult = {
  url: string;
  path: string;
  mimeType: string;
  sizeBytes: number;
};

/**
 * Faz upload do blob de áudio. Retorna URL pública pra salvar em
 * `lecture.audioUrl`, ou `null` em caso de erro.
 *
 * `upsert: true` permite re-gravar a mesma aula (sobrescreve arquivo anterior).
 */
export async function uploadLectureAudio(
  userId: string,
  lectureId: string,
  blob: Blob,
): Promise<UploadResult | null> {
  if (!isSupabaseConfigured()) {
    console.warn("[audio-storage] Supabase não configurado, pulando upload de áudio.");
    return null;
  }
  if (!blob || blob.size === 0) {
    console.warn("[audio-storage] blob vazio, pulando upload.");
    return null;
  }

  const mime = blob.type || "audio/webm";
  const path = audioPath(userId, lectureId, mime);

  try {
    const supabase = createClient();
    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(path, blob, {
        upsert: true,
        contentType: mime,
        cacheControl: "3600",
      });

    if (uploadError) {
      console.error("[audio-storage] upload falhou", uploadError);
      return null;
    }

    const { data: publicData } = supabase.storage.from(BUCKET).getPublicUrl(path);
    const url: string | undefined = publicData?.publicUrl;
    if (!url) {
      console.error("[audio-storage] getPublicUrl retornou vazio");
      return null;
    }

    return {
      url,
      path,
      mimeType: mime,
      sizeBytes: blob.size,
    };
  } catch (err) {
    console.error("[audio-storage] upload erro inesperado", err);
    return null;
  }
}

/**
 * Cria uma signed URL com TTL (alternativa ao publicUrl pra buckets privados).
 * Não usado por default — mantido pra futura migração de bucket privado.
 */
export async function getSignedLectureAudioUrl(
  userId: string,
  lectureId: string,
  mimeType: string,
  expiresInSec: number = 3600,
): Promise<string | null> {
  if (!isSupabaseConfigured()) return null;
  const path = audioPath(userId, lectureId, mimeType);
  try {
    const supabase = createClient();
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(path, expiresInSec);
    if (error || !data?.signedUrl) {
      console.error("[audio-storage] signedUrl falhou", error);
      return null;
    }
    return data.signedUrl as string;
  } catch (err) {
    console.error("[audio-storage] signedUrl erro", err);
    return null;
  }
}

/**
 * Deleta o áudio da aula. Tenta todas as extensões conhecidas porque não
 * sabemos qual foi usada (e Supabase delete em arquivo inexistente é silencioso).
 */
export async function deleteLectureAudio(
  userId: string,
  lectureId: string,
): Promise<void> {
  if (!isSupabaseConfigured()) return;
  try {
    const supabase = createClient();
    const paths = [
      `${userId}/${lectureId}.webm`,
      `${userId}/${lectureId}.mp4`,
      `${userId}/${lectureId}.ogg`,
      `${userId}/${lectureId}.wav`,
    ];
    const { error } = await supabase.storage.from(BUCKET).remove(paths);
    if (error) {
      console.error("[audio-storage] delete falhou", error);
    }
  } catch (err) {
    console.error("[audio-storage] delete erro", err);
  }
}

/**
 * Helper pra baixar o áudio como Blob (útil pra waveform offline-decoded).
 * Em alguns navegadores `fetch` + audio público é mais simples; este helper
 * cobre fallback pra signed URLs.
 */
export async function fetchAudioBlob(url: string): Promise<Blob | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.error("[audio-storage] fetch falhou", res.status);
      return null;
    }
    return await res.blob();
  } catch (err) {
    console.error("[audio-storage] fetch erro", err);
    return null;
  }
}
