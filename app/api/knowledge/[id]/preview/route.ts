import { NextResponse } from "next/server";
import {
  getChunksForDocuments,
  getKnowledgeDocument,
} from "@/lib/rag/db";

export const runtime = "nodejs";

type Context = {
  params: Promise<{ id: string }>;
};

export async function GET(request: Request, { params }: Context) {
  const { id } = await params;
  const document = getKnowledgeDocument(id);

  if (!document) {
    return NextResponse.json({ error: "Belge bulunamadı." }, { status: 404 });
  }

  const { searchParams } = new URL(request.url);
  const chunkId = searchParams.get("chunkId");
  const page = Number(searchParams.get("page"));

  const chunks = getChunksForDocuments([id]);
  const exact = chunkId ? chunks.find((chunk) => chunk.id === chunkId) : null;
  const pageChunks =
    !exact && Number.isFinite(page) && page > 0
      ? chunks.filter((chunk) => chunk.pageStart === page).slice(0, 3)
      : [];

  const selected = exact ? [exact] : pageChunks.length ? pageChunks : chunks.slice(0, 3);
  const text = selected.map((chunk) => chunk.text).join("\n\n").trim();

  return NextResponse.json({
    document: {
      id: document.id,
      name: document.originalName,
      extension: document.extension,
    },
    pageStart: selected[0]?.pageStart ?? null,
    extractionMethod: selected[0]?.extractionMethod ?? "native",
    ocrConfidence: selected[0]?.ocrConfidence ?? null,
    text,
  });
}
