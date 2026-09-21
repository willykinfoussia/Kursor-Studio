import type { JsonSchemaObject } from "../ToolRegistry";

export function toolSchema(
  properties: JsonSchemaObject["properties"],
  required: string[] = [],
): JsonSchemaObject {
  return {
    type: "object",
    properties,
    required,
    additionalProperties: false,
  };
}

export function asRecord(input: unknown): Record<string, unknown> {
  return input && typeof input === "object" && !Array.isArray(input)
    ? input as Record<string, unknown>
    : {};
}

export function validateToolInput(
  schema: JsonSchemaObject,
  input: unknown,
): { ok: true; value: Record<string, unknown> } | { ok: false; message: string } {
  if (input === undefined) {
    input = {};
  }
  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    return { ok: false, message: "Tool input must be an object." };
  }
  const value = input as Record<string, unknown>;
  const properties = schema.properties ?? {};
  if (schema.additionalProperties === false) {
    for (const key of Object.keys(value)) {
      if (!(key in properties)) {
        return { ok: false, message: `Unexpected property "${key}".` };
      }
    }
  }
  for (const key of schema.required ?? []) {
    const current = value[key];
    if (current === undefined || current === null) {
      return { ok: false, message: `Missing required property "${key}".` };
    }
  }
  for (const [key, spec] of Object.entries(properties)) {
    const current = value[key];
    if (current === undefined) continue;
    const expected = spec?.type;
    if (!expected) continue;
    if (!matchesSchemaType(expected, current)) {
      return { ok: false, message: `Property "${key}" must be a ${Array.isArray(expected) ? expected.join(" | ") : expected}.` };
    }
  }
  return { ok: true, value };
}

function matchesSchemaType(type: string | string[], value: unknown): boolean {
  if (Array.isArray(type)) return type.some((item) => matchesSchemaType(item, value));
  if (typeof type !== "string") return true;
  if (type === "string") return typeof value === "string";
  if (type === "number") return typeof value === "number" && Number.isFinite(value);
  if (type === "boolean") return typeof value === "boolean";
  if (type === "object") return Boolean(value) && typeof value === "object" && !Array.isArray(value);
  if (type === "array") return Array.isArray(value);
  return true;
}
