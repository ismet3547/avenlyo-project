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
  debug: RagDebugTrace;
};

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
    ...extra,
  };
}

export async function retrieveKnowledgeForAgent(
  agentId: string,
  query: string,
  limit = 6,
): Promise<RetrievalResult> {
  const startedAt = performance.now();
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
        .slice(0, 12);
    } catch {
      embeddingMs = performance.now() - embeddingStartedAt;
      semanticScored = [];
    }
  }

  const keyword = searchKnowledgeFts(query, documentIds, 8);
  const scores = new Map<
    string,
    {
      chunk: StoredChunk;
      score: number;
      semanticScore?: number;
      keywordRank?: number;
    }
  >();

  semanticScored.forEach((item, index) => {
    scores.set(item.chunk.id, {
      chunk: item.chunk,
      score: (scores.get(item.chunk.id)?.score ?? 0) + rrfScore(index + 1),
      semanticScore: item.similarity,
      keywordRank: scores.get(item.chunk.id)?.keywordRank,
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
  const items = ranked.slice(0, limit).map((item) => ({
    chunk: item.chunk,
    score: item.score,
  }));

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
    selectedCandidates: ranked.slice(0, limit).map((item) =>
      candidate(item.chunk, {
        semanticScore: item.semanticScore,
        keywordRank: item.keywordRank,
        finalScore: item.score,
      }),
    ),
    selectedTokenCount: items.reduce(
      (sum, item) => sum + item.chunk.tokenCount,
      0,
    ),
    timings: {
      embeddingMs: Math.round(embeddingMs),
      retrievalMs: Math.max(0, Math.round(totalMs - embeddingMs)),
      totalMs: Math.round(totalMs),
    },
  };

  return { items, debug };
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
