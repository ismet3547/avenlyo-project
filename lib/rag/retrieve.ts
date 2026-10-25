import type {
  KnowledgeSource,
  RagDebugCandidate,
  RagDebugTrace,
} from "@/lib/types";
import {
  getAgentDocumentIds,
  getChunksForDocuments,
  searchKnowledgeFts,
  type StoredChunk,
} from "@/lib/rag/db";
import { embedQuery } from "@/lib/rag/embeddings";

export type RetrievedKnowledge = {
  chunk: StoredChunk;
  score: number;
};

export type RetrievalResult = {
  items: RetrievedKnowledge[];
  confidence: RagDebugTrace["confidence"];
  debug: RagDebugTrace;
};

type RankedCandidate = {
  chunk: StoredChunk;
  score: number;
  semanticScore?: number;
  keywordRank?: number;
};

const DEFAULT_SEMANTIC_THRESHOLD = 0.22;
const NEAR_DUPLICATE_THRESHOLD = 0.82;

function semanticThreshold() {
  const parsed = Number(process.env.AVENLYO_RAG_SEMANTIC_MIN);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 1
    ? parsed
    : DEFAULT_SEMANTIC_THRESHOLD;
}

function cosineSimilarity(a: number[], b: number[]) {
  if (!a.length || a.length !== b.length) return 0;

  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let index = 0; index < a.length; index += 1) {
    const left = a[index] ?? 0;
    const right = b[index] ?? 0;
    dot += left * right;
    normA += left * left;
    normB += right * right;
  }

  if (!normA || !normB) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

function rrfScore(rank: number, weight = 1) {
  return weight / (60 + rank);
}

function preview(text: string) {
  const compact = text.replace(/\s+/g, " ").trim();
  return compact.length > 190 ? `${compact.slice(0, 190).trim()}…` : compact;
}

function candidate(
  chunk: StoredChunk,
  extra: Partial<RagDebugCandidate> = {},
): RagDebugCandidate {
  return {
    chunkId: chunk.id,
    documentId: chunk.documentId,
    documentName: chunk.documentName,
    pageStart: chunk.pageStart,
    extractionMethod: chunk.extractionMethod,
    ocrConfidence: chunk.ocrConfidence,
    preview: preview(chunk.text),
    ...extra,
  };
}

function wordSet(text: string) {
  return new Set(
    text
      .toLocaleLowerCase("tr")
      .match(/[\p{L}\p{N}]{3,}/gu)
      ?.slice(0, 350) ?? [],
  );
}

function jaccardSimilarity(left: string, right: string) {
  const a = wordSet(left);
  const b = wordSet(right);
  if (!a.size || !b.size) return 0;

  let intersection = 0;
  for (const word of a) {
    if (b.has(word)) intersection += 1;
  }

  return intersection / (a.size + b.size - intersection);
}

function selectionReason(item: RankedCandidate) {
  if (item.semanticScore !== undefined && item.keywordRank !== undefined) {
    return "semantic + keyword";
  }
  if (item.keywordRank !== undefined) return "keyword";
  return "semantic";
}

function confidenceFor(items: RankedCandidate[]): RagDebugTrace["confidence"] {
  if (!items.length) return "none";
  const top = items[0];

  if (
    (top.semanticScore ?? 0) >= 0.5 ||
    (top.keywordRank !== undefined &&
      top.keywordRank <= 2 &&
      (top.semanticScore ?? 0) >= 0.3)
  ) {
    return "high";
  }

  if (
    (top.semanticScore ?? 0) >= 0.3 ||
    (top.keywordRank !== undefined && top.keywordRank <= 2)
  ) {
    return "medium";
  }

  return "low";
}

