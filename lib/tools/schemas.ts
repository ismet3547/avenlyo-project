import * as z from "zod";

function checkStrictObjectSchema(
  schema: unknown,
  path: string,
  issues: string[],
) {
  if (!schema || typeof schema !== "object") return;

  const node = schema as Record<string, unknown>;

  if (node.type === "object") {
    if (node.additionalProperties !== false) {
      issues.push(`${path}: additionalProperties must be false`);
    }

    const properties =
      node.properties && typeof node.properties === "object"
        ? Object.keys(node.properties as Record<string, unknown>)
        : [];
    const required = Array.isArray(node.required)
      ? node.required.filter((item): item is string => typeof item === "string")
      : [];

    for (const property of properties) {
      if (!required.includes(property)) {
        issues.push(`${path}: property "${property}" must be required`);
      }
    }
  }

  for (const key of ["properties", "$defs"]) {
    const value = node[key];
    if (!value || typeof value !== "object") continue;

    for (const [childKey, child] of Object.entries(
      value as Record<string, unknown>,
    )) {
      checkStrictObjectSchema(child, `${path}.${key}.${childKey}`, issues);
    }
  }

  for (const key of ["items", "anyOf", "oneOf", "allOf"]) {
    const value = node[key];
    if (Array.isArray(value)) {
      value.forEach((child, index) =>
        checkStrictObjectSchema(child, `${path}.${key}[${index}]`, issues),
      );
    } else if (value && typeof value === "object") {
      checkStrictObjectSchema(value, `${path}.${key}`, issues);
    }
  }
}

export function toStrictJsonSchema(schema: z.ZodType) {
  const generated = z.toJSONSchema(schema, {
    target: "draft-07",
    unrepresentable: "throw",
  }) as Record<string, unknown>;

  const { $schema: _schemaVersion, ...jsonSchema } = generated;
  const issues: string[] = [];
  checkStrictObjectSchema(jsonSchema, "$", issues);

  if (issues.length) {
    throw new Error(
      `Tool schema is not compatible with OpenAI strict mode: ${issues.join("; ")}`,
    );
  }

  return jsonSchema;
}

export function formatZodIssues(error: z.ZodError) {
  return error.issues.map((issue) => ({
    path: issue.path.join("."),
    message: issue.message,
  }));
}
