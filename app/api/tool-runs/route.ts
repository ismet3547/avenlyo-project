import { NextResponse } from "next/server";
import {
  getToolOperationsSummary,
  listToolRuns,
} from "@/lib/tools/operations";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const requestedLimit = Number.parseInt(url.searchParams.get("limit") || "50", 10);
  const limit = Number.isFinite(requestedLimit) ? requestedLimit : 50;

  return NextResponse.json({
    summary: getToolOperationsSummary(),
    runs: listToolRuns(limit),
  });
}
