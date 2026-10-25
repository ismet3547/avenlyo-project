import { NextResponse } from "next/server";
import { readData } from "@/lib/store";
import {
  createConversation,
  listConversations,
} from "@/lib/chat/store";

export const runtime = "nodejs";

async function validAgent(agentId: string) {
  const data = await readData();
  return data.agents.some((agent) => agent.id === agentId);
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const agentId = searchParams.get("agentId") || "";

  if (!agentId || !(await validAgent(agentId))) {
    return NextResponse.json({ error: "Ajan bulunamadı." }, { status: 404 });
  }

  return NextResponse.json(listConversations(agentId));
}

export async function POST(request: Request) {
  const body = (await request.json()) as {
    agentId?: unknown;
    title?: unknown;
  };

  const agentId = typeof body.agentId === "string" ? body.agentId : "";
  const title = typeof body.title === "string" ? body.title : "";

  if (!agentId || !(await validAgent(agentId))) {
    return NextResponse.json({ error: "Ajan bulunamadı." }, { status: 404 });
  }

  return NextResponse.json(createConversation(agentId, title), { status: 201 });
}
