import { describe, expect, it } from "vitest";
import { getRegisteredTool, toCatalogItem } from "./registry";

describe("tool registry strict schemas", () => {
  it("emits OpenAI strict-compatible JSON Schema", () => {
    const tool = getRegisteredTool("lookup_order");
    expect(tool).not.toBeNull();

    const catalog = toCatalogItem(tool!);
    expect(catalog.inputSchema.type).toBe("object");
    expect(catalog.inputSchema.additionalProperties).toBe(false);
    expect(catalog.inputSchema.required).toEqual(["order_id"]);
  });

  it("rejects unknown properties at runtime", () => {
    const tool = getRegisteredTool("lookup_order");
    expect(tool).not.toBeNull();

    const parsed = tool!.inputSchema.safeParse({
      order_id: "ORD-4582",
      url: "http://127.0.0.1/admin",
    });

    expect(parsed.success).toBe(false);
  });

  it("keeps nullable write fields required for strict mode", () => {
    const tool = getRegisteredTool("create_crm_contact");
    expect(tool).not.toBeNull();

    const catalog = toCatalogItem(tool!);
    const required = catalog.inputSchema.required as string[];

    expect(required).toEqual(["name", "phone", "email", "notes"]);
    expect(catalog.inputSchema.additionalProperties).toBe(false);
  });
});
