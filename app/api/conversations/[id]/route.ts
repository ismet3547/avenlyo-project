import { NextResponse } from "next/server";
import {
  deleteConversation,
  getConversation,
  listConversationMessages,
} from "@/lib/chat/store";

export const runtime = "nodejs";

type Context = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, { params }: Context) {
  const { id } = await params;
  const conversation = getConversation(id);

  if (!conversation) {
    return NextResponse.json({ error: "Sohbet bulunamadı." }, { status: 404 });
  }

  return NextResponse.json({
    conversation,
    messages: listConversationMessages(id),
  });
}

export async function DELETE(_request: Request, { params }: Context) {
  const { id } = await params;
  const deleted = deleteConversation(id);

  if (!deleted) {
    return NextResponse.json({ error: "Sohbet bulunamadı." }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
