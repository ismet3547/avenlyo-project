import path from "node:path";
import mammoth from "mammoth";
import { createWorker, type Worker } from "tesseract.js";
import {
  extractText,
  getDocumentProxy,
  renderPageAsImage,
} from "unpdf";
import type { ExtractedPage } from "@/lib/rag/chunk";

const PDF_PAGE_LIMIT = 300;
const OCR_PAGE_LIMIT = 100;
const PDF_TIMEOUT_MS = 45_000;
const NATIVE_TEXT_THRESHOLD = 60;
const OCR_RENDER_SCALE = 2;

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

function ocrLanguages() {
  const configured = process.env.AVENLYO_OCR_LANGS
    ?.split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  return configured?.length ? configured : ["tur", "eng"];
}

async function recognizePdfPage(
  pdf: Awaited<ReturnType<typeof getDocumentProxy>>,
  pageNumber: number,
  worker: Worker,
) {
  const image = await renderPageAsImage(pdf, pageNumber, {
    canvasImport: () => import("@napi-rs/canvas"),
    scale: OCR_RENDER_SCALE,
  });

  const input = typeof image === "string" ? image : Buffer.from(image);
  const result = await worker.recognize(input);

  return {
    text: result.data.text.trim(),
    confidence:
      typeof result.data.confidence === "number"
        ? Math.round(result.data.confidence * 10) / 10
        : null,
  };
}

async function extractPdf(buffer: Buffer): Promise<{
  pages: ExtractedPage[];
  pageCount: number;
}> {
  const pdf = await getDocumentProxy(new Uint8Array(buffer));
  let worker: Worker | null = null;

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

    const needsOcr = Array.from({ length: pdf.numPages }, (_, index) => ({
      index,
      text: String(pageTexts[index] || "").trim(),
    })).filter((page) => page.text.length < NATIVE_TEXT_THRESHOLD);

    if (needsOcr.length > OCR_PAGE_LIMIT) {
      throw new Error(
        `Bu PDF'de ${needsOcr.length} sayfa OCR gerektiriyor. İlk sürümde OCR sınırı ${OCR_PAGE_LIMIT} sayfadır.`,
      );
    }

    if (needsOcr.length) {
      worker = await createWorker(ocrLanguages());
    }

    const pages: ExtractedPage[] = [];

    for (let index = 0; index < pdf.numPages; index += 1) {
      const nativeText = String(pageTexts[index] || "").trim();

      if (nativeText.length >= NATIVE_TEXT_THRESHOLD || !worker) {
        pages.push({
          text: nativeText,
          pageNumber: index + 1,
          extractionMethod: "native",
          ocrConfidence: null,
        });
        continue;
      }

      const ocr = await recognizePdfPage(pdf, index + 1, worker);
      pages.push({
        text: ocr.text || nativeText,
        pageNumber: index + 1,
        extractionMethod: ocr.text ? "ocr" : "native",
        ocrConfidence: ocr.text ? ocr.confidence : null,
      });
    }

    return {
      pageCount: result.totalPages || pdf.numPages,
      pages,
    };
  } finally {
    if (worker) await worker.terminate();
    const destroy = (pdf as unknown as { destroy?: () => void | Promise<void> }).destroy;
    if (destroy) await destroy.call(pdf);
  }
}

async function extractDocx(buffer: Buffer) {
  const result = await mammoth.extractRawText({ buffer });
  return {
    pageCount: null,
    pages: [{
      text: result.value,
      pageNumber: null,
      extractionMethod: "native" as const,
      ocrConfidence: null,
    }],
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
      pages: [{
        text: buffer.toString("utf8"),
        pageNumber: null,
        extractionMethod: "native",
        ocrConfidence: null,
      }],
    };
  }

  throw new Error("Desteklenmeyen dosya türü.");
}
