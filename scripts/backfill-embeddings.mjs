#!/usr/bin/env node
/**
 * Backfill embeddings de TODO conteúdo existente que ainda não foi indexado.
 *
 * Roda em modo idempotente: pula sources que já têm chunks em content_embeddings.
 * Usa text-embedding-3-small via OpenAI ($0.02/Mtok ≈ $0.0005 por PDF de 50 págs).
 *
 * Cobre:
 *  - documents.source_text → source_kind="document"
 *  - lectures.transcript   → source_kind="lecture"
 *
 * Pode rodar várias vezes sem duplicar (delete+insert idempotente).
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
function loadEnv() {
  const text = readFileSync(resolve(process.cwd(), ".env.local"), "utf8");
  for (const line of text.split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}
loadEnv();

const OPENAI_KEY = process.env.OPENAI_API_KEY;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SUPABASE_PAT = process.env.SUPABASE_ACCESS_TOKEN;

if (!OPENAI_KEY || !SUPABASE_URL || !SERVICE_ROLE || !SUPABASE_PAT) {
  console.error("Faltam env vars.");
  process.exit(1);
}
const REF = SUPABASE_URL.match(/https:\/\/([^.]+)\.supabase\.co/)[1];

// ---- helpers ----

const CHUNK_SIZE = 2000;
const CHUNK_OVERLAP = 200;

function chunkText(text) {
  const cleaned = text.trim().replace(/\s+/g, " ");
  if (!cleaned) return [];
  if (cleaned.length <= CHUNK_SIZE) return [{ content: cleaned, charStart: 0 }];
  const chunks = [];
  let cursor = 0;
  while (cursor < cleaned.length) {
    const end = Math.min(cursor + CHUNK_SIZE, cleaned.length);
    let cutAt = end;
    if (end < cleaned.length) {
      const tail = cleaned.slice(cursor, end);
      const lastPara = tail.lastIndexOf("\n\n");
      const lastDot = tail.lastIndexOf(". ");
      const last = Math.max(lastPara, lastDot);
      if (last > CHUNK_SIZE * 0.5) cutAt = cursor + last + 1;
    }
    chunks.push({ content: cleaned.slice(cursor, cutAt).trim(), charStart: cursor });
    if (cutAt >= cleaned.length) break;
    cursor = Math.max(cutAt - CHUNK_OVERLAP, cursor + 1);
  }
  return chunks;
}

async function embedBatch(texts) {
  const resp = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${OPENAI_KEY}` },
    body: JSON.stringify({
      model: "text-embedding-3-small",
      input: texts.map((t) => t.slice(0, 30000)),
      encoding_format: "float",
    }),
  });
  const json = await resp.json();
  if (!resp.ok) throw new Error(`OpenAI ${resp.status}: ${json.error?.message}`);
  return { embeddings: json.data.sort((a, b) => a.index - b.index).map((d) => d.embedding), tokens: json.usage.total_tokens };
}

async function dbQuery(sql) {
  const resp = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: "POST",
    headers: { authorization: `Bearer ${SUPABASE_PAT}`, "content-type": "application/json" },
    body: JSON.stringify({ query: sql }),
  });
  if (!resp.ok) throw new Error(`db ${resp.status}: ${await resp.text()}`);
  return resp.json();
}

async function insertChunks(rows) {
  if (rows.length === 0) return;
  const resp = await fetch(`${SUPABASE_URL}/rest/v1/content_embeddings`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${SERVICE_ROLE}`,
      apikey: SERVICE_ROLE,
      "content-type": "application/json",
      prefer: "return=minimal",
    },
    body: JSON.stringify(rows),
  });
  if (!resp.ok) throw new Error(`insert ${resp.status}: ${await resp.text()}`);
}

async function deleteOldChunks(userId, sourceKind, sourceId) {
  const resp = await fetch(
    `${SUPABASE_URL}/rest/v1/content_embeddings?user_id=eq.${userId}&source_kind=eq.${sourceKind}&source_id=eq.${sourceId}`,
    {
      method: "DELETE",
      headers: { authorization: `Bearer ${SERVICE_ROLE}`, apikey: SERVICE_ROLE },
    },
  );
  if (!resp.ok && resp.status !== 204) throw new Error(`delete ${resp.status}`);
}

async function indexOne({ userId, subjectId, sourceKind, sourceId, text, metadata }) {
  const chunks = chunkText(text);
  if (chunks.length === 0) return 0;
  const { embeddings, tokens } = await embedBatch(chunks.map((c) => c.content));
  await deleteOldChunks(userId, sourceKind, sourceId);
  const rows = chunks.map((c, i) => ({
    user_id: userId,
    source_kind: sourceKind,
    source_id: sourceId,
    subject_id: subjectId ?? null,
    chunk_index: i,
    content: c.content,
    embedding: embeddings[i],
    metadata: {
      ...metadata,
      char_start: c.charStart,
      char_end: c.charStart + c.content.length,
    },
  }));
  await insertChunks(rows);
  return { chunks: chunks.length, tokens };
}

// ---- main ----

async function main() {
  console.log("Buscando docs e lectures indexáveis...");
  const docsSql = `select id, user_id, subject_id, title, source_text, page_count from documents where source_text is not null and length(source_text) > 80;`;
  const lecsSql = `select id, user_id, subject_id, title, transcript, duration_sec from lectures where transcript is not null and length(transcript) > 80;`;
  const indexedSql = `select source_kind, source_id from content_embeddings group by source_kind, source_id;`;

  const [docs, lecs, indexed] = await Promise.all([
    dbQuery(docsSql),
    dbQuery(lecsSql),
    dbQuery(indexedSql),
  ]);

  const alreadyIndexed = new Set(indexed.map((r) => `${r.source_kind}:${r.source_id}`));

  const tasks = [];
  for (const d of docs) {
    if (alreadyIndexed.has(`document:${d.id}`)) continue;
    tasks.push({
      userId: d.user_id,
      subjectId: d.subject_id,
      sourceKind: "document",
      sourceId: d.id,
      text: d.source_text,
      metadata: { title: d.title, page_count: d.page_count },
    });
  }
  for (const l of lecs) {
    if (alreadyIndexed.has(`lecture:${l.id}`)) continue;
    tasks.push({
      userId: l.user_id,
      subjectId: l.subject_id,
      sourceKind: "lecture",
      sourceId: l.id,
      text: l.transcript,
      metadata: { title: l.title, duration_sec: l.duration_sec },
    });
  }

  console.log(`Total docs: ${docs.length}, lectures: ${lecs.length}, já indexados: ${alreadyIndexed.size}, pendentes: ${tasks.length}\n`);

  if (tasks.length === 0) {
    console.log("Nada a fazer. ✅");
    return;
  }

  let totalTokens = 0;
  let totalChunks = 0;
  for (const task of tasks) {
    try {
      const r = await indexOne(task);
      if (r) {
        totalChunks += r.chunks;
        totalTokens += r.tokens;
        console.log(`✅ ${task.sourceKind}/${task.sourceId.slice(0, 8)} — ${r.chunks} chunks, ${r.tokens} tokens`);
      }
    } catch (err) {
      console.error(`❌ ${task.sourceKind}/${task.sourceId}: ${err.message}`);
    }
  }
  const cost = (totalTokens / 1_000_000) * 0.02;
  console.log(`\n📊 ${totalChunks} chunks, ${totalTokens} tokens, $${cost.toFixed(5)} de custo OpenAI.`);
}

main().catch((err) => { console.error(err); process.exit(1); });
