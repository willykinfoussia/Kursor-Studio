import { PathOutsideProjectError, resolveProjectPath } from "../filesystem/pathUtils";
import type { PermissionDecision, PermissionGate } from "./PermissionGate";
import { isDeniedCommand, inputCommand } from "./permissions/commands";
import { TaskGrantStore } from "./permissions/grants";
import { allowRuleFromRequest, firstMatchingRule, modeDecision, modeReason, sessionToolScope } from "./permissions/policy";
import { inferScope } from "./permissions/scope";
import type {
  ApprovalDecision,
  ApprovalRequest,
  PermissionMode,
  PermissionRule,
} from "./permissions/types";
import { inputCwd, inputFilePath, isProtectedPath, pathAccessForTool } from "./tools/protectedPaths";
import type { AgentTool, ToolRegistry } from "./ToolRegistry";

export type {
  ApprovalDecision,
  ApprovalRequest,
  Capability,
  PermissionGrant,
  PermissionMode,
  PermissionRule,
  PermissionScope,
  RiskLevel,
} from "./permissions/types";
export { sessionModeFromSettings } from "./permissions/types";

export interface PermissionPrompter {
  prompt(request: ApprovalRequest): Promise<ApprovalDecision>;
}

export interface PermissionManagerOptions {
  mode: PermissionMode;
  confirmDestructive: boolean;
  registry: ToolRegistry;
  getProjectRoot: () => string | null;
  prompter?: PermissionPrompter;
  onAsk?: (request: ApprovalRequest) => void;
  gate?: PermissionGate;
  grants?: TaskGrantStore;
  deniedTools?: string[];
  denyRules?: PermissionRule[];
  askRules?: PermissionRule[];
  allowRules?: PermissionRule[];
  yoloMode?: boolean;
  onPermanentGrant?: (rule: PermissionRule) => void;
  classifier?: (input: {
    tool: string;
    args: unknown;
    cwd: string | null;
    mode: PermissionMode;
  }) => Promise<{ decision: "allow" | "deny" | "ask_human"; reason?: string }>;
  onClassifier?: (event: {
    tool: string;
    decision: "allow" | "deny" | "ask_human";
    reason?: string;
  }) => void;
}

type PolicyVerdict =
  | { decision: "allow" }
  | { decision: "deny"; reason: string }
  | { decision: "ask"; reason: string; tool: AgentTool };

export class PermissionManager {
  readonly grants: TaskGrantStore;
  lastDenyReason = "Permission denied.";

  constructor(private readonly options: PermissionManagerOptions) {
    this.grants = options.grants ?? new TaskGrantStore();
  }

  needsPrompt(toolName: string, input: unknown): boolean {
    if (this.options.gate) return this.options.gate.needsPrompt?.(toolName, input) ?? false;
    return this.evaluate(toolName, input).decision === "ask";
  }

  async authorize(toolName: string, input: unknown, callId: string = crypto.randomUUID()): Promise<PermissionDecision> {
    this.lastDenyReason = "Permission denied.";
    if (this.options.gate) return this.options.gate.authorize(toolName, input);
    const verdict = this.evaluate(toolName, input);
    if (verdict.decision === "allow") return "allow";
    if (verdict.decision === "deny") return this.deny(verdict.reason);

    if (this.options.classifier) {
      try {
        const classified = await this.options.classifier({
          tool: toolName,
          args: input,
          cwd: this.options.getProjectRoot(),
          mode: this.options.mode,
        });
        const decision = classified.decision === "deny" ? "ask_human" as const : classified.decision;
        this.options.onClassifier?.({
          tool: toolName,
          decision,
          reason: classified.decision === "deny"
            ? classified.reason ?? "Classifier denied; asking the human."
            : classified.reason,
        });
        if (decision === "allow") return "allow";
      } catch {
        this.options.onClassifier?.({
          tool: toolName,
          decision: "ask_human",
          reason: "Classifier failed.",
        });
      }
    }

    const request = this.toRequest(callId, verdict.tool, input, verdict.reason);
    const pending = this.options.prompter
      ? this.options.prompter.prompt(request)
      : Promise.resolve("deny" as const);
    this.options.onAsk?.(request);
    const answer = await pending;
    if (answer === "deny") return this.deny(verdict.reason);
    if (answer === "allow-task" || answer === "allow-permanent") {
      const scope = sessionToolScope(request.tool);
      this.grants.add({
        id: callId,
        capability: request.capability,
        scope,
        duration: answer === "allow-permanent" ? "permanent" : "task",
        tool: request.tool,
      });
      if (answer === "allow-permanent") {
        this.options.onPermanentGrant?.(allowRuleFromRequest({ ...request, scope }));
      }
    }
    return "allow";
  }

