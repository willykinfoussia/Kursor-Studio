export function parseFrontmatter(raw: string): { data: Record<string, unknown>; body: string } {
  const trimmed = raw.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n");
  if (!trimmed.startsWith("---")) {
    return { data: {}, body: trimmed.trim() };
  }
  const end = trimmed.indexOf("\n---", 3);
  if (end < 0) {
    return { data: {}, body: trimmed.slice(3).trim() };
  }
  const front = trimmed.slice(3, end).trim();
  const body = trimmed.slice(end + 4).trim();
  return { data: parseSimpleYaml(front), body };
}

export function parseSimpleYaml(text: string): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  const lines = text.split("\n");
  let index = 0;
  while (index < lines.length) {
    const line = lines[index] ?? "";
    if (!line.trim() || line.trimStart().startsWith("#")) {
      index += 1;
      continue;
    }
    const match = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line);
    if (!match) {
      index += 1;
      continue;
    }
    const key = match[1] ?? "";
    const rest = (match[2] ?? "").trim();
    if (!rest) {
      const nested = readNested(lines, index + 1);
      data[key] = nested.value;
      index = nested.next;
      continue;
    }
    data[key] = parseValue(rest);
    index += 1;
  }
  return data;
}

function readNested(lines: string[], start: number): { value: unknown; next: number } {
  const first = lines[start] ?? "";
  if (/^\s*-\s+/.test(first)) {
    const items: unknown[] = [];
    let index = start;
    while (index < lines.length) {
      const line = lines[index] ?? "";
      const item = /^\s*-\s+(.*)$/.exec(line);
      if (!item) break;
      items.push(parseValue(item[1] ?? ""));
      index += 1;
    }
    return { value: items, next: index };
  }
  const object: Record<string, unknown> = {};
  let index = start;
  while (index < lines.length) {
    const line = lines[index] ?? "";
    const match = /^\s{2,}([A-Za-z0-9_-]+):\s*(.*)$/.exec(line);
    if (!match) break;
    object[match[1] ?? ""] = parseValue((match[2] ?? "").trim());
    index += 1;
  }
  return { value: object, next: index };
}

function parseValue(raw: string): unknown {
  const value = raw.trim();
  if (!value) return "";
  if (value === "null" || value === "~") return null;
  if (value === "true") return true;
  if (value === "false") return false;
  if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  if (value.startsWith("[") && value.endsWith("]")) {
    const inner = value.slice(1, -1).trim();
    if (!inner) return [];
    return inner.split(",").map((part) => parseValue(part));
  }
  if (value.startsWith("{") && value.endsWith("}")) {
    const inner = value.slice(1, -1).trim();
    if (!inner) return {};
    const object: Record<string, unknown> = {};
    for (const part of splitInline(inner)) {
      const colon = part.indexOf(":");
      if (colon < 0) continue;
      object[part.slice(0, colon).trim()] = parseValue(part.slice(colon + 1));
    }
    return object;
  }
  if (/^-?\d+(\.\d+)?$/.test(value)) return Number(value);
  return value;
}

function splitInline(inner: string): string[] {
  const parts: string[] = [];
  let current = "";
  let depth = 0;
  for (const char of inner) {
    if (char === "," && depth === 0) {
      parts.push(current);
      current = "";
      continue;
    }
    if (char === "{") depth += 1;
    if (char === "}") depth -= 1;
    current += char;
  }
  if (current.trim()) parts.push(current);
  return parts;
}

export function asString(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  return null;
}

export function asStringList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => asString(item)).filter((item): item is string => Boolean(item));
  }
  if (typeof value === "string" && value.trim()) return [value.trim()];
  return [];
}

export function asBoolean(value: unknown, fallback = true): boolean {
  if (typeof value === "boolean") return value;
  if (value === "false" || value === false) return false;
  if (value === "true" || value === true) return true;
  return fallback;
}
