import { normalizeRelativePath } from "../../filesystem/pathUtils";
import { inputPath } from "../tools/protectedPaths";
import type { AgentTool } from "../ToolRegistry";
import { commandFamily, inputCommand } from "./commands";
import type { PermissionScope } from "./types";

export function inputUrl(input: unknown): string | undefined {
  if (!input || typeof input !== "object") return undefined;
  const url = (input as Record<string, unknown>).url;
  return typeof url === "string" && url.trim() ? url.trim() : undefined;
}

export function hostnameOf(url: string): string | undefined {
  try {
    return new URL(url).hostname.toLowerCase() || undefined;
  } catch {
    return undefined;
  }
}

export function pathGrantPrefix(relativePath: string): string {
  const normalized = normalizeRelativePath(relativePath.trim());
  if (!normalized || normalized === ".") return "";
  const parts = normalized.split("/").filter(Boolean);
  if (parts.length <= 1) return normalized;
  return parts.slice(0, -1).join("/");
}

export function inferScope(tool: AgentTool, input: unknown): PermissionScope {
  const path = inputPath(input);
  if (path && (tool.capability.startsWith("filesystem.") || tool.capability.startsWith("git."))) {
    const prefix = pathGrantPrefix(path);
    return prefix ? { kind: "paths", prefixes: [prefix] } : { kind: "project" };
  }

  const command = inputCommand(input);
  if (command && tool.capability.startsWith("terminal.")) {
    const family = commandFamily(command);
    return family
      ? { kind: "commands", families: [family] }
      : { kind: "tools", names: [tool.name] };
  }

  const url = inputUrl(input);
  if (url && tool.capability.startsWith("network.")) {
    const host = hostnameOf(url);
    return host
      ? { kind: "domains", hosts: [host] }
      : { kind: "tools", names: [tool.name] };
  }

  if (tool.capability.startsWith("git.") || tool.capability.startsWith("filesystem.")) {
    return { kind: "project" };
  }

  return { kind: "tools", names: [tool.name] };
}

export function scopeCovers(scope: PermissionScope, toolName: string, input: unknown): boolean {
  if (scope.kind === "project") return true;
  if (scope.kind === "tools") return scope.names.includes(toolName);

  if (scope.kind === "paths") {
    const path = inputPath(input);
    if (!path) return false;
    const normalized = normalizeRelativePath(path);
    return scope.prefixes.some((prefix) => pathStartsWith(normalized, prefix));
  }

  if (scope.kind === "commands") {
    const command = inputCommand(input);
    if (!command) return false;
    const family = commandFamily(command);
    return Boolean(family && scope.families.includes(family));
  }

  const url = inputUrl(input);
  if (!url) return false;
  const host = hostnameOf(url);
  return Boolean(host && scope.hosts.includes(host));
}

function pathStartsWith(path: string, prefix: string): boolean {
  const normalizedPrefix = normalizeRelativePath(prefix);
  if (!normalizedPrefix || normalizedPrefix === ".") return true;
  return path === normalizedPrefix || path.startsWith(`${normalizedPrefix}/`);
}
