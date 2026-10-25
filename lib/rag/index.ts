import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { chunkExtractedPages } from "@/lib/rag/chunk";
import { extractKnowledgeText } from "@/lib/rag/documents";
import { embedTexts } from "@/lib/rag/embeddings";
import {
  getKnowledgeDocument,
  markKnowledgeDocumentError,
  markKnowledgeDocumentProcessing,
  markKnowledgeDocumentReady,
  replaceKnowledgeChunks,
} from "@/lib/rag/db";
import type { ExtractionMethod } from "@/lib/types";

export async function indexKnowledgeDocument(
  documentId: string,
  buffer?: Buffer,
) {
  const document = getKnowledgeDocument(documentId);
  if (!document) throw new Error("Belge bulunamadı.");

  markKnowledgeDocumentProcessing(documentId);

  try {
    const bytes = buffer ?? (await readFile(document.storedPath));
    const extracted = await extractKnowledgeText(bytes, document.originalName);
    const chunks = chunkExtractedPages(extracted.pages);

    if (!chunks.length || chunks.every((chunk) => chunk.text.length < 20)) {
      throw new Error("Dosyada indekslenebilecek metin bulunamadı.");
    }

    const embeddings = await embedTexts(chunks.map((chunk) => chunk.text));
    const rows = chunks.map((chunk, index) => ({
      id: randomUUID(),
      documentId,
      chunkIndex: index,
      text: chunk.text,
      tokenCount: chunk.tokenCount,
      pageStart: chunk.pageStart,
      pageEnd: chunk.pageEnd,
      embedding: embeddings[index] ?? [],
      extractionMethod: chunk.extractionMethod,
      ocrConfidence: chunk.ocrConfidence,
    }));

    const nativePages = extracted.pages.filter(
      (page) => page.text.trim() && page.extractionMethod === "native",
    ).length;
    const ocrPages = extracted.pages.filter(
      (page) => page.text.trim() && page.extractionMethod === "ocr",
    ).length;

    let extractionMethod: ExtractionMethod = "native";
    if (ocrPages && nativePages) extractionMethod = "mixed";
    else if (ocrPages) extractionMethod = "ocr";

    replaceKnowledgeChunks(documentId, rows);
    markKnowledgeDocumentReady(
      documentId,
      extracted.pageCount,
      rows.length,
      extractionMethod,
      ocrPages,
    );

    return getKnowledgeDocument(documentId);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Belge indekslenemedi.";
    markKnowledgeDocumentError(documentId, message);
    throw error;
  }
}
