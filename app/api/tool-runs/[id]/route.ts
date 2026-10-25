import { NextResponse } from "next/server";
import { getToolRunDetail } from "@/lib/tools/operations";

export const runtime = "nodejs";

type Context = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, { params }: Context) {
  const { id } = await params;
  const detail = getToolRunDetail(id);

  if (!detail) {
    return NextResponse.json(
      { error: "Tool çalıştırması bulunamadı." },
      { status: 404 },
    );
  }

  return NextResponse.json(detail);
}
