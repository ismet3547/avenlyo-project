import { NextResponse } from "next/server";
import { listKnowledgeDocuments } from "@/lib/rag/db";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json(listKnowledgeDocuments());
}
