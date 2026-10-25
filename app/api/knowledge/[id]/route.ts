import { rm } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import {
  deleteKnowledgeDocumentRecord,
  getKnowledgeDocument,
  listKnowledgeDocuments,
} from "@/lib/rag/db";

export const runtime = "nodejs";

type Context = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, { params }: Context) {
  const { id } = await params;
  const document = listKnowledgeDocuments().find((item) => item.id === id);

  if (!document) {
    return NextResponse.json({ error: "Belge bulunamadı." }, { status: 404 });
  }

  return NextResponse.json(document);
}

export async function DELETE(_request: Request, { params }: Context) {
  const { id } = await params;
  const document = getKnowledgeDocument(id);

  if (!document) {
    return NextResponse.json({ error: "Belge bulunamadı." }, { status: 404 });
  }

  const deleted = deleteKnowledgeDocumentRecord(id);
  if (!deleted) {
    return NextResponse.json({ error: "Belge silinemedi." }, { status: 500 });
  }

  await rm(path.dirname(document.storedPath), {
    recursive: true,
    force: true,
  });

  return NextResponse.json({ ok: true });
}
