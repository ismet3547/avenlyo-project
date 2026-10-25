import { NextResponse } from "next/server";
import {
  getKnowledgeDocument,
  listKnowledgeDocuments,
} from "@/lib/rag/db";
import { indexKnowledgeDocument } from "@/lib/rag/index";

export const runtime = "nodejs";

type Context = {
  params: Promise<{ id: string }>;
};

export async function POST(_request: Request, { params }: Context) {
  const { id } = await params;
  const document = getKnowledgeDocument(id);

  if (!document) {
    return NextResponse.json({ error: "Belge bulunamadı." }, { status: 404 });
  }

  try {
    await indexKnowledgeDocument(id);
    const updated = listKnowledgeDocuments().find((item) => item.id === id);
    return NextResponse.json(updated);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Belge yeniden indekslenemedi.";
    const updated = listKnowledgeDocuments().find((item) => item.id === id);

    return NextResponse.json(
      { error: message, document: updated },
      { status: 422 },
    );
  }
}
