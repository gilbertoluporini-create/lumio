/**
 * mind-map-updater — Atualização incremental de mapa mental por matéria.
 *
 * Fluxo: a cada aula nova de uma matéria, o Agent F1 (pós-transcribe)
 * chama `updateSubjectMindMap`, que:
 *   1) Carrega a estrutura atual de `subject_mind_maps` (se houver).
 *   2) Pede ao LLM pra ADICIONAR conceitos novos da aula no mapa, sem
 *      deletar nodes existentes (preserva o que já foi acumulado).
 *   3) Faz UPSERT da nova estrutura, incrementando version.
 *
 * Estratégia anti-explosão:
 *   - Limita transcript a 6000 chars (chunk inicial).
 *   - Pede ao LLM "até 10 nodes novos por update".
 *   - Hard cap pós-merge: 200 nodes / 300 edges. Excedente é descartado.
 *   - Dedup de nodes por `id` e edges por `from|to|label` (case-insensitive).
 *
 * Erros são engolidos (catch global): o trigger F1 nunca quebra por causa
 * disso — é melhor pular um update do que falhar a transcrição.
 */

import { createMessage } from "@/lib/llm-fallback";

const MAX_TRANSCRIPT_CHARS = 6000;
const MAX_NEW_NODES_HINT = 10;
const HARD_CAP_NODES = 200;
const HARD_CAP_EDGES = 300;

type MindMapNode = {
  id: string;
  label: string;
  type?: string;
  importance?: number;
};

type MindMapEdge = {
  from: string;
  to: string;
  label?: string;
};

type MindMapStructure = {
  nodes: MindMapNode[];
  edges: MindMapEdge[];
};

const EMPTY_STRUCTURE: MindMapStructure = { nodes: [], edges: [] };

const SYSTEM_PROMPT = `Você é um especialista em mapas mentais médicos. Atualize o mapa mental existente integrando NOVOS conceitos da aula. NUNCA delete nodes existentes. Mantenha hierarquia e relações. Responda SOMENTE JSON válido.`;

function isMindMapStructure(raw: unknown): raw is MindMapStructure {
  if (!raw || typeof raw !== "object") return false;
  const o = raw as Record<string, unknown>;
  return Array.isArray(o.nodes) && Array.isArray(o.edges);
}

function sanitizeNode(raw: unknown): MindMapNode | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const id = typeof o.id === "string" ? o.id.trim() : "";
  const label = typeof o.label === "string" ? o.label.trim() : "";
  if (!id || !label) return null;
  const node: MindMapNode = { id, label };
  if (typeof o.type === "string" && o.type.trim()) node.type = o.type.trim();
  if (typeof o.importance === "number" && Number.isFinite(o.importance)) {
    // Normaliza pra [0, 1] sem ser rígido demais.
    const imp = Math.max(0, Math.min(1, o.importance));
    node.importance = imp;
  }
  return node;
}

function sanitizeEdge(raw: unknown): MindMapEdge | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const from = typeof o.from === "string" ? o.from.trim() : "";
  const to = typeof o.to === "string" ? o.to.trim() : "";
  if (!from || !to) return null;
  const edge: MindMapEdge = { from, to };
  if (typeof o.label === "string" && o.label.trim()) edge.label = o.label.trim();
  return edge;
}

function tryParseJson(text: string): MindMapStructure | null {
  const cleaned = text
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();
  try {
    const parsed = JSON.parse(cleaned);
    if (isMindMapStructure(parsed)) return parsed;
  } catch {}
  const m = cleaned.match(/\{[\s\S]*\}/);
  if (m) {
    try {
      const parsed = JSON.parse(m[0]);
      if (isMindMapStructure(parsed)) return parsed;
    } catch {}
  }
  return null;
}

