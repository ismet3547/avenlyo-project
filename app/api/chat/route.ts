import { NextResponse } from "next/server";
import { readData } from "@/lib/store";
import {
  contextFromRetrieved,
  retrieveKnowledgeForAgent,
  sourcesFromRetrieved,
} from "@/lib/rag/retrieve";
import type { ChatMessage } from "@/lib/types";

export const runtime = "nodejs";

function businessContext(business: Awaited<ReturnType<typeof readData>>["business"]) {
  return [
    ["İşletme", business.name],
    ["Sektör", business.industry],
    ["İşletme açıklaması", business.description],
    ["Hedef kitle", business.audience],
    ["İletişim tonu", business.tone],
    ["Ürün / hizmetler", business.offer],
    ["Sık sorulan sorular", business.faq],
    ["Ek bilgi tabanı", business.knowledge],
  ]
    .filter(([, value]) => value.trim())
    .map(([label, value]) => `${label}: ${value}`)
    .join("\n");
}

function extractText(payload: Record<string, unknown>) {
  if (typeof payload.output_text === "string") return payload.output_text;

  const output = Array.isArray(payload.output) ? payload.output : [];
  const chunks: string[] = [];

  for (const item of output) {
    if (!item || typeof item !== "object") continue;
    const content = Array.isArray((item as { content?: unknown }).content)
      ? ((item as { content: unknown[] }).content)
      : [];

    for (const part of content) {
      if (!part || typeof part !== "object") continue;
      const maybeText = (part as { text?: unknown }).text;
      if (typeof maybeText === "string") chunks.push(maybeText);
    }
  }

  return chunks.join("\n").trim();
}

export async function POST(request: Request) {
  const body = (await request.json()) as {
    agentId?: unknown;
    message?: unknown;
    history?: unknown;
  };

  const agentId = typeof body.agentId === "string" ? body.agentId : "";
  const message = typeof body.message === "string" ? body.message.trim() : "";

  if (!agentId || !message) {
    return NextResponse.json(
      { error: "Ajan ve mesaj gerekli." },
      { status: 400 },
    );
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      {
        error:
          "OPENAI_API_KEY tanımlı değil. .env.local dosyanıza anahtarınızı ekleyin.",
      },
      { status: 500 },
    );
  }

  const data = await readData();
  const agent = data.agents.find((item) => item.id === agentId);

  if (!agent) {
    return NextResponse.json({ error: "Ajan bulunamadı." }, { status: 404 });
  }

  const history = Array.isArray(body.history)
    ? (body.history as ChatMessage[])
        .filter(
          (item) =>
            item &&
            (item.role === "user" || item.role === "assistant") &&
            typeof item.content === "string",
        )
        .slice(-8)
    : [];

  const retrieved = await retrieveKnowledgeForAgent(agent.id, message);
  const ragContext = contextFromRetrieved(retrieved);
  const business = businessContext(data.business);

  const instructions = [
    `Sen "${agent.name}" adlı bir yapay zeka ajanısın.`,
    agent.role && `Rolün: ${agent.role}`,
    agent.goal && `Ana hedefin: ${agent.goal}`,
    agent.instructions && `Özel talimatlar:\n${agent.instructions}`,
    "Yanıt dilini kullanıcının diline uyarla.",
    "Sağlanan işletme bağlamını ve bilgi tabanı kaynaklarını temel al. Bu kaynaklarda bulunmayan özel işletme bilgilerini uydurma.",
    "Bilgi tabanı parçaları arasında çelişki varsa bunu açıkça belirt. Yeterli bilgi yoksa eksik olduğunu dürüstçe söyle.",
    business && `\nİŞLETME BAĞLAMI\n${business}`,
    ragContext && `\nBİLGİ TABANI BAĞLAMI\n${ragContext}`,
  ]
    .filter(Boolean)
    .join("\n\n");

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: agent.model || process.env.OPENAI_MODEL || "gpt-6-luna",
      instructions,
      input: [
        ...history.map((item) => ({
          role: item.role,
          content: item.content,
        })),
        { role: "user", content: message },
      ],
    }),
    signal: AbortSignal.timeout(90_000),
  });

  const payload = (await response.json()) as Record<string, unknown>;

  if (!response.ok) {
    const errorObject =
      payload.error && typeof payload.error === "object"
        ? (payload.error as { message?: unknown })
        : null;
    const apiMessage =
      errorObject && typeof errorObject.message === "string"
        ? errorObject.message
        : "OpenAI isteği başarısız oldu.";

    return NextResponse.json({ error: apiMessage }, { status: response.status });
  }

  const reply = extractText(payload);
  if (!reply) {
    return NextResponse.json(
      { error: "Model boş bir yanıt döndürdü." },
      { status: 502 },
    );
  }

  return NextResponse.json({
    reply,
    sources: sourcesFromRetrieved(retrieved),
  });
}
