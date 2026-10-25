import { NextResponse } from "next/server";
import { createAgent, deleteAgent, readData, updateAgent } from "@/lib/store";
import { setAgentDocumentIds } from "@/lib/rag/db";
import { deleteAgentConversations } from "@/lib/chat/store";
import { deleteAgentToolAssignments } from "@/lib/tools/db";

function text(value: unknown, fallback = "") {
  return typeof value === "string" ? value.trim() : fallback;
}

export async function GET() {
  const data = await readData();
  return NextResponse.json(data.agents);
}

export async function POST(request: Request) {
  const body = (await request.json()) as Record<string, unknown>;
  const name = text(body.name);

  if (!name) {
    return NextResponse.json({ error: "Ajan adı gerekli." }, { status: 400 });
  }

  const agent = await createAgent({
    name,
    emoji: text(body.emoji, "✦") || "✦",
    role: text(body.role, "Yapay zeka asistanı"),
    goal: text(body.goal),
    instructions: text(body.instructions),
    model: text(body.model, process.env.OPENAI_MODEL || "gpt-6-luna"),
  });

  return NextResponse.json(agent, { status: 201 });
}

export async function PUT(request: Request) {
  const body = (await request.json()) as Record<string, unknown>;
  const id = text(body.id);

  if (!id) {
    return NextResponse.json({ error: "Ajan kimliği gerekli." }, { status: 400 });
  }

  const agent = await updateAgent(id, {
    ...(typeof body.name === "string" && { name: body.name.trim() }),
    ...(typeof body.emoji === "string" && { emoji: body.emoji.trim() || "✦" }),
    ...(typeof body.role === "string" && { role: body.role.trim() }),
    ...(typeof body.goal === "string" && { goal: body.goal.trim() }),
    ...(typeof body.instructions === "string" && {
      instructions: body.instructions.trim(),
    }),
    ...(typeof body.model === "string" && { model: body.model.trim() }),
  });

  if (!agent) {
    return NextResponse.json({ error: "Ajan bulunamadı." }, { status: 404 });
  }

  return NextResponse.json(agent);
}

export async function DELETE(request: Request) {
  const url = new URL(request.url);
  const id = url.searchParams.get("id")?.trim();

  if (!id) {
    return NextResponse.json({ error: "Ajan kimliği gerekli." }, { status: 400 });
  }

  const deleted = await deleteAgent(id);
  if (!deleted) {
    return NextResponse.json({ error: "Ajan bulunamadı." }, { status: 404 });
  }

  setAgentDocumentIds(id, []);
  deleteAgentConversations(id);
  deleteAgentToolAssignments(id);
  return NextResponse.json({ ok: true });
}
