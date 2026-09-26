import type { FileSystemService } from "../../filesystem/FileSystemService";
import { latestPlanPath, listedPlanPaths, planByRef, usePlanStore, writablePlanPath } from "../../../stores/planStore";
import { toolPermission } from "../permissions/meta";
import type { AgentTool, ToolContext } from "../ToolRegistry";
import { asRecord, toolSchema } from "./schema";
import { failResult, okResult, toToolFailure } from "./result";
import { isFailure, requireProjectRoot } from "./paths";
import { PLAN_DIR, createPlanDocument, normalizePlanPath, parsePlanFile, planPathFor, serializePlanFile } from "../plans/planFile";
import { isPlanTodoStatus, type PlanDocument, type PlanTodoStatus } from "../plans/types";
import { isRecordableDesignNote, type WorkflowSessionState } from "../workflow/sessionState";

export const MIN_PLAN_BODY_CHARS = 6000;
const MERMAID_FENCE = /```mermaid\b/;
const MERMAID_BLOCK = /```mermaid[\s\S]*?```/gi;
const CODE_FENCE = /```(?!mermaid\b)[^\n]*\n[\s\S]*?```/;
const BACKTICK_PATH = /`[^`\n]+\.[A-Za-z0-9]+`/;
const FILES_OR_TEST = /\*\*Files:\*\*|\bFiles:\s|##?\s+Tests?\b|\*\*Tests?:\*\*/i;
const TODO_LABEL = "Test|Verification|Done when|V[eé]rif";
/** Bold label with the colon inside or just after `**`, or a `##`/`###` heading. Combined labels such as `**Verification / Done when**:` count. */
const TODO_VERIFY = new RegExp(
  `(?:\\*\\*[^\\*\\n]{0,80}(?:${TODO_LABEL})[^\\*\\n]{0,40}\\*\\*:?|#{2,6}\\s+[^\\n]{0,40}(?:${TODO_LABEL})\\b)`,
  "i",
);
const NUMBERED_TASK_HEADING = /^#{1,6}\s+\d+\.\s+\S/;

const planWriteLocks = new Map<string, Promise<unknown>>();

export function enqueuePlanWrite<T>(path: string, work: () => Promise<T>): Promise<T> {
  const previous = planWriteLocks.get(path) ?? Promise.resolve();
  const next = previous.catch(() => undefined).then(work);
  planWriteLocks.set(path, next);
  void next.finally(() => {
    if (planWriteLocks.get(path) === next) planWriteLocks.delete(path);
  });
  return next;
}

export function proseLengthWithoutMermaid(body: string): number {
  return body.replace(MERMAID_BLOCK, "").trim().length;
}

const TODO_PREFIX_FALLBACK = 48;
const TODO_STOPWORDS = new Set(["the", "and", "with", "for", "a", "an", "to", "of", "in", "on", "or"]);

function normalizeForMatch(text: string): string {
  return text
    .toLowerCase()
    .replace(/[`*_#[\]()]/g, " ")
    .replace(/[^\p{L}\p{N}.-]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stripHeadingDecor(line: string): string {
  return line
    .trim()
    .replace(/^#{1,6}\s+/, "")
    .replace(/^(?:\d+\.|Task\s+\d+:)\s*/i, "")
    .trim();
}

export function extractPlanHeadings(body: string): string[] {
  return body.split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /^#{1,6}\s+\S/.test(line))
    .map(stripHeadingDecor)
    .filter(Boolean);
}

/** Heading-sized prefix of a todo (text before `(`, ` — `, or `:`). */
export function significantTodoPrefix(todo: string): string | null {
  const trimmed = todo.trim();
  if (!trimmed) return null;
  const clause = trimmed.split(/\s+\(|\s+—\s+|:/)[0]?.trim() ?? trimmed;
  if (clause.length > 0 && clause.length < trimmed.length) return clause;
  if (trimmed.length >= TODO_PREFIX_FALLBACK) return trimmed.slice(0, TODO_PREFIX_FALLBACK).trim();
  return null;
}

function significantWords(text: string): string[] {
  return normalizeForMatch(text)
    .split(/[\s./,;:]+/)
    .map((word) => word.replace(/^-+|-+$/g, ""))
    .filter((word) => word.length >= 2 && !TODO_STOPWORDS.has(word));
}

function wordsCovered(needle: string, haystack: string): boolean {
  const words = significantWords(needle);
  if (words.length === 0) return false;
  const hay = new Set(significantWords(haystack));
  return words.every((word) => hay.has(word));
}

function textCoversTodo(haystack: string, todo: string): boolean {
  const needle = todo.trim();
  if (!needle) return true;
  if (haystack.toLowerCase().includes(needle.toLowerCase())) return true;
  const normalizedHay = normalizeForMatch(haystack);
  const normalizedTodo = normalizeForMatch(needle);
  if (normalizedTodo && normalizedHay.includes(normalizedTodo)) return true;
  const prefix = significantTodoPrefix(needle);
  if (prefix) {
    const normalizedPrefix = normalizeForMatch(prefix);
    if (normalizedPrefix && (haystack.toLowerCase().includes(prefix.toLowerCase()) || normalizedHay.includes(normalizedPrefix))) {
      return true;
    }
  }
  return wordsCovered(prefix ?? needle, haystack);
}

export function bodyCoversTodo(body: string, todo: string): boolean {
  const needle = todo.trim();
  if (!needle) return true;
  if (textCoversTodo(body, needle)) return true;
  return extractPlanHeadings(body).some((heading) => textCoversTodo(heading, needle));
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function hasLabeledSection(body: string, labels: readonly string[]): boolean {
  return labels.some((label) => {
    const escaped = escapeRegExp(label);
    const heading = new RegExp(`^#{1,6}\\s+(?:\\d+\\.\\s+)?${escaped}\\b`, "imu");
    const bold = new RegExp(`\\*\\*${escaped}:?\\*\\*`, "iu");
    return heading.test(body) || bold.test(body);
  });
}

function hasStandaloneToken(body: string, token: string, flags = "u"): boolean {
  const escaped = escapeRegExp(token);
  return new RegExp(`(?:^|[^\\p{L}\\p{N}_])${escaped}(?:$|[^\\p{L}\\p{N}_])`, flags).test(body);
}

export function extractNumberedTaskSections(body: string): string[] {
  const lines = body.split(/\r?\n/);
  const starts: number[] = [];
  for (let index = 0; index < lines.length; index++) {
    if (NUMBERED_TASK_HEADING.test(lines[index] ?? "")) starts.push(index);
  }
  if (starts.length === 0) return [];
  return starts.map((from, index) => {
    const to = starts[index + 1] ?? lines.length;
    return lines.slice(from, to).join("\n");
  });
}

export function planStrategyInvalidReason(body: string): string | null {
  if (!hasLabeledSection(body, ["Problem", "Problème"])) {
    return "body must include a Problem (or Problème) section.";
  }
  if (!hasLabeledSection(body, ["Architecture"])) {
    return "body must include an Architecture section.";
  }
  const hasKeep = hasStandaloneToken(body, "KEEP") || hasStandaloneToken(body, "Conserver", "iu");
  const hasExtend = hasStandaloneToken(body, "EXTEND") || hasStandaloneToken(body, "Étendre", "iu")
    || hasStandaloneToken(body, "Etendre", "iu");
  if (!hasKeep || !hasExtend) {
    return "body must include an architecture impact map with KEEP and EXTEND (or Conserver and Étendre).";
  }
  return null;
}

function sectionHeading(section: string): string {
  const line = section.split(/\r?\n/, 1)[0] ?? "";
  return stripHeadingDecor(line);
}

function planVerificationInvalidReason(body: string, todos: string[]): string | null {
  const sections = extractNumberedTaskSections(body);
  if (sections.length === 0) {
    if (!TODO_VERIFY.test(body) && !FILES_OR_TEST.test(body)) {
      return "body must include Test, Verification, Done when, or Vérif for each todo.";
    }
    return null;
  }
  const namedTodos = todos.map((todo) => todo.trim()).filter(Boolean);
  const targets = namedTodos.length === 0
    ? sections
    : sections.filter((section) => {
      const heading = sectionHeading(section);
      return namedTodos.some((todo) => textCoversTodo(heading, todo));
    });
  if (namedTodos.length > 0 && targets.length === 0) return null;
  const unverified = targets.find((section) => !TODO_VERIFY.test(section));
  if (unverified) {
    return "each todo section must include Test, Verification, Done when, or Vérif.";
  }
  return null;
}

export function planBodyInvalidReason(
  body: string,
  todos: string[] = [],
  notes: string[] = [],
  overview = "",
): string | null {
  const trimmed = body.trim();
  if (!trimmed) return "body is required and must describe architecture, file map, and tasks.";
  if (!MERMAID_FENCE.test(trimmed)) {
    return "body must include a mermaid diagram (```mermaid fence).";
  }
  if (proseLengthWithoutMermaid(trimmed) < MIN_PLAN_BODY_CHARS) {
    return `body must be at least ${MIN_PLAN_BODY_CHARS} characters besides mermaid diagrams, with Problem, Architecture, KEEP/EXTEND, a section per todo, files, excerpts, and how to verify.`;
  }
  if (!BACKTICK_PATH.test(trimmed)) {
    return "body must name exact file paths in backticks.";
  }
  if (!CODE_FENCE.test(trimmed) && !FILES_OR_TEST.test(trimmed)) {
    return "body must include code excerpts or Files:/Test blocks per task, not only diagrams.";
  }
  const strategyError = planStrategyInvalidReason(trimmed);
  if (strategyError) return strategyError;
  const verifyError = planVerificationInvalidReason(trimmed, todos);
  if (verifyError) return verifyError;
  const missing = todos
    .map((todo, index) => ({ todo: todo.trim(), index }))
    .filter((item) => item.todo && !bodyCoversTodo(trimmed, item.todo));
  if (missing.length > 0) {
    const quoted = missing.map((item) => `"${item.todo}"`).join(", ");
    const expected = missing
      .map((item) => `## ${item.index + 1}. ${item.todo}`)
      .join("; ");
    return `body must include a section for each todo (missing ${quoted}). Expected headings: ${expected}`;
  }
  return designNotesInvalidReason(overview, trimmed, notes);
}

function syncWorkflow(ctx: ToolContext, apply: (session: WorkflowSessionState) => void) {
  applyIfPresent(ctx.harness?.workflow, apply);
  if (ctx.skillSession?.workflow !== ctx.harness?.workflow) {
    applyIfPresent(ctx.skillSession?.workflow, apply);
  }
}

function applyIfPresent(session: WorkflowSessionState | undefined, apply: (session: WorkflowSessionState) => void) {
  if (session) apply(session);
}

function syncActiveTodo(ctx: ToolContext, todoId: string, status: PlanTodoStatus) {
  syncWorkflow(ctx, (session) => {
    if (status === "in_progress") session.setActiveTodo(todoId);
    else if (session.activeTodoId === todoId) session.setActiveTodo(null);
  });
}

function syncPlanTodosComplete(ctx: ToolContext, complete: boolean) {
  syncWorkflow(ctx, (session) => {
    session.setPlanTodosComplete(complete);
  });
}

function todoList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (typeof item === "string") return item.trim();
        if (item && typeof item === "object") {
          const record = item as Record<string, unknown>;
          const content = typeof record.content === "string" ? record.content.trim() : "";
          return content;
        }
        return "";
      })
      .filter(Boolean);
  }
  if (typeof value === "string" && value.trim()) return [value.trim()];
  return [];
}

