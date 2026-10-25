import { readFile } from "node:fs/promises";
import { NextResponse } from "next/server";
import { getKnowledgeDocument } from "@/lib/rag/db";

export const runtime = "nodejs";

type Context = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, { params }: Context) {
  const { id } = await params;
  const document = getKnowledgeDocument(id);

  if (!document) {
    return NextResponse.json({ error: "Belge bulunamadı." }, { status: 404 });
  }

  if (document.extension !== ".pdf") {
    return NextResponse.json(
      { error: "PDF görüntüleyici yalnızca PDF belgelerini açabilir." },
      { status: 415 },
    );
  }

  try {
    const bytes = await readFile(document.storedPath);
    const safeName = document.originalName.replace(/[\r\n"]/g, "");

    return new Response(bytes, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${safeName}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return NextResponse.json(
      { error: "PDF dosyası okunamadı." },
      { status: 500 },
    );
  }
}
