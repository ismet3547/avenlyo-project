import { getEncoding } from "js-tiktoken";

export type ExtractedPage = {
  text: string;
  pageNumber: number | null;
  extractionMethod: "native" | "ocr";
  ocrConfidence: number | null;
};

export type TextChunk = {
  text: string;
  tokenCount: number;
  pageStart: number | null;
  pageEnd: number | null;
  extractionMethod: "native" | "ocr";
  ocrConfidence: number | null;
};

const encoding = getEncoding("o200k_base");
const TARGET_TOKENS = 800;
const OVERLAP_TOKENS = 120;

function normalizeText(text: string) {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/[\t ]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function chunkExtractedPages(pages: ExtractedPage[]): TextChunk[] {
  const chunks: TextChunk[] = [];

  for (const page of pages) {
    const normalized = normalizeText(page.text);
    if (!normalized) continue;

    const tokens = encoding.encode(normalized);
    if (!tokens.length) continue;

    const step = Math.max(1, TARGET_TOKENS - OVERLAP_TOKENS);

    for (let start = 0; start < tokens.length; start += step) {
      const slice = tokens.slice(start, start + TARGET_TOKENS);
      const text = normalizeText(encoding.decode(slice));
      if (!text) continue;

      chunks.push({
        text,
        tokenCount: slice.length,
        pageStart: page.pageNumber,
        pageEnd: page.pageNumber,
        extractionMethod: page.extractionMethod,
        ocrConfidence: page.ocrConfidence,
      });

      if (start + TARGET_TOKENS >= tokens.length) break;
    }
  }

  return chunks;
}
