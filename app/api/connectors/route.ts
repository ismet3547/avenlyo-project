import { NextResponse } from "next/server";
import { getConnectorCatalog } from "@/lib/connectors/service";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({
    connectors: getConnectorCatalog(),
  });
}
