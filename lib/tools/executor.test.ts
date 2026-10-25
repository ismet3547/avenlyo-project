import { describe, expect, it } from "vitest";
import { executeRegisteredTool } from "./executor";
import { getRegisteredTool } from "./registry";

describe("lookup_order executor", () => {
  it("returns a minimal local order result", async () => {
    const definition = getRegisteredTool("lookup_order");
    expect(definition).not.toBeNull();

    const result = await executeRegisteredTool({
      definition: definition!,
      arguments: { order_id: "ORD-4582" },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.result).toEqual({
      order_id: "ORD-4582",
      status: "Kargoya verildi",
      tracking_status: "Transfer merkezinde",
    });
  });

  it("returns a safe not-found result without inventing order data", async () => {
    const definition = getRegisteredTool("lookup_order")!;

    const result = await executeRegisteredTool({
      definition,
      arguments: { order_id: "ORD-DOES-NOT-EXIST" },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.result).toEqual({
      order_id: "ORD-DOES-NOT-EXIST",
      status: "Bulunamadı",
      tracking_status: null,
    });
  });
});
