import type { Capability, RiskLevel } from "./permissions/types";
import type { SkillTurnSession } from "./skills/session";
import type { AgentHarnessHooks } from "./workflow/harness";

export type { Capability, RiskLevel } from "./permissions/types";

export interface JsonSchemaProperty {
  type?: string | string[];
  description?: string;
  [key: string]: unknown;
}

export interface JsonSchemaObject {
  type?: string | string[];
  properties?: Record<string, JsonSchemaProperty>;
  required?: string[];
  additionalProperties?: boolean | JsonSchemaObject;
  [key: string]: unknown;
}

export type ToolCategory = "filesystem" | "process" | "git" | "network" | "mcp";
export type ToolRisk = "read" | "write" | "execute" | "network" | "git";
export type ToolApproval = "auto" | "ask" | "confirm-destructive";

export interface ToolContext {
  signal: AbortSignal;
  projectRoot: string | null;
  skillSession?: SkillTurnSession;
  harness?: AgentHarnessHooks;
}

export interface ToolError {
  code: string;
  message: string;
}

export interface ToolResult {
  success: boolean;
  data?: unknown;
  error?: ToolError;
  metadata?: Record<string, unknown>;
  durationMs: number;
}

export interface AgentTool {
  name: string;
  description: string;
  parameters: JsonSchemaObject;
  category: ToolCategory;
  risk: ToolRisk;
  approval: ToolApproval;
  capability: Capability;
  riskLevel: RiskLevel;
  timeoutMs: number;
  mutate: boolean;
  execute(input: unknown, ctx: ToolContext): Promise<ToolResult>;
}

export const TOOL_CATALOG = [
  "read_file",
  "write_file",
  "create_file",
  "delete_file",
  "list_files",
  "search_files",
  "apply_patch",
  "run_command",
  "start_process",
  "read_process",
  "kill_process",
  "web_search",
  "fetch_url",
  "git_status",
  "git_diff",
  "git_commit",
  "git_push",
  "git_pull",
  "git_fetch",
  "create_directory",
  "load_skill",
] as const;

/** @deprecated Use TOOL_CATALOG. */
export const FUTURE_TOOL_DEFINITIONS = TOOL_CATALOG;

/**
 * Human IDE services (`FileSystemService`, `TerminalService`) stay separate
 * from this registry. Agent tools wrap native capabilities and never touch the PTY.
 */

export class ToolRegistry {
  private readonly tools = new Map<string, AgentTool>();

  register(tool: AgentTool) {
    this.tools.set(tool.name, tool);
  }

  unregister(name: string) {
    this.tools.delete(name);
  }

  unregisterWhere(predicate: (tool: AgentTool) => boolean) {
    for (const [name, tool] of this.tools) {
      if (predicate(tool)) this.tools.delete(name);
    }
  }

  get(name: string) {
    return this.tools.get(name);
  }

  listEnabled(): AgentTool[] {
    return [...this.tools.values()];
  }
}

export const toolRegistry = new ToolRegistry();
