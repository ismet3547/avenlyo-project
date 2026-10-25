import { createHash, randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import {
  findKnowledgeDocumentByHash,
  insertKnowledgeDocument,
  listKnowledgeDocuments,
} from "@/lib/rag/db";
import {
  isSupportedKnowledgeFile,
  knowledgeExtension,
  safeKnowledgeFileName,
} from "@/lib/rag/documents";
import { indexKnowledgeDocument } from "@/lib/rag/index";

export const runtime = "nodejs";

const MAX_FILE_SIZE = 25 * 1024 * 1024;

function publicDocument(id: string) {
  return listKnowledgeDocuments().find((item) => item.id === id) ?? null;
}

export async function POST(request: Request) {
  const form = await request.formData();
  const value = form.get("file");

  if (!(value instanceof File)) {
    return NextResponse.json({ error: "Dosya gerekli." }, { status: 400 });
  }

  if (!isSupportedKnowledgeFile(value.name)) {
    return NextResponse.json(
      { error: "Desteklenen dosya türleri: PDF, DOCX, TXT ve MD." },
      { status: 415 },
    );
  }

  if (value.size <= 0 || value.size > MAX_FILE_SIZE) {
    return NextResponse.json(
      { error: "Dosya boyutu 25 MB'dan küçük olmalıdır." },
      { status: 413 },
    );
  }

  const buffer = Buffer.from(await value.arrayBuffer());
  const sha256 = createHash("sha256").update(buffer).digest("hex");
  const duplicate = findKnowledgeDocumentByHash(sha256);

  if (duplicate) {
    return NextResponse.json(
      {
        error: "Bu dosya bilgi tabanında zaten bulunuyor.",
        document: duplicate,
      },
      { status: 409 },
    );
  }

  const id = randomUUID();
  const safeName = safeKnowledgeFileName(value.name);
  const extension = knowledgeExtension(value.name);
  const folder = path.join(process.cwd(), "data", "uploads", id);
  const storedPath = path.join(folder, safeName);
  const timestamp = new Date().toISOString();

  await mkdir(folder, { recursive: true });
  await writeFile(storedPath, buffer);

  insertKnowledgeDocument({
    id,
    name: path.basename(value.name, path.extname(value.name)),
    originalName: value.name,
    mimeType: value.type || "application/octet-stream",
    extension,
    size: value.size,
    sha256,
    status: "processing",
    pageCount: null,
    chunkCount: 0,
    extractionMethod: null,
    ocrPageCount: 0,
    error: null,
    storedPath,
    createdAt: timestamp,
    updatedAt: timestamp,
  });

  try {
    await indexKnowledgeDocument(id, buffer);
    return NextResponse.json(publicDocument(id), { status: 201 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Belge indekslenemedi.";

    return NextResponse.json(
      {
        error: message,
        document: publicDocument(id),
      },
      { status: 422 },
    );
  }
}
