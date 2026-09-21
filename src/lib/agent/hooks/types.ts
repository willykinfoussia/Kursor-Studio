export type HookEventName =
  | "before_tool"
  | "after_tool"
  | "before_command"
  | "after_command"
  | "before_agent_step"
  | "after_agent_step"
  | "before_completion"
  | "after_completion"
  | "before_compaction"
  | "after_compaction"
  | "session_start"
  | "session_end"
  | "user_prompt_submit";

export const HOOK_EVENT_ALIASES: Record<string, HookEventName> = {
  SessionStart: "session_start",
  UserPromptSubmit: "user_prompt_submit",
  PreToolUse: "before_tool",
  PostToolUse: "after_tool",
  PreCommand: "before_command",
  PostCommand: "after_command",
  PreCompact: "before_compaction",
  TaskComplete: "after_completion",
  Stop: "before_completion",
  session_start: "session_start",
  user_prompt_submit: "user_prompt_submit",
  before_tool: "before_tool",
  after_tool: "after_tool",
  before_command: "before_command",
  after_command: "after_command",
  before_compaction: "before_compaction",
  after_completion: "after_completion",
  before_completion: "before_completion",
  after_compaction: "after_compaction",
  session_end: "session_end",
  before_agent_step: "before_agent_step",
  after_agent_step: "after_agent_step",
};

export type HookOutcome = "continue" | "block" | "warn" | "modify";

/** YAML / legacy Handler actions. continue=allow, block=deny, modify=allow+metadata. */
export type HookAction = "allow" | "deny" | "warn" | "continue" | "block" | "modify";

export interface HookResult {
  result: HookOutcome;
  message?: string;
  metadata?: Record<string, string>;
  hook?: string;
}

export interface HookDecision {
  action: "allow" | "deny" | "warn";
  message?: string;
  metadata?: Record<string, string>;
}

export interface HookTrace {
  event: string;
  hook: string;
  result: HookOutcome;
  message?: string;
}

export interface HookContext {
  event: HookEventName;
  tool?: string;
  input?: unknown;
  output?: unknown;
  path?: string;
  command?: string;
  stepKind?: string;
  prompt?: string;
  projectRoot?: string | null;
  verificationOk?: boolean;
  mutated?: boolean;
  filesChanged?: string[];
  metadata?: Record<string, string>;
}

export interface HookHandler {
  name: string;
  event: HookEventName;
  run(context: HookContext): HookDecision | HookResult | Promise<HookDecision | HookResult>;
}

export interface DeclarativeHook {
  name: string;
  event: HookEventName;
  action: HookAction;
  message?: string;
  when?: {
    tool?: string;
    pathContains?: string;
    commandContains?: string;
  };
}

export const COMMAND_TOOLS = new Set(["run_command", "start_process", "kill_process"]);

export const DENY_EVENTS = new Set<HookEventName>([
  "before_tool",
  "before_command",
  "user_prompt_submit",
  "before_completion",
]);

export function normalizeHookEvent(value: string | null | undefined): HookEventName | null {
  if (!value) return null;
  return HOOK_EVENT_ALIASES[value] ?? null;
}

export function toHookResult(value: HookDecision | HookResult, hook?: string): HookResult {
  if ("result" in value && value.result) {
    return { ...value, hook: value.hook ?? hook };
  }
  const decision = value as HookDecision;
  const result: HookOutcome = decision.action === "deny"
    ? "block"
    : decision.action === "warn"
      ? "warn"
      : decision.metadata && Object.keys(decision.metadata).length > 0
        ? "modify"
        : "continue";
  return {
    result,
    message: decision.message,
    metadata: decision.metadata,
    hook,
  };
}

export function toHookDecision(value: HookDecision | HookResult): HookDecision {
  if ("action" in value && value.action) {
    const action = normalizeAction(value.action);
    return {
      action: action === "block" ? "deny" : action === "warn" ? "warn" : "allow",
      message: value.message,
      metadata: value.metadata,
    };
  }
  const outcome = "result" in value ? value.result : "continue";
  return {
    action: outcome === "block" ? "deny" : outcome === "warn" ? "warn" : "allow",
    message: value.message,
    metadata: value.metadata,
  };
}

export function normalizeAction(action: HookAction | string): HookOutcome {
  if (action === "deny" || action === "block") return "block";
  if (action === "warn") return "warn";
  if (action === "modify") return "modify";
  return "continue";
}
