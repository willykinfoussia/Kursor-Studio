import { extractKnownFilePath, isProcessTool } from "../agent/conversation/toolMeta";
import { parseRuntimeToolName } from "../mcp/ids";
import type { AgentGraphNodeType } from "./types";

const FILE_TOOLS = new Set([
  "read_file",
  "write_file",
  "create_file",
  "delete_file",
  "list_files",
  "search_files",
  "apply_patch",
  "create_directory",
]);

export function nodeTypeForTool(tool: string): AgentGraphNodeType {
  if (parseRuntimeToolName(tool)) return "mcp_tool";
  if (FILE_TOOLS.has(tool)) return "file";
  if (tool.startsWith("git_")) return "git";
  if (isProcessTool(tool)) return "command";
  if (tool === "web_search") return "web_search";
  if (tool === "fetch_url") return "web_page";
  return "tool";
}

export function toolFilePath(input: unknown): string | null {
  return extractKnownFilePath(input);
}

export function toolFileLine(input: unknown): number | undefined {
  if (!input || typeof input !== "object") return undefined;
  const record = input as { line?: unknown; startLine?: unknown };
  if (typeof record.line === "number" && Number.isFinite(record.line)) return record.line;
  if (typeof record.startLine === "number" && Number.isFinite(record.startLine)) return record.startLine;
  return undefined;
}

export function stringifyPreview(value: unknown, limit = 400) {
  if (value === undefined) return "";
  try {
    const text = typeof value === "string" ? value : JSON.stringify(value, null, 2);
    return text.length > limit ? `${text.slice(0, limit)}…` : text;
  } catch {
    return "";
  }
}
