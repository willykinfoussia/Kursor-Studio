import { normalizeRelativePath, PathOutsideProjectError, resolveProjectPath } from "../../filesystem/pathUtils";
import { failResult, isToolResult } from "./result";
import { asRecord } from "./schema";
import type { ToolResult } from "../ToolRegistry";

export function requireProjectRoot(projectRoot: string | null): string | ToolResult {
  if (!projectRoot) return failResult("no_project", "No project is currently open.");
  return projectRoot;
}

export function requiredRelativePath(input: unknown, field = "path"): string | ToolResult {
  const raw = String(asRecord(input)[field] ?? "").trim();
  const normalized = normalizeRelativePath(raw);
  if (!normalized || normalized === ".") {
    return failResult("invalid_input", "A relative file path is required.");
  }
  try {
    resolveProjectPath(".", normalized);
  } catch (error) {
    if (error instanceof PathOutsideProjectError) {
      return failResult("path_outside_project", error.message);
    }
    throw error;
  }
  return normalized;
}

export function optionalRelativeDirectory(input: unknown, field = "path"): string | ToolResult {
  const raw = String(asRecord(input)[field] ?? "").trim();
  if (!raw || raw === ".") return "";
  const normalized = normalizeRelativePath(raw);
  try {
    resolveProjectPath(".", normalized);
  } catch (error) {
    if (error instanceof PathOutsideProjectError) {
      return failResult("path_outside_project", error.message);
    }
    throw error;
  }
  return normalized;
}

export function isFailure(value: unknown): value is ToolResult {
  return isToolResult(value) && value.success === false;
}