function mergeStructures(
  current: MindMapStructure,
  llmResponse: MindMapStructure,
): MindMapStructure {
  // Sanitiza tudo.
  const cleanNodes = llmResponse.nodes
    .map(sanitizeNode)
    .filter((n): n is MindMapNode => n !== null);
  const cleanEdges = llmResponse.edges
    .map(sanitizeEdge)
    .filter((e): e is MindMapEdge => e !== null);

  // Dedup nodes por id (preservando nodes existentes — política "nunca delete").
  const nodesById = new Map<string, MindMapNode>();
  for (const n of current.nodes) nodesById.set(n.id, n);
  for (const n of cleanNodes) {
    if (!nodesById.has(n.id)) nodesById.set(n.id, n);
  }

  // Dedup edges por chave normalizada.
  const edgesByKey = new Map<string, MindMapEdge>();
  const edgeKey = (e: MindMapEdge) =>
    `${e.from.toLowerCase()}|${e.to.toLowerCase()}|${(e.label || "").toLowerCase()}`;
  for (const e of current.edges) edgesByKey.set(edgeKey(e), e);
  for (const e of cleanEdges) {
    const k = edgeKey(e);
    if (!edgesByKey.has(k)) edgesByKey.set(k, e);
  }

  // Hard cap: prioriza nodes existentes; trunca o tail (= novidades) se exceder.
  // Edges só são mantidas se os dois endpoints existirem após o cap.
  const allNodes = Array.from(nodesById.values()).slice(0, HARD_CAP_NODES);
  const validIds = new Set(allNodes.map((n) => n.id));
  const allEdges = Array.from(edgesByKey.values())
    .filter((e) => validIds.has(e.from) && validIds.has(e.to))
    .slice(0, HARD_CAP_EDGES);

  return { nodes: allNodes, edges: allEdges };
}

type UpdateOpts = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any;
  userId: string;
  subjectId: string;
  lectureId: string;
  transcript: string;
};

export async function updateSubjectMindMap(opts: UpdateOpts): Promise<void> {
  const { admin, userId, subjectId, lectureId, transcript } = opts;
  try {
    if (!userId || !subjectId) return;
    const raw = (transcript || "").trim();
    if (!raw) return;

    // 1) SELECT estrutura atual.
    const { data: existing } = await admin
      .from("subject_mind_maps")
      .select("structure, version")
      .eq("user_id", userId)
      .eq("subject_id", subjectId)
      .maybeSingle();

    const currentRow = existing as
      | { structure: MindMapStructure | null; version: number | null }
      | null;
    const currentStructure: MindMapStructure =
      currentRow?.structure && isMindMapStructure(currentRow.structure)
        ? currentRow.structure
        : EMPTY_STRUCTURE;
    const currentVersion = currentRow?.version ?? 0;

    // 2) LLM call.
    const truncated = raw.slice(0, MAX_TRANSCRIPT_CHARS);
    const userMessage = `Mapa atual: ${JSON.stringify(currentStructure)}. Nova aula (transcript primeiros ${MAX_TRANSCRIPT_CHARS} chars): ${truncated}. Atualize o mapa adicionando até ${MAX_NEW_NODES_HINT} nodes novos e edges relevantes. Formato resposta: {"nodes":[...], "edges":[...]}.`;

    const resp = await createMessage({
      model: "claude-sonnet-4-5-20250929",
      max_tokens: 4000,
      system: [{ type: "text", text: SYSTEM_PROMPT }],
      messages: [{ role: "user", content: userMessage }],
    });

    const textBlock = resp.content.find((b) => b.type === "text");
    const text = textBlock && textBlock.type === "text" ? textBlock.text : "";
    const parsed = tryParseJson(text);
    if (!parsed) {
      console.warn(
        `[mind-map] LLM response não parseou JSON; pulando update subject=${subjectId}`,
      );
      return;
    }

    // 3) Merge + sanitize + hard cap.
    const newStructure = mergeStructures(currentStructure, parsed);

    // 4) UPSERT.
    const { error: upsertErr } = await admin
      .from("subject_mind_maps")
      .upsert(
        {
          user_id: userId,
          subject_id: subjectId,
          structure: newStructure,
          version: currentVersion + 1,
          last_updated_lecture_id: lectureId,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,subject_id" },
      );

    if (upsertErr) {
      console.error("[mind-map] upsert failed", upsertErr);
      return;
    }

    console.log(
      `[mind-map] updated subject=${subjectId} version=${currentVersion + 1} nodes=${newStructure.nodes.length}`,
    );
  } catch (err) {
    // Engole tudo — nunca propaga pro F1.
    console.error("[mind-map] update failed (swallowed)", err);
  }
}

export type { MindMapNode, MindMapEdge, MindMapStructure };
