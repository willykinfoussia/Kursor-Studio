import {
  DENY_EVENTS,
  toHookResult,
  type HookContext,
  type HookDecision,
  type HookHandler,
  type HookOutcome,
  type HookTrace,
} from "./types";

export interface HookExecutorOptions {
  onTrace?: (trace: HookTrace) => void;
}

export class HookExecutor {
  constructor(private readonly options: HookExecutorOptions = {}) {}

  observe(onTrace: (trace: HookTrace) => void) {
    this.options.onTrace = onTrace;
  }

  async run(handlers: readonly HookHandler[], context: HookContext): Promise<HookDecision> {
    let metadata = { ...(context.metadata ?? {}) };
    const warnings: string[] = [];
    let modified = false;

    for (const handler of handlers) {
      const raw = await handler.run({ ...context, metadata });
      const result = toHookResult(raw, handler.name);
      if (result.metadata) {
        metadata = { ...metadata, ...sanitizeMetadata(result.metadata) };
        if (result.result === "modify" || Object.keys(result.metadata).length > 0) modified = true;
      }
      this.options.onTrace?.({
        event: context.event,
        hook: result.hook ?? handler.name,
        result: result.result,
        message: result.message,
      });

      if (result.result === "block") {
        if (!DENY_EVENTS.has(context.event)) {
          if (result.message) warnings.push(result.message);
          continue;
        }
        return { action: "deny", message: result.message, metadata };
      }
      if (result.result === "warn" && result.message) warnings.push(result.message);
    }

    if (warnings.length > 0) {
      return { action: "warn", message: warnings.join(" "), metadata };
    }
    if (modified) {
      return { action: "allow", metadata };
    }
    return { action: "allow", metadata };
  }
}

export function hookOutcomeFromDecision(decision: HookDecision): HookOutcome {
  if (decision.action === "deny") return "block";
  if (decision.action === "warn") return "warn";
  if (decision.metadata && Object.keys(decision.metadata).length > 0) return "modify";
  return "continue";
}

export function sanitizeMetadata(metadata: Record<string, string>) {
  const next: Record<string, string> = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (!value) continue;
    if (key === "path" && (value.includes("..") || value.startsWith("/") || /^[A-Za-z]:[\\/]/.test(value))) {
      continue;
    }
    next[key] = value;
  }
  return next;
}