  private deny(reason: string): "deny" {
    this.lastDenyReason = reason || "Permission denied.";
    return "deny";
  }

  private toRequest(id: string, tool: AgentTool, input: unknown, reason: string): ApprovalRequest {
    return {
      id,
      tool: tool.name,
      input,
      reason,
      riskLevel: tool.riskLevel,
      capability: tool.capability,
      scope: inferScope(tool, input),
      mode: this.options.mode,
    };
  }

  private evaluate(toolName: string, input: unknown): PolicyVerdict {
    const tool = this.options.registry.get(toolName);
    if (!tool) return { decision: "deny", reason: `Unknown tool "${toolName}".` };
    if (this.options.deniedTools?.includes(toolName)) {
      return { decision: "deny", reason: `Tool "${toolName}" is denied.` };
    }

    const filePath = inputFilePath(input);
    const cwd = inputCwd(input);
    if (filePath) {
      const access = pathAccessForTool(toolName, tool.capability);
      if (isProtectedPath(filePath, access)) {
        return { decision: "deny", reason: `Path "${filePath}" is protected.` };
      }
    }
    const location = filePath ?? cwd;
    if (location) {
      const root = this.options.getProjectRoot();
      if (root) {
        try {
          resolveProjectPath(root, location);
        } catch (error) {
          if (error instanceof PathOutsideProjectError) {
            return { decision: "deny", reason: "Path is outside the project." };
          }
        }
      } else if (tool.capability.startsWith("filesystem.")) {
        return { decision: "deny", reason: "No project is currently open." };
      }
    }

    const command = inputCommand(input);
    if (command && tool.capability.startsWith("terminal.") && isDeniedCommand(command)) {
      return { decision: "deny", reason: "Command is blocked." };
    }

    const denyRule = firstMatchingRule(
      this.options.denyRules ?? [],
      "deny",
      toolName,
      tool.capability,
      input,
    );
    if (denyRule) return { decision: "deny", reason: "Denied by policy rule." };

    if (this.options.yoloMode) return { decision: "allow" };

    const allowRule = firstMatchingRule(
      this.options.allowRules ?? [],
      "allow",
      toolName,
      tool.capability,
      input,
    );
    if (allowRule) return { decision: "allow" };

    if (this.grants.match(tool.capability, toolName, input)) {
      return { decision: "allow" };
    }

    if (tool.capability === "mcp.invoke" && tool.approval === "auto") {
      return { decision: "allow" };
    }

    const askRule = firstMatchingRule(
      this.options.askRules ?? [],
      "ask",
      toolName,
      tool.capability,
      input,
    );
    if (askRule) {
      return { decision: "ask", reason: "Approval required by policy rule.", tool };
    }

    const mode = modeDecision(this.options.mode, tool.capability, this.options.confirmDestructive);
    if (mode === "allow") return { decision: "allow" };
    if (mode === "deny") {
      return { decision: "deny", reason: modeReason(this.options.mode, tool.capability, mode) };
    }
    return { decision: "ask", reason: modeReason(this.options.mode, tool.capability, mode), tool };
  }
}

export function permissionManagerAsGate(manager: PermissionManager): PermissionGate {
  return {
    needsPrompt: (tool, input) => manager.needsPrompt(tool, input),
    authorize: (tool, input) => manager.authorize(tool, input),
  };
}

export function createManagerFromGate(gate: PermissionGate, registry: ToolRegistry): PermissionManager {
  return new PermissionManager({
    mode: "workspace-write",
    confirmDestructive: false,
    registry,
    getProjectRoot: () => null,
    gate,
  });
}
