import { isPlanStatus, isPlanTodoStatus, type PlanDocument, type PlanStatus, type PlanTodo } from "./types";

export const PLAN_DIR = ".kursor/plans";
export const PLAN_SUFFIX = ".plan.md";
const LEGACY_PLAN_DIR = "docs/superpowers/plans/";

export function normalizePlanPath(path: string): string {
  return path.replace(/\\/g, "/").replace(/^\.\//, "");
}

export function isPlanFilePath(path: string): boolean {
  const normalized = normalizePlanPath(path);
  return normalized.startsWith(`${PLAN_DIR}/`) && normalized.endsWith(PLAN_SUFFIX);
}

/** Legacy Superpowers plans still count as plan documents for gates/approvals. */
export function isPlanDocumentPath(path: string): boolean {
  const normalized = normalizePlanPath(path);
  return normalized.includes(`${PLAN_DIR}/`) || normalized.includes(LEGACY_PLAN_DIR);
}

export function slugifyPlanName(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return slug || "plan";
}

export function uniquePlanSlug(name: string): string {
  const base = slugifyPlanName(name);
  const suffix = Math.random().toString(16).slice(2, 8);
  return `${base}_${suffix}`;
}

export function planPathFor(slug: string): string {
  const clean = slug.replace(/\\/g, "/").replace(/^\/+/, "").replace(/\.plan\.md$/, "");
  return `${PLAN_DIR}/${clean}${PLAN_SUFFIX}`;
}

function yamlEscape(value: string): string {
  if (!value) return `""`;
  if (/^[A-Za-z0-9 _/.,:;!?()'-]+$/.test(value) && !/^\s|\s$/.test(value) && !value.includes('"')) {
    return value;
  }
  return JSON.stringify(value);
}

function yamlUnquote(raw: string): string {
  const value = raw.trim();
  if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) {
    try {
      return JSON.parse(value) as string;
    } catch {
      return value.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, "\\");
    }
  }
  if (value.length >= 2 && value.startsWith("'") && value.endsWith("'")) {
    return value.slice(1, -1).replace(/''/g, "'");
  }
  return value;
}

function scalarFromFrontmatter(front: string, key: string): string | null {
  const match = new RegExp(`^${key}:\\s*(.*)$`, "m").exec(front);
  if (!match) return null;
  const rest = (match[1] ?? "").trim();
  if (!rest) return null;
  return yamlUnquote(rest);
}

function numberFromFrontmatter(front: string, key: string): number | null {
  const raw = scalarFromFrontmatter(front, key);
  if (!raw) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseInlineTodoObject(rest: string): Omit<PlanTodo, "id"> & { id?: string } | null {
  const trimmed = rest.trim();
  if (!trimmed.startsWith("{") || !trimmed.endsWith("}")) return null;
  const inner = trimmed.slice(1, -1);
  const result: Record<string, string> = {};
  let current = "";
  let inString: string | null = null;
  let escaped = false;
  const parts: string[] = [];
  for (const char of inner) {
    if (inString) {
      current += char;
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === inString) {
        inString = null;
      }
      continue;
    }
    if (char === '"' || char === "'") {
      inString = char;
      current += char;
      continue;
    }
    if (char === ",") {
      parts.push(current);
      current = "";
      continue;
    }
    current += char;
  }
  if (current.trim()) parts.push(current);
  for (const part of parts) {
    const colon = part.indexOf(":");
    if (colon < 0) continue;
    const key = part.slice(0, colon).trim();
    const value = part.slice(colon + 1).trim();
    if (key) result[key] = yamlUnquote(value);
  }
  if (!result.content) return null;
  return {
    ...(result.id ? { id: result.id } : {}),
    content: result.content,
    status: isPlanTodoStatus(result.status) ? result.status : "pending",
  };
}

