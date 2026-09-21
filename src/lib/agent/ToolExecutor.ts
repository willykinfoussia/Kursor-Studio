import { failResult, isToolResult } from "./tools/result";
import type { ToolResult } from "./ToolRegistry";
import { validateToolInput } from "./tools/schema";
import { normalizeAskUserQuestionInput } from "./workflow/questionOptions";
import type { PermissionManager } from "./PermissionManager";
import { evaluateWorkflowGate, MIN_SUBAGENTS_REASON } from "./workflow/gates";
import type { WorkflowSessionState } from "./workflow/sessionState";
import type { AgentHarnessHooks } from "./workflow/harness";
import type { SkillTurnSession } from "./skills/session";
import type { ToolContext, ToolRegistry } from "./ToolRegistry";
import { HookBus, isCommandTool, readCommand, readPath } from "./hooks/HookBus";
import type { HookDecision } from "./hooks/types";

export interface ToolExecutorOptions {
  registry: ToolRegistry;
  permissions: PermissionManager;
  getProjectRoot: () => string | null;
  hooks?: HookBus;
  onHook?: (decision: HookDecision, event: "before_tool" | "after_tool" | "before_command" | "after_command", tool: string) => void;
  beforeExecute?: (tool: string, input: unknown) => Promise<void>;
  skillSession?: SkillTurnSession;
  workflow?: WorkflowSessionState;
  harness?: AgentHarnessHooks;
}

export class ToolExecutor {
  private lastSignature = "";
  private repeatCount = 0;

  constructor(private readonly options: ToolExecutorOptions) {}

  async run(
    name: string,
    input: unknown,
    extras: { signal?: AbortSignal; callId?: string } = {},
  ): Promise<ToolResult> {
    const started = Date.now();
    const finish = (result: ToolResult): ToolResult => ({
      ...result,
      durationMs: Number.isFinite(result.durationMs) && result.durationMs > 0
        ? result.durationMs
        : Date.now() - started,
    });

    const tool = this.options.registry.get(name);
    if (!tool) {
      return finish(failResult("unknown_tool", `Unknown tool "${name}".`));
    }

    const prepared = name === "ask_user_question" ? normalizeAskUserQuestionInput(input) : input;
    const valid = validateToolInput(tool.parameters, prepared);
    if (!valid.ok) {
      return finish(failResult("invalid_input", valid.message));
    }

    const workflow = this.options.workflow ?? this.options.skillSession?.workflow;
    if (workflow && name === "agent" && !workflow.subagent) {
      const preview = evaluateWorkflowGate(name, valid.value, tool.mutate, workflow);
      if (preview.decision === "allow") {
        const explore = isExploreAgentCall(name, valid.value);
        workflow.noteAgentStarting();
        if (explore) workflow.noteExploreStarting();
        const paired = await workflow.waitForAgentPair();
        if (!paired) {
          workflow.rejectSoloAgent(explore);
          return finish(failResult("workflow_denied", MIN_SUBAGENTS_REASON));
        }
      }
    }
    if (workflow && isSkillCheckMarkTool(name)) {
      const preview = evaluateWorkflowGate(name, valid.value, tool.mutate, workflow);
      if (preview.decision === "allow") {
        workflow.noteSkillCheckStarting(name === "load_skill" ? skillIdFromToolInput(valid.value) : undefined);
      }
    }
    if (workflow && name === "create_plan") {
      await workflow.waitForSiblingExploreMark();
    }
    if (workflow && !isSkillCheckMarkTool(name)) {
      await workflow.waitForSiblingSkillCheck();
    }

    const signature = toolSignature(name, valid.value);
    if (signature === this.lastSignature) this.repeatCount += 1;
    else {
      this.lastSignature = signature;
      this.repeatCount = 1;
    }
    if (this.repeatCount >= 3) {
      return finish(failResult(
        "repeated_command",
        "The same tool was called 3 times in a row with the same input. Stop repeating and change approach.",
      ));
    }

    const callId = extras.callId ?? crypto.randomUUID();
    const before = await this.runHooks("before_tool", name, valid.value);
    if (before?.action === "deny") {
      return finish(failResult("hook_denied", before.message || "Blocked by hook."));
    }
    let resolvedInput = applyPathMetadata(valid.value, before?.metadata);

    if (workflow) {
      const gate = evaluateWorkflowGate(name, resolvedInput, tool.mutate, workflow);
      if (gate.decision === "deny") {
        return finish(failResult("workflow_denied", gate.reason));
      }
    }

    const decision = await this.options.permissions.authorize(name, resolvedInput, callId);
    if (decision === "deny") {
      return finish(failResult(
        "permission_denied",
        this.options.permissions.lastDenyReason || "Permission denied.",
      ));
    }

    if (this.options.beforeExecute) {
      try {
        await this.options.beforeExecute(name, resolvedInput);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Tool failed.";
        return finish(failResult("execution_failed", message));
      }
    }

    const timeout = new AbortController();
    const timer = setTimeout(() => timeout.abort("tool-timeout"), tool.timeoutMs);
    const signal = extras.signal
      ? AbortSignal.any([extras.signal, timeout.signal])
      : timeout.signal;
    const ctx: ToolContext = {
      signal,
      projectRoot: this.options.getProjectRoot(),
      skillSession: this.options.skillSession,
      harness: this.options.harness,
    };

    try {
      if (signal.aborted) {
        return finish(abortResult(signal, extras.signal));
      }
      const output = await Promise.race([
        tool.execute(resolvedInput, ctx),
        abortPromise(signal),
      ]);
      if (!isToolResult(output)) {
        return finish(failResult("malformed_result", "Tool returned a malformed result."));
      }
      await this.runHooks("after_tool", name, resolvedInput, output);
      return finish(output);
    } catch (error) {
      if (signal.aborted || (error instanceof DOMException && error.name === "AbortError")) {
        return finish(abortResult(signal, extras.signal));
      }
      const message = error instanceof Error ? error.message : "Tool failed.";
      return finish(failResult("execution_failed", message));
    } finally {
      clearTimeout(timer);
    }
  }