function resolveTodo(plan: PlanDocument, todoId: string) {
  const needle = todoId.trim();
  const exact = plan.todos.find((todo) => todo.id === needle);
  if (exact) return exact;
  const lowered = needle.toLowerCase();
  const byContent = plan.todos.find((todo) => todo.content.toLowerCase() === lowered)
    ?? plan.todos.find((todo) => todo.content.toLowerCase().includes(lowered));
  if (byContent) return byContent;
  const numeric = /^\d+$/.test(needle) ? Number(needle) : NaN;
  if (Number.isFinite(numeric) && numeric >= 1 && numeric <= plan.todos.length) {
    return plan.todos[numeric - 1] ?? null;
  }
  return null;
}

export function designNotesInvalidReason(overview: string, body: string, notes: string[] = []): string | null {
  const haystack = `${overview}\n${body}`;
  const missing: string[] = [];
  for (const note of notes) {
    const trimmed = note.trim();
    if (!isRecordableDesignNote(trimmed)) continue;
    const words = significantWords(trimmed);
    if (words.length === 0) continue;
    if (haystack.toLowerCase().includes(trimmed.toLowerCase()) || wordsCovered(trimmed, haystack)) continue;
    missing.push(trimmed);
  }
  if (missing.length === 0) return null;
  const quoted = missing.map((note) => `"${note}"`).join(", ");
  return `Plan must follow the approved design. Missing ${quoted} in overview/body. Do not invent a different stack.`;
}

