import { afterEach, describe, expect, it, vi } from "vitest";
import { streamResponsesTurn } from "./responses";

function sseResponse(events: unknown[]) {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const event of events) {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(event)}\n\n`),
        );
      }
      controller.close();
    },
  });

  return new Response(body, {
    status: 200,
    headers: { "Content-Type": "text/event-stream" },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Responses streaming helper", () => {
  it("collects text deltas", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        sseResponse([
          { type: "response.output_text.delta", delta: "Merhaba " },
          { type: "response.output_text.delta", delta: "dünya" },
          { type: "response.completed", response: { output: [] } },
        ]),
      ),
    );

    let streamed = "";
    const result = await streamResponsesTurn({
      apiKey: "test",
      model: "gpt-test",
      instructions: "test",
      items: [{ role: "user", content: "test" }],
      tools: [],
      signal: new AbortController().signal,
      onTextDelta(delta) {
        streamed += delta;
      },
    });

    expect(streamed).toBe("Merhaba dünya");
    expect(result.text).toBe("Merhaba dünya");
    expect(result.functionCalls).toEqual([]);
  });

  it("collects function calls from response.completed output", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        sseResponse([
          {
            type: "response.completed",
            response: {
              output: [
                {
                  type: "function_call",
                  id: "fc_1",
                  call_id: "call_1",
                  name: "lookup_order",
                  arguments: "{\"order_id\":\"ORD-4582\"}",
                },
              ],
            },
          },
        ]),
      ),
    );

    const result = await streamResponsesTurn({
      apiKey: "test",
      model: "gpt-test",
      instructions: "test",
      items: [{ role: "user", content: "Sipariş nerede?" }],
      tools: [{ type: "function", name: "lookup_order" }],
      signal: new AbortController().signal,
      onTextDelta() {},
    });

    expect(result.functionCalls).toEqual([
      {
        callId: "call_1",
        name: "lookup_order",
        arguments: "{\"order_id\":\"ORD-4582\"}",
      },
    ]);
    expect(result.outputItems).toHaveLength(1);
  });
});
