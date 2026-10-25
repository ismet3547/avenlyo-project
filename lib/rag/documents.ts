import path from "node:path";
import mammoth from "mammoth";
import { extractText, getDocumentProxy } from "unpdf";
import type { ExtractedPage } from "@/lib/rag/chunk";

const PDF_PAGE_LIMIT = 300;
const PDF_TIMEOUT_MS = 45_000;

function extensionOf(fileName: string) {
  return path.extname(fileName).toLocaleLowerCase("tr");
}

export function isSupportedKnowledgeFile(fileName: string) {
  return [".pdf", ".docx", ".txt", ".md"].includes(extensionOf(fileName));
}

export function knowledgeExtension(fileName: string) {
  return extensionOf(fileName);
}

export function safeKnowledgeFileName(fileName: string) {
  const extension = extensionOf(fileName);
  const base = path
    .basename(fileName, extension)
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}._ -]+/gu, "")
    .replace(/\s+/g, "-")
    .slice(0, 90) || "document";

  return `${base}${extension}`;
}

async function extractPdf(buffer: Buffer): Promise<{
  pages: ExtractedPage[];
  pageCount: number;
}> {
  const pdf = await getDocumentProxy(new Uint8Array(buffer));

  try {
    if (pdf.numPages > PDF_PAGE_LIMIT) {
      throw new Error(
        `PDF en fazla ${PDF_PAGE_LIMIT} sayfa olabilir. Bu dosya ${pdf.numPages} sayfa.`,
      );
    }

    const result = await Promise.race([
      extractText(pdf, { mergePages: false }),
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error("PDF metin çıkarma işlemi zaman aşımına uğradı.")),
          PDF_TIMEOUT_MS,
        ),
      ),
    ]);

    const rawText = result.text;
    const pageTexts = Array.isArray(rawText)
      ? rawText
      : typeof rawText === "string"
        ? [rawText]
        : [];

    return {
      pageCount: result.totalPages || pdf.numPages,
      pages: pageTexts.map((text, index) => ({
        text: String(text || ""),
        pageNumber: index + 1,
      })),
    };
  } finally {
    await pdf.destroy();
  }
}

async function extractDocx(buffer: Buffer) {
  const result = await mammoth.extractRawText({ buffer });
  return {
    pageCount: null,
    pages: [{ text: result.value, pageNumber: null }],
  };
}

export async function extractKnowledgeText(
  buffer: Buffer,
  fileName: string,
): Promise<{ pages: ExtractedPage[]; pageCount: number | null }> {
  const extension = extensionOf(fileName);

  if (extension === ".pdf") return extractPdf(buffer);
  if (extension === ".docx") return extractDocx(buffer);

  if (extension === ".txt" || extension === ".md") {
    return {
      pageCount: null,
      pages: [{ text: buffer.toString("utf8"), pageNumber: null }],
    };
  }

  throw new Error("Desteklenmeyen dosya türü.");
}