function storedPlan(path: string): PlanDocument | null {
  return planByRef(usePlanStore.getState(), path);
}

export function resolvePlanDiskPath(planRef: string): string {
  const trimmed = planRef.trim();
  const stored = planByRef(usePlanStore.getState(), trimmed);
  if (stored) return stored.path;
  if (trimmed.includes("/") || trimmed.endsWith(".md")) return normalizePlanPath(trimmed);
  return planPathFor(trimmed);
}

function mergePlanBase(disk: PlanDocument, memory: PlanDocument | null): PlanDocument {
  if (!memory || memory.todos.length !== disk.todos.length) return disk;
  return {
    ...disk,
    todos: memory.todos,
    status: memory.status,
    updatedAt: Math.max(disk.updatedAt, memory.updatedAt),
  };
}

export function applyTodoStatuses(
  plan: PlanDocument,
  todoId: string,
  status: PlanTodoStatus,
): PlanDocument {
  const todos = plan.todos.map((item) => {
    if (item.id === todoId) return { ...item, status };
    if (status === "in_progress" && item.status === "in_progress") {
      return { ...item, status: "completed" as const };
    }
    return item;
  });
  const next: PlanDocument = { ...plan, todos, updatedAt: Date.now() };
  const done = todos.filter((item) => item.status === "completed").length;
  if (todos.length > 0 && done === todos.length && next.status !== "done") {
    return { ...next, status: "done" };
  }
  return next;
}

