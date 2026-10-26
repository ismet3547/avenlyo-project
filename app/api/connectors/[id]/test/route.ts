import { NextResponse } from "next/server";
import {
  connectorSetupMetadata,
  testConnector,
} from "@/lib/connectors/service";

export const runtime = "nodejs";

type Context = {
  params: Promise<{ id: string }>;
};

export async function POST(_request: Request, { params }: Context) {
  const { id } = await params;
  const metadata = connectorSetupMetadata(id);

  if (!metadata) {
    return NextResponse.json(
      { error: "Connector bulunamadı." },
      { status: 404 },
    );
  }

  const result = await testConnector(id);
  return NextResponse.json(result, {
    status: result.ok ? 200 : 422,
  });
}
