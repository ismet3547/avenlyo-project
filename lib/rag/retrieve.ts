import type { KnowledgeSource } from "@/lib/types";
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

export async function retrieveKnowledgeForAgent(
  agentId: string,
  query: string,
  limit = 6,
): Promise<RetrievedKnowledge[]> {
  const documentIds = getAgentDocumentIds(agentId);
  if (!documentIds.length) return [];

  const allChunks = getChunksForDocuments(documentIds);
  if (!allChunks.length) return [];

  let semantic: StoredChunk[] = [];

  try {
    const queryEmbedding = await embedQuery(query);
    semantic = allChunks
      .map((chunk) => ({
        chunk,
        similarity: cosineSimilarity(queryEmbedding, chunk.embedding),
      }))
      .filter((item) => Number.isFinite(item.similarity))
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, 12)
      .map((item) => item.chunk);
  } catch {
    semantic = [];
  }

  const keyword = searchKnowledgeFts(query, documentIds, 8);
  const scores = new Map<string, { chunk: StoredChunk; score: number }>();

  semantic.forEach((chunk, index) => {
    scores.set(chunk.id, {
      chunk,
      score: (scores.get(chunk.id)?.score ?? 0) + rrfScore(index + 1),
    });
  });

  keyword.forEach((chunk, index) => {
    scores.set(chunk.id, {
      chunk,
      score:
        (scores.get(chunk.id)?.score ?? 0) + rrfScore(index + 1, 1.15),
    });
  });

  return [...scores.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
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