function persistToStore(plan: PlanDocument) {
  usePlanStore.getState().upsertPlan(plan);
}

export function createCreatePlanTool(deps: { fs: FileSystemService }): AgentTool {
  return {
    name: "create_plan",
    description: "Create a structured implementation plan under .kursor/plans/. Body must include Problem, Architecture, KEEP/EXTEND impact, mermaid, contract excerpts, and a section per todo with files and how to verify (at least 6000 characters besides mermaid). Overview and body must cover the approved design choices. Outline-only plans are rejected. Does not approve the plan; the human validates with Build.",
    ...toolPermission("filesystem.write", "medium"),
    timeoutMs: 15_000,
    mutate: true,
    parameters: toolSchema({
      name: { type: "string", description: "Short plan title" },
      overview: { type: "string", description: "One or two sentences describing the deliverable" },
      body: { type: "string", description: "Strategy markdown: Problem, Architecture, KEEP/EXTEND impact, mermaid, short contract excerpts, then a section per todo with files and how to verify. At least 6000 characters besides mermaid. Outline-only bodies are rejected." },
      todos: { type: "array", items: { type: "string" }, description: "One entry per implementable task" },
    }, ["name", "todos"]),
    async execute(input, ctx) {
      const root = requireProjectRoot(ctx.projectRoot);
      if (isFailure(root)) return root;
      const record = asRecord(input);
      const name = String(record.name ?? "").trim();
      const todos = todoList(record.todos);
      if (!name) return failResult("invalid_input", "name is required.");
      if (todos.length === 0) return failResult("invalid_input", "todos must contain at least one task.");
      const body = String(record.body ?? "");
      const overview = String(record.overview ?? "");
      const notes = ctx.harness?.workflow.designNotes ?? ctx.skillSession?.workflow?.designNotes ?? [];
      const bodyError = planBodyInvalidReason(body, todos, notes, overview);
      if (bodyError) return failResult("invalid_input", bodyError);
      const plan = createPlanDocument({
        name,
        overview,
        body,
        todos,
      });
      try {
        await deps.fs.createDirectory(PLAN_DIR).catch(() => undefined);
        await deps.fs.writeFile(plan.path, serializePlanFile(plan));
      } catch (error) {
        return toToolFailure(error);
      }
      persistToStore(plan);
      usePlanStore.getState().activatePlan(plan.id);
      if (ctx.harness) ctx.harness.workflow.planPath = plan.path;
      if (ctx.skillSession?.workflow) ctx.skillSession.workflow.planPath = plan.path;
      syncPlanTodosComplete(ctx, false);
      ctx.skillSession?.emit?.({
        type: "plan-created",
        planId: plan.id,
        path: plan.path,
        name: plan.name,
        overview: plan.overview,
        todoCount: plan.todos.length,
      });
      ctx.skillSession?.emit?.({ type: "plan-written", path: plan.path });
      return okResult({ planId: plan.id, path: plan.path, name: plan.name, todoCount: plan.todos.length }, { path: plan.path });
    },
  };
}

