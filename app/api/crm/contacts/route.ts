import { NextResponse } from "next/server";
import { listCrmContacts } from "@/lib/tools/operations";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const requestedLimit = Number.parseInt(url.searchParams.get("limit") || "100", 10);
  const limit = Number.isFinite(requestedLimit) ? requestedLimit : 100;

  return NextResponse.json({
    contacts: listCrmContacts(limit),
  });
}
