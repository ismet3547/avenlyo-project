import { NextResponse } from "next/server";
import { readData } from "@/lib/store";
import {
  contextFromRetrieved,
  retrieveKnowledgeForAgent,
  sourcesFromRetrieved,
} from "@/lib/rag/retrieve";
import {
  createConversation,
  deleteLastAssistantMessage,
  getConversation,
  insertConversationMessage,
  latestUserMessage,
  listConversationMessages,
  touchConversationTitle,
} from "@/lib/chat/store";
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

function retrievalGuidance(
  confidence: "high" | "medium" | "low" | "none",
  hasKnowledge: boolean,
) {
  if (!hasKnowledge || confidence === "none") {
    return [
      "Bu sorgu için yüklenen belgelerde yeterince ilgili bir kaynak bulunamadı.",
      "İşletme bağlamında açıkça bulunmayan işletmeye özel fiyat, politika, süre veya koşulları tahmin etme.",
      "Gerekirse bilginin mevcut kaynaklarda bulunmadığını açıkça söyle.",
    ].join(" ");
  }

  if (confidence === "low") {
    return [
      "Getirilen bilgi tabanı bağlamının güven seviyesi düşük.",
      "Kaynak açıkça desteklemiyorsa kesin işletme bilgisi verme ve tahmin etme.",
    ].join(" ");
  }

  return "Getirilen bilgi tabanı parçalarını yalnızca destekledikleri iddialar için kullan.";
}

function eventData(block: string) {
  return block
    .split("\n")
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trimStart())
    .join("\n");
}

function streamLine(value: unknown) {
  return `${JSON.stringify(value)}\n`;
}

