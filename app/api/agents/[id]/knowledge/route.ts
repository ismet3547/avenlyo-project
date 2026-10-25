import { NextResponse } from "next/server";
import { readData } from "@/lib/store";
import {
  getAgentDocumentIds,
  setAgentDocumentIds,
} from "@/lib/rag/db";

export const runtime = "nodejs";

type Context = {
  params: Promise<{ id: string }>;
};

async function ensureAgent(id: string) {
  const data = await readData();
  return data.agents.some((agent) => agent.id === id);
}

export async function GET(_request: Request, { params }: Context) {
  const { id } = await params;

  if (!(await ensureAgent(id))) {
    return NextResponse.json({ error: "Ajan bulunamadı." }, { status: 404 });
  }

  return NextResponse.json({
    documentIds: getAgentDocumentIds(id),
  });
}

export async function PUT(request: Request, { params }: Context) {
  const { id } = await params;

  if (!(await ensureAgent(id))) {
    return NextResponse.json({ error: "Ajan bulunamadı." }, { status: 404 });
  }

  const body = (await request.json()) as { documentIds?: unknown };
  const documentIds = Array.isArray(body.documentIds)
    ? body.documentIds.filter(
        (item): item is string => typeof item === "string" && Boolean(item),
      )
    : [];

  return NextResponse.json({
    documentIds: setAgentDocumentIds(id, documentIds),
  });
}
