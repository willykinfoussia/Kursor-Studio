import { PathOutsideProjectError } from "../../filesystem/pathUtils";
import type { ToolResult } from "../ToolRegistry";

export function okResult(data?: unknown, metadata?: Record<string, unknown>): ToolResult {
  return { success: true, data, metadata, durationMs: 0 };
}

export function failResult(code: string, message: string, metadata?: Record<string, unknown>): ToolResult {
  return { success: false, error: { code, message }, metadata, durationMs: 0 };
}

export function isToolResult(value: unknown): value is ToolResult {
  return Boolean(value) && typeof value === "object" && typeof (value as ToolResult).success === "boolean";
}

export function toToolFailure(error: unknown): ToolResult {
  if (error instanceof PathOutsideProjectError) {
    return failResult("path_outside_project", error.message);
  }
  const message = error instanceof Error ? error.message : "Tool failed.";
  if (message.toLowerCase().includes("outside")) {
    return failResult("path_outside_project", message);
  }
  if (message.toLowerCase().includes("no project")) {
    return failResult("no_project", message);
  }
  return failResult("execution_failed", message);
}

export function toolChangedPath(output: unknown): string | undefined {
  if (!output || typeof output !== "object") return undefined;
  const record = output as { data?: unknown; path?: unknown; metadata?: { path?: unknown } };
  if (typeof record.path === "string" && record.path) return record.path;
  if (typeof record.metadata?.path === "string" && record.metadata.path) return record.metadata.path;
  if (record.data && typeof record.data === "object") {
    const path = (record.data as { path?: unknown }).path;
    if (typeof path === "string" && path) return path;
  }
  return undefined;
}

export function idleToolContext(
  projectRoot: string | null = "C:/Projects/TodoApp",
  extras: Omit<Partial<import("../ToolRegistry").ToolContext>, "signal" | "projectRoot"> = {},
) {
  return { signal: new AbortController().signal, projectRoot, ...extras };
}
