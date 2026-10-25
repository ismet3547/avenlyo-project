import { NextResponse } from "next/server";
import { readData } from "@/lib/store";
import {
  getAgentToolIds,
  setAgentToolIds,
} from "@/lib/tools/db";

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
    toolIds: getAgentToolIds(id),
  });
}

export async function PUT(request: Request, { params }: Context) {
  const { id } = await params;

  if (!(await ensureAgent(id))) {
    return NextResponse.json({ error: "Ajan bulunamadı." }, { status: 404 });
  }

  const body = (await request.json()) as { toolIds?: unknown };
  const toolIds = Array.isArray(body.toolIds)
    ? body.toolIds.filter(
        (item): item is string =>
          typeof item === "string" && Boolean(item.trim()),
      )
    : [];

  return NextResponse.json({
    toolIds: setAgentToolIds(id, toolIds.map((item) => item.trim())),
  });
}