export async function retrieveKnowledgeForAgent(
  agentId: string,
  query: string,
  limit = 6,
): Promise<RetrievalResult> {
  const startedAt = performance.now();
  const threshold = semanticThreshold();
  const documentIds = getAgentDocumentIds(agentId);
  const allChunks = getChunksForDocuments(documentIds);

  let embeddingMs = 0;
  let semanticScored: Array<{ chunk: StoredChunk; similarity: number }> = [];

  if (allChunks.length) {
    const embeddingStartedAt = performance.now();
    try {
      const queryEmbedding = await embedQuery(query);
      embeddingMs = performance.now() - embeddingStartedAt;
      semanticScored = allChunks
        .map((chunk) => ({
          chunk,
          similarity: cosineSimilarity(queryEmbedding, chunk.embedding),
        }))
        .filter((item) => Number.isFinite(item.similarity))
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, 16);
    } catch {
      embeddingMs = performance.now() - embeddingStartedAt;
      semanticScored = [];
    }
  }

  const keyword = searchKnowledgeFts(query, documentIds, 10);
  const scores = new Map<string, RankedCandidate>();

  semanticScored.forEach((item, index) => {
    const existing = scores.get(item.chunk.id);
    scores.set(item.chunk.id, {
      chunk: item.chunk,
      score: (existing?.score ?? 0) + rrfScore(index + 1),
      semanticScore: item.similarity,
      keywordRank: existing?.keywordRank,
    });
  });

  keyword.forEach((chunk, index) => {
    const existing = scores.get(chunk.id);
    scores.set(chunk.id, {
      chunk,
      score: (existing?.score ?? 0) + rrfScore(index + 1, 1.15),
      semanticScore: existing?.semanticScore,
      keywordRank: index + 1,
    });
  });

  const ranked = [...scores.values()].sort((a, b) => b.score - a.score);
  const rejected: RagDebugCandidate[] = [];
  const relevant = ranked.filter((item) => {
    const passes =
      item.keywordRank !== undefined ||
      (item.semanticScore !== undefined && item.semanticScore >= threshold);

    if (!passes) {
      rejected.push(
        candidate(item.chunk, {
          semanticScore: item.semanticScore,
          keywordRank: item.keywordRank,
          finalScore: item.score,
          rejectedReason: `semantic < ${threshold.toFixed(2)} ve keyword eşleşmesi yok`,
        }),
      );
    }

    return passes;
  });

  const selected: RankedCandidate[] = [];
  const pageKeys = new Set<string>();
  const perDocument = new Map<string, number>();
  const maxPerDocument = documentIds.length > 1 ? 2 : 4;

  for (const item of relevant) {
    if (selected.length >= limit) break;

    const pageKey =
      item.chunk.pageStart !== null
        ? `${item.chunk.documentId}:${item.chunk.pageStart}`
        : "";

    if (pageKey && pageKeys.has(pageKey)) {
      rejected.push(
        candidate(item.chunk, {
          semanticScore: item.semanticScore,
          keywordRank: item.keywordRank,
          finalScore: item.score,
          rejectedReason: "aynı sayfadan daha güçlü bir chunk zaten seçildi",
        }),
      );
      continue;
    }

    const documentCount = perDocument.get(item.chunk.documentId) ?? 0;
    if (documentCount >= maxPerDocument) {
      rejected.push(
        candidate(item.chunk, {
          semanticScore: item.semanticScore,
          keywordRank: item.keywordRank,
          finalScore: item.score,
          rejectedReason: "belge çeşitliliği için document cap uygulandı",
        }),
      );
      continue;
    }

    const duplicate = selected.some(
      (current) =>
        current.chunk.documentId === item.chunk.documentId &&
        jaccardSimilarity(current.chunk.text, item.chunk.text) >=
          NEAR_DUPLICATE_THRESHOLD,
    );

    if (duplicate) {
      rejected.push(
        candidate(item.chunk, {
          semanticScore: item.semanticScore,
          keywordRank: item.keywordRank,
          finalScore: item.score,
          rejectedReason: "yakın-duplicate chunk",
        }),
      );
      continue;
    }

    selected.push(item);
    if (pageKey) pageKeys.add(pageKey);
    perDocument.set(item.chunk.documentId, documentCount + 1);
  }

  const items = selected.map((item) => ({
    chunk: item.chunk,
    score: item.score,
  }));
  const confidence = confidenceFor(selected);

  const totalMs = performance.now() - startedAt;
  const debug: RagDebugTrace = {
    query,
    assignedDocumentCount: documentIds.length,
    indexedChunkCount: allChunks.length,
    semanticCandidates: semanticScored.map((item) =>
      candidate(item.chunk, { semanticScore: item.similarity }),
    ),
    keywordCandidates: keyword.map((chunk, index) =>
      candidate(chunk, { keywordRank: index + 1 }),
    ),
    selectedCandidates: selected.map((item) =>
      candidate(item.chunk, {
        semanticScore: item.semanticScore,
        keywordRank: item.keywordRank,
        finalScore: item.score,
        selectionReason: selectionReason(item),
      }),
    ),
    rejectedCandidates: rejected.slice(0, 16),
    selectedTokenCount: items.reduce(
      (sum, item) => sum + item.chunk.tokenCount,
      0,
    ),
    confidence,
    semanticThreshold: threshold,
    timings: {
      embeddingMs: Math.round(embeddingMs),
      retrievalMs: Math.max(0, Math.round(totalMs - embeddingMs)),
      totalMs: Math.round(totalMs),
    },
  };

  return { items, confidence, debug };
}

export function sourcesFromRetrieved(
  retrieved: RetrievedKnowledge[],
): KnowledgeSource[] {
  const seen = new Set<string>();
  const sources: KnowledgeSource[] = [];

  for (const item of retrieved) {
    const key = [
      item.chunk.documentId,
      item.chunk.pageStart ?? "",
      item.chunk.pageEnd ?? "",
    ].join(":");

    if (seen.has(key)) continue;
    seen.add(key);

    sources.push({
      chunkId: item.chunk.id,
      documentId: item.chunk.documentId,
      documentName: item.chunk.documentName,
      pageStart: item.chunk.pageStart,
      pageEnd: item.chunk.pageEnd,
      score: item.score,
      extractionMethod: item.chunk.extractionMethod,
      ocrConfidence: item.chunk.ocrConfidence,
    });
  }

  return sources;
}

export function contextFromRetrieved(retrieved: RetrievedKnowledge[]) {
  return retrieved
    .map((item, index) => {
      const pageLabel = item.chunk.pageStart
        ? ` page=${item.chunk.pageStart}`
        : "";
      return [
        `[source id=${index + 1} document="${item.chunk.documentName}"${pageLabel}]`,
        item.chunk.text,
        "[/source]",
      ].join("\n");
    })
    .join("\n\n");
}
