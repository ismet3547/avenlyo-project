type ResponseOutputItem = Record<string, unknown> & {
  type?: string;
  call_id?: string;
  name?: string;
  arguments?: string;
};

type ResponseCompletedEvent = {
  type?: string;
  response?: {
    output?: ResponseOutputItem[];
  };
  delta?: string;
  error?: { message?: string };
};

function eventData(block: string) {
  return block
    .split("\n")
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trimStart())
    .join("\n");
}

async function responseError(response: Response) {
  let message = "OpenAI isteği başarısız oldu.";
  try {
    const payload = (await response.json()) as {
      error?: { message?: string };
    };
    message = payload.error?.message || message;
  } catch {
    // Keep the generic error.
  }
  return new Error(message);
}

export async function streamResponsesTurn(input: {
  apiKey: string;
  model: string;
  instructions: string;
  items: unknown[];
  tools: unknown[];
  signal: AbortSignal;
  onTextDelta: (delta: string) => void;
}) {
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: input.model,
      instructions: input.instructions,
      input: input.items,
      ...(input.tools.length
        ? {
            tools: input.tools,
            tool_choice: "auto",
            parallel_tool_calls: false,
          }
        : {}),
      stream: true,
      store: false,
    }),
    signal: input.signal,
  });

  if (!response.ok || !response.body) {
    throw await responseError(response);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let text = "";
  let outputItems: ResponseOutputItem[] = [];

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    buffer = buffer.replace(/\r\n/g, "\n");

    let boundary = buffer.indexOf("\n\n");
    while (boundary !== -1) {
      const block = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      boundary = buffer.indexOf("\n\n");

      const raw = eventData(block);
      if (!raw || raw === "[DONE]") continue;

      let event: ResponseCompletedEvent;
      try {
        event = JSON.parse(raw) as ResponseCompletedEvent;
      } catch {
        continue;
      }

      if (
        event.type === "response.output_text.delta" &&
        typeof event.delta === "string"
      ) {
        text += event.delta;
        input.onTextDelta(event.delta);
      } else if (event.type === "response.completed") {
        outputItems = Array.isArray(event.response?.output)
          ? event.response.output
          : [];
      } else if (
        event.type === "error" ||
        event.type === "response.failed" ||
        event.type === "response.incomplete"
      ) {
        throw new Error(
          event.error?.message || "Model yanıtı sırasında hata oluştu.",
        );
      }
    }
  }

  const functionCalls = outputItems
    .filter(
      (
        item,
      ): item is ResponseOutputItem & {
        type: "function_call";
        call_id: string;
        name: string;
        arguments: string;
      } =>
        item.type === "function_call" &&
        typeof item.call_id === "string" &&
        typeof item.name === "string" &&
        typeof item.arguments === "string",
    )
    .map((item) => ({
      callId: item.call_id,
      name: item.name,
      arguments: item.arguments,
    }));

  return {
    text,
    outputItems,
    functionCalls,
  };
}