function parseTodosBlock(front: string): PlanTodo[] {
  const todos: PlanTodo[] = [];
  const lines = front.split("\n");
  const start = lines.findIndex((line) => /^todos:\s*(\[\s*\])?\s*$/.test(line.trim()));
  if (start < 0) return todos;
  let index = start + 1;
  let counter = 0;
  const nextId = () => {
    counter += 1;
    return `todo-${counter}`;
  };
  while (index < lines.length) {
    const line = lines[index] ?? "";
    if (!line.trim()) {
      index += 1;
      continue;
    }
    const item = /^\s*-\s+(.*)$/.exec(line);
    if (!item) break;
    const rest = (item[1] ?? "").trim();
    const inline = parseInlineTodoObject(rest);
    if (inline) {
      todos.push({ id: inline.id || nextId(), content: inline.content, status: inline.status });
      index += 1;
      continue;
    }
    // Multi-line form:
    //   - id: "todo-1"
    //     content: "Do X"
    //     status: pending
    const fields: Record<string, string> = {};
    const firstField = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(rest);
    if (firstField?.[1]) fields[firstField[1]] = yamlUnquote(firstField[2] ?? "");
    index += 1;
    while (index < lines.length) {
      const continuation = lines[index] ?? "";
      if (/^\s*-\s+/.test(continuation)) break;
      const field = /^\s{2,}([A-Za-z0-9_-]+):\s*(.*)$/.exec(continuation);
      if (!field?.[1]) break;
      fields[field[1]] = yamlUnquote(field[2] ?? "");
      index += 1;
    }
    if (!fields.content) continue;
    todos.push({
      id: fields.id || nextId(),
      content: fields.content,
      status: isPlanTodoStatus(fields.status) ? fields.status : "pending",
    });
  }
  return todos;
}

export function splitPlanFrontmatter(raw: string): { front: string; body: string } {
  const normalized = raw.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n");
  if (!normalized.startsWith("---")) return { front: "", body: normalized.trim() };
  const end = normalized.indexOf("\n---", 3);
  if (end < 0) return { front: "", body: normalized.slice(3).trim() };
  return { front: normalized.slice(3, end).trim(), body: normalized.slice(end + 4).trim() };
}

export function parsePlanFile(raw: string, fallbackPath: string): PlanDocument {
  const { front, body } = splitPlanFrontmatter(raw);
  const path = normalizePlanPath(fallbackPath);
  const fileName = path.split("/").pop() ?? path;
  const slug = fileName.endsWith(PLAN_SUFFIX) ? fileName.slice(0, -PLAN_SUFFIX.length) : fileName.replace(/\.md$/, "");
  const statusRaw = scalarFromFrontmatter(front, "status");
  const status: PlanStatus = isPlanStatus(statusRaw) ? statusRaw : "draft";
  const now = Date.now();
  return {
    id: scalarFromFrontmatter(front, "id") || path,
    slug: scalarFromFrontmatter(front, "slug") || slug,
    path,
    name: scalarFromFrontmatter(front, "name") || slug,
    overview: scalarFromFrontmatter(front, "overview") || "",
    body,
    todos: parseTodosBlock(front),
    status,
    createdAt: numberFromFrontmatter(front, "createdAt") ?? now,
    updatedAt: numberFromFrontmatter(front, "updatedAt") ?? now,
  };
}

export function serializePlanFile(plan: PlanDocument): string {
  const lines: string[] = [
    "---",
    `id: ${yamlEscape(plan.id)}`,
    `slug: ${yamlEscape(plan.slug)}`,
    `name: ${yamlEscape(plan.name)}`,
    `overview: ${yamlEscape(plan.overview)}`,
    `status: ${plan.status}`,
    `createdAt: ${plan.createdAt}`,
    `updatedAt: ${plan.updatedAt}`,
    "todos:",
  ];
  if (plan.todos.length === 0) {
    lines.push("  []");
  } else {
    for (const todo of plan.todos) {
      lines.push(`  - id: ${yamlEscape(todo.id)}`);
      lines.push(`    content: ${yamlEscape(todo.content)}`);
      lines.push(`    status: ${todo.status}`);
    }
  }
  lines.push("---", "");
  lines.push(plan.body.trim() ? `${plan.body.trim()}\n` : "");
  return lines.join("\n");
}

export function createPlanDocument(input: {
  name: string;
  overview: string;
  body: string;
  todos: string[];
  slug?: string;
}): PlanDocument {
  const title = input.name.trim() || "Untitled plan";
  const slug = input.slug?.trim() || uniquePlanSlug(title);
  const path = planPathFor(slug);
  const now = Date.now();
  return {
    id: path,
    slug,
    path,
    name: title,
    overview: input.overview.trim(),
    body: input.body.trim() ? `${input.body.trim()}\n` : "",
    todos: input.todos
      .map((content) => content.trim())
      .filter(Boolean)
      .map((content, index) => ({ id: `todo-${index + 1}`, content, status: "pending" as const })),
    status: "draft",
    createdAt: now,
    updatedAt: now,
  };
}