  private async runHooks(
    event: "before_tool" | "after_tool",
    tool: string,
    input: unknown,
    output?: unknown,
  ) {
    const hooks = this.options.hooks;
    if (!hooks) return null;
    const command = isCommandTool(tool);
    const context = {
      event,
      tool,
      input,
      output,
      path: readPath(input),
      command: readCommand(input),
      projectRoot: this.options.getProjectRoot(),
    };
    const first = await hooks.emit({ ...context, event });
    this.options.onHook?.(first, event, tool);
    if (command) {
      const commandEvent = event === "before_tool" ? "before_command" as const : "after_command" as const;
      const second = await hooks.emit({ ...context, event: commandEvent });
      this.options.onHook?.(second, commandEvent, tool);
      if (second.action === "deny") return second;
    }
    return first;
  }
}

function isExploreAgentCall(name: string, input: unknown): boolean {
  if (name !== "agent" || !input || typeof input !== "object") return false;
  return (input as { subagent_type?: unknown }).subagent_type === "explore";
}

function isSkillCheckMarkTool(name: string): boolean {
  return name === "load_skill" || name === "check_skills";
}

function skillIdFromToolInput(input: unknown): string | undefined {
  if (!input || typeof input !== "object") return undefined;
  const skill = (input as { skill?: unknown }).skill;
  return typeof skill === "string" && skill.trim() ? skill.trim() : undefined;
}

function toolSignature(name: string, input: unknown): string {
  try {
    return `${name}:${JSON.stringify(input)}`;
  } catch {
    return `${name}:unserializable`;
  }
}

function applyPathMetadata(input: Record<string, unknown>, metadata?: Record<string, string>) {
  if (!metadata?.path) return input;
  return { ...input, path: metadata.path };
}

function abortResult(signal: AbortSignal, userSignal?: AbortSignal): ToolResult {
  const timedOut = signal.aborted && (!userSignal || !userSignal.aborted);
  if (timedOut || signal.reason === "tool-timeout") {
    return failResult("timeout", "Tool timed out.");
  }
  return failResult("cancelled", "Tool was cancelled.");
}

function abortPromise(signal: AbortSignal): Promise<never> {
  return new Promise((_, reject) => {
    if (signal.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }
    signal.addEventListener("abort", () => {
      reject(new DOMException("Aborted", "AbortError"));
    }, { once: true });
  });
}
