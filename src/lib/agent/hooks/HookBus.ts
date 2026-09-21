import type { ContextFileStore } from "../context/types";
import { asRecord } from "../tools/schema";
import { HookExecutor, sanitizeMetadata } from "./HookExecutor";
import { HookRegistry } from "./HookRegistry";
import { parseHookYaml } from "./parseHook";
import {
  COMMAND_TOOLS,
  type DeclarativeHook,
  type HookContext,
  type HookDecision,
  type HookHandler,
  type HookTrace,
} from "./types";

export class HookBus {
  private readonly registry = new HookRegistry();
  private readonly project = new HookRegistry();
  private readonly executor: HookExecutor;

  constructor(options: { onTrace?: (trace: HookTrace) => void } = {}) {
    this.executor = new HookExecutor(options);
  }

  observe(onTrace: (trace: HookTrace) => void) {
    this.executor.observe(onTrace);
    return this;
  }

  use(handler: HookHandler) {
    this.registry.use(handler);
    return this;
  }

  list(event?: Parameters<HookRegistry["list"]>[0]) {
    return [...this.registry.list(event), ...this.project.list(event)];
  }

  clear() {
    this.registry.clear();
    this.project.clear();
  }

  async loadProjectHooks(files: ContextFileStore) {
    const loaded: HookHandler[] = [];
    const entries = await files.listDirectory(".kursor/hooks").catch(() => []);
    const filesToRead = entries
      .filter((entry) => entry.kind === "file" && /\.ya?ml$/i.test(entry.name))
      .map((entry) => entry.path.replace(/\\/g, "/"))
      .sort((a, b) => a.localeCompare(b));
    for (const path of filesToRead) {
      const raw = await files.readFile(path).catch(() => "");
      if (!raw.trim()) continue;
      const parsed = parseHookYaml(raw, path.split("/").pop() ?? path);
      if (parsed) loaded.push(declarativeHandler(parsed));
    }
    this.project.replace(loaded);
  }

  async emit(context: HookContext): Promise<HookDecision> {
    return this.executor.run(this.list(context.event), context);
  }
}

export function declarativeHandler(hook: DeclarativeHook): HookHandler {
  return {
    name: hook.name,
    event: hook.event,
    run(context) {
      if (!matches(hook, context)) return { result: "continue" as const };
      const result = hook.action === "deny" || hook.action === "block"
        ? "block" as const
        : hook.action === "warn"
          ? "warn" as const
          : hook.action === "modify"
            ? "modify" as const
            : "continue" as const;
      return { result, message: hook.message };
    },
  };
}

function matches(hook: DeclarativeHook, context: HookContext) {
  const when = hook.when ?? {};
  if (when.tool && when.tool !== context.tool) return false;
  if (when.pathContains) {
    const path = context.path ?? readPath(context.input);
    if (!path.toLowerCase().includes(when.pathContains.toLowerCase())) return false;
  }
  if (when.commandContains) {
    const command = context.command ?? readCommand(context.input);
    if (!command.toLowerCase().includes(when.commandContains.toLowerCase())) return false;
  }
  return true;
}

export function readPath(input: unknown): string {
  const record = asRecord(input);
  if (typeof record.path === "string") return record.path;
  return "";
}

export function readCommand(input: unknown): string {
  const record = asRecord(input);
  if (typeof record.command === "string") return record.command;
  return "";
}

export function isCommandTool(name: string) {
  return COMMAND_TOOLS.has(name);
}

export { sanitizeMetadata };