export function createUpdatePlanTodoTool(deps: { fs: FileSystemService }): AgentTool {
  return {
    name: "update_plan_todo",
    description: "Update one plan todo (pending | in_progress | completed | cancelled). Call in_progress before a task and completed after. Starting the next todo completes the previous in_progress todo. Emits plan-todo-updated.",
    ...toolPermission("filesystem.write", "low"),
    timeoutMs: 15_000,
    mutate: true,
    parameters: toolSchema({
      todo_id: { type: "string", description: "Todo id (todo-1), index (1), or exact content" },
      status: { type: "string", description: "pending | in_progress | completed | cancelled" },
      plan_path: { type: "string", description: "Optional .plan.md path; defaults to the session plan" },
      plan_id: { type: "string", description: "Optional plan id or slug; resolved via the plan store before reading the file" },
    }, ["todo_id", "status"]),
    async execute(input, ctx) {
      const root = requireProjectRoot(ctx.projectRoot);
      if (isFailure(root)) return root;
      const record = asRecord(input);
      const todoId = String(record.todo_id ?? "").trim();
      const statusRaw = String(record.status ?? "").trim();
      if (!todoId) return failResult("invalid_input", "todo_id is required.");
      if (!isPlanTodoStatus(statusRaw)) {
        return failResult("invalid_input", "status must be pending, in_progress, completed, or cancelled.");
      }
      const status: PlanTodoStatus = statusRaw;
      const sessionPath = ctx.harness?.workflow.planPath ?? ctx.skillSession?.workflow?.planPath ?? null;
      const explicit = String(record.plan_path ?? record.plan_id ?? "").trim();
      const store = usePlanStore.getState();
      const fallback = explicit || sessionPath ? "" : (writablePlanPath(store) ?? latestPlanPath(store) ?? "");
      const planRef = (explicit || sessionPath || fallback).trim();
      if (!planRef) {
        const listed = listedPlanPaths(store);
        const extra = listed.length > 0
          ? ` Available plans: ${listed.join(", ")}.`
          : " No plan files found under .kursor/plans/.";
        return failResult("no_plan", `No plan is active. Pass plan_path or create one with create_plan.${extra}`);
      }
      const path = resolvePlanDiskPath(planRef);
      if (!explicit && !sessionPath) {
        syncWorkflow(ctx, (session) => {
          session.planPath = path;
        });
      }
      return enqueuePlanWrite(path, async () => {
        let raw: string;
        try {
          raw = await deps.fs.readFile(path);
        } catch (error) {
          return toToolFailure(error);
        }
        const disk = parsePlanFile(raw, path);
        const plan = mergePlanBase(disk, storedPlan(path));
        const todo = resolveTodo(plan, todoId);
        if (!todo) return failResult("unknown_todo", `Todo "${todoId}" not found in ${path}.`);
        const finished = applyTodoStatuses(plan, todo.id, status);
        const done = finished.todos.filter((item) => item.status === "completed").length;
        const total = finished.todos.length;
        const closed = finished.todos.filter((item) => item.status === "completed" || item.status === "cancelled").length;
        const allDone = total > 0 && closed === total;
        try {
          await deps.fs.writeFile(path, serializePlanFile(finished));
        } catch (error) {
          return toToolFailure(error);
        }
        persistToStore(finished);
        syncActiveTodo(ctx, todo.id, status);
        syncPlanTodosComplete(ctx, allDone);
        ctx.skillSession?.emit?.({ type: "plan-todo-updated", planId: finished.id, todoId: todo.id, status, done, total });
        if (allDone) ctx.skillSession?.emit?.({ type: "plan-completed", planId: finished.id, path: finished.path });
        return okResult({ planId: finished.id, path: finished.path, todoId: todo.id, status, done, total }, { path: finished.path });
      });
    },
  };
}
