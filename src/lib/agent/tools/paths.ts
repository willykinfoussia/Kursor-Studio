import { PathOutsideProjectError, toProjectRelative } from "../../filesystem/pathUtils";
import { failResult, isToolResult } from "./result";
import { asRecord } from "./schema";
import type { ToolResult } from "../ToolRegistry";

export function requireProjectRoot(projectRoot: string | null): string | ToolResult {
  if (!projectRoot) return failResult("no_project", "No project is currently open.");
  return projectRoot;
}

export function requiredRelativePath(input: unknown, field = "path", projectRoot?: string | null): string | ToolResult {
  const raw = String(asRecord(input)[field] ?? "").trim();
  if (!raw || raw === ".") {
    return failResult("invalid_input", "A relative file path is required.");
  }
  try {
    const relative = toProjectRelative(projectRoot?.trim() || ".", raw);
    if (!relative) return failResult("invalid_input", "A relative file path is required.");
    return relative;
  } catch (error) {
    if (error instanceof PathOutsideProjectError) {
      return failResult("path_outside_project", error.message);
    }
    throw error;
  }
}

export function optionalRelativeDirectory(input: unknown, field = "path", projectRoot?: string | null): string | ToolResult {
  const raw = String(asRecord(input)[field] ?? "").trim();
  if (!raw || raw === ".") return "";
  try {
    return toProjectRelative(projectRoot?.trim() || ".", raw);
  } catch (error) {
    if (error instanceof PathOutsideProjectError) {
      return failResult("path_outside_project", error.message);
    }
    throw error;
  }
}

export function isFailure(value: unknown): value is ToolResult {
  return isToolResult(value) && value.success === false;
}