export async function POST(request: Request) {
  const body = (await request.json()) as {
    agentId?: unknown;
    message?: unknown;
    conversationId?: unknown;
    regenerate?: unknown;
  };

  const agentId = typeof body.agentId === "string" ? body.agentId : "";
  const requestedMessage =
    typeof body.message === "string" ? body.message.trim() : "";
  const requestedConversationId =
    typeof body.conversationId === "string" ? body.conversationId : "";
  const regenerate = body.regenerate === true;

  if (!agentId || (!requestedMessage && !regenerate)) {
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

  let conversation = requestedConversationId
    ? getConversation(requestedConversationId)
    : null;

  if (conversation && conversation.agentId !== agent.id) {
    return NextResponse.json(
      { error: "Bu sohbet seçilen ajana ait değil." },
      { status: 403 },
    );
  }

  if (requestedConversationId && !conversation) {
    return NextResponse.json({ error: "Sohbet bulunamadı." }, { status: 404 });
  }

  let message = requestedMessage;
  let history: ChatMessage[] = [];
  let userMessage: ChatMessage | null = null;

  if (regenerate) {
    if (!conversation) {
      return NextResponse.json(
        { error: "Yeniden oluşturmak için bir sohbet gerekli." },
        { status: 400 },
      );
    }

    deleteLastAssistantMessage(conversation.id);
    userMessage = latestUserMessage(conversation.id);

    if (!userMessage) {
      return NextResponse.json(
        { error: "Yeniden oluşturulacak kullanıcı mesajı bulunamadı." },
        { status: 400 },
      );
    }

    message = userMessage.content;
    const existing = listConversationMessages(conversation.id);
    history = existing.slice(0, -1).slice(-12);
  } else {
    if (!conversation) {
      conversation = createConversation(agent.id, message);
    }

    history = listConversationMessages(conversation.id).slice(-12);
    userMessage = insertConversationMessage({
      conversationId: conversation.id,
      role: "user",
      content: message,
    });
    touchConversationTitle(conversation.id, message);
    conversation = getConversation(conversation.id) ?? conversation;
  }

  const retrieval = await retrieveKnowledgeForAgent(agent.id, message);
  const retrieved = retrieval.items;
  const ragContext = contextFromRetrieved(retrieved);
  const sources = sourcesFromRetrieved(retrieved);
  const business = businessContext(data.business);
  const debugEnabled = process.env.AVENLYO_RAG_DEBUG === "true";

  const instructions = [
    `Sen "${agent.name}" adlı bir yapay zeka ajanısın.`,
    agent.role && `Rolün: ${agent.role}`,
    agent.goal && `Ana hedefin: ${agent.goal}`,
    agent.instructions && `Özel talimatlar:\n${agent.instructions}`,
    "Yanıt dilini kullanıcının diline uyarla.",
    "Yanıtı okunabilir Markdown ile yazabilirsin; gereksiz başlık ve süsleme kullanma.",
    "Sağlanan işletme bağlamını ve bilgi tabanı kaynaklarını temel al. Kaynaklarda bulunmayan özel işletme bilgilerini uydurma.",
    "Bilgi tabanı parçaları arasında çelişki varsa bunu açıkça belirt.",
    retrievalGuidance(retrieval.confidence, retrieved.length > 0),
    business && `\nİŞLETME BAĞLAMI\n${business}`,
    ragContext && `\nBİLGİ TABANI BAĞLAMI\n${ragContext}`,
  ]
    .filter(Boolean)
    .join("\n\n");

  const abortController = new AbortController();
  const timeout = setTimeout(() => abortController.abort(), 90_000);
  request.signal.addEventListener("abort", () => abortController.abort(), {
    once: true,
  });

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
      stream: true,
      store: false,
    }),
    signal: abortController.signal,
  });

  if (!response.ok || !response.body) {
    clearTimeout(timeout);
    let apiMessage = "OpenAI isteği başarısız oldu.";

    try {
      const payload = (await response.json()) as {
        error?: { message?: string };
      };
      apiMessage = payload.error?.message || apiMessage;
    } catch {
      // Keep the generic message.
    }

    return NextResponse.json(
      { error: apiMessage },
      { status: response.status || 502 },
    );
  }

  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  const output = new ReadableStream<Uint8Array>({
    async start(controller) {
      let assistantText = "";
      let buffer = "";

      const push = (value: unknown) => {
        controller.enqueue(encoder.encode(streamLine(value)));
      };

      push({
        type: "meta",
        conversation,
        userMessage,
        sources,
        debug: debugEnabled ? retrieval.debug : undefined,
        confidence: retrieval.confidence,
      });

      try {
        const reader = response.body!.getReader();

        while (true) {
          const { value, done } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });

          let boundary = buffer.indexOf("\n\n");
          while (boundary !== -1) {
            const block = buffer.slice(0, boundary);
            buffer = buffer.slice(boundary + 2);
            boundary = buffer.indexOf("\n\n");

            const raw = eventData(block);
            if (!raw || raw === "[DONE]") continue;

            let event: {
              type?: string;
              delta?: string;
              error?: { message?: string };
            };

            try {
              event = JSON.parse(raw);
            } catch {
              continue;
            }

            if (
              event.type === "response.output_text.delta" &&
              typeof event.delta === "string"
            ) {
              assistantText += event.delta;
              push({ type: "delta", delta: event.delta });
            } else if (event.type === "error") {
              throw new Error(
                event.error?.message || "Model yanıtı sırasında hata oluştu.",
              );
            }
          }
        }

        if (!assistantText.trim()) {
          throw new Error("Model boş bir yanıt döndürdü.");
        }

        const assistantMessage = insertConversationMessage({
          conversationId: conversation!.id,
          role: "assistant",
          content: assistantText,
          sources,
          debug: debugEnabled ? retrieval.debug : undefined,
        });

        push({
          type: "done",
          message: assistantMessage,
          conversation: getConversation(conversation!.id) ?? conversation,
          confidence: retrieval.confidence,
        });
      } catch (error) {
        if (!request.signal.aborted) {
          push({
            type: "error",
            error:
              error instanceof Error
                ? error.message
                : "Yanıt sırasında bir hata oluştu.",
          });
        }
      } finally {
        clearTimeout(timeout);
        controller.close();
      }
    },
  });

  return new Response(output, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
