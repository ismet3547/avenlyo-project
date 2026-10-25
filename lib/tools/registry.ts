import * as z from "zod";
import { toStrictJsonSchema } from "./schemas";
import type { ToolCatalogItem, ToolDefinition } from "./types";

const lookupOrderInput = z.strictObject({
  order_id: z
    .string()
    .trim()
    .min(1)
    .max(64)
    .regex(/^[A-Za-z0-9_-]+$/, "Sipariş numarası geçersiz.")
    .meta({
      description: "Sipariş numarası. Örnek: ORD-4582",
    }),
});

const lookupOrderOutput = z.strictObject({
  order_id: z.string(),
  status: z.string(),
  tracking_status: z.string().nullable(),
});

const createCrmContactInput = z.strictObject({
  name: z.string().trim().min(1).max(160),
  phone: z.string().trim().min(3).max(40).nullable(),
  email: z.string().trim().email().max(254).nullable(),
  notes: z.string().trim().max(1000).nullable(),
});

const createCrmContactOutput = z.strictObject({
  contact_id: z.string(),
  name: z.string(),
  created: z.boolean(),
});

const definitions: ToolDefinition[] = [
  {
    id: "builtin.lookup_order",
    name: "lookup_order",
    displayName: "Sipariş sorgula",
    description:
      "Sipariş numarasına göre sipariş durumunu sorgular. Yalnızca okuma yapar.",
    kind: "local",
    riskLevel: "read",
    approvalPolicy: "never",
    inputSchema: lookupOrderInput,
    outputSchema: lookupOrderOutput,
    config: {
      executor: "local",
      resultAllowlist: ["order_id", "status", "tracking_status"],
    },
  },
  {
    id: "builtin.create_crm_contact",
    name: "create_crm_contact",
    displayName: "CRM müşterisi oluştur",
    description:
      "Yerel CRM'de yeni müşteri kaydı oluşturur. Veri yazdığı için kullanıcı onayı gerektirir.",
    kind: "local",
    riskLevel: "write",
    approvalPolicy: "always",
    inputSchema: createCrmContactInput,
    outputSchema: createCrmContactOutput,
    config: {
      executor: "planned",
      resultAllowlist: ["contact_id", "name", "created"],
    },
  },
];

const byId = new Map(definitions.map((tool) => [tool.id, tool]));
const byName = new Map(definitions.map((tool) => [tool.name, tool]));

export function listRegisteredTools() {
  return [...definitions];
}

export function getRegisteredTool(identifier: string) {
  return byId.get(identifier) ?? byName.get(identifier) ?? null;
}

export function toCatalogItem(
  definition: ToolDefinition,
  state: { enabled?: boolean; builtin?: boolean } = {},
): ToolCatalogItem {
  return {
    id: definition.id,
    name: definition.name,
    displayName: definition.displayName,
    description: definition.description,
    kind: definition.kind,
    riskLevel: definition.riskLevel,
    approvalPolicy: definition.approvalPolicy,
    inputSchema: toStrictJsonSchema(definition.inputSchema),
    outputSchema: definition.outputSchema
      ? toStrictJsonSchema(definition.outputSchema)
      : null,
    enabled: state.enabled ?? true,
    builtin: state.builtin ?? true,
    executionReady: definition.config.executor !== "planned",
  };
}
