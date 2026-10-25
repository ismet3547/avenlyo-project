import { NextResponse } from "next/server";
import { getToolFeatureFlags, getToolLimits } from "@/lib/tools/config";
import { listToolCatalog, setToolEnabled } from "@/lib/tools/db";
import { getRegisteredTool } from "@/lib/tools/registry";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({
    tools: listToolCatalog(),
    flags: getToolFeatureFlags(),
    limits: getToolLimits(),
  });
}

export async function PATCH(request: Request) {
  const body = (await request.json()) as {
    toolId?: unknown;
    enabled?: unknown;
  };

  const toolId = typeof body.toolId === "string" ? body.toolId.trim() : "";
  const enabled = typeof body.enabled === "boolean" ? body.enabled : null;

  if (!toolId || enabled === null) {
    return NextResponse.json(
      { error: "toolId ve enabled gerekli." },
      { status: 400 },
    );
  }

  if (!getRegisteredTool(toolId)) {
    return NextResponse.json({ error: "Araç bulunamadı." }, { status: 404 });
  }

  if (!setToolEnabled(toolId, enabled)) {
    return NextResponse.json({ error: "Araç güncellenemedi." }, { status: 404 });
  }

  return NextResponse.json({
    toolId,
    enabled,
  });
}
