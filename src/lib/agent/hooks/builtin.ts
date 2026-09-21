import { isMutatingToolName, toolOutputOk } from "../AgentStep";
import { inputCommand, isDeniedCommand } from "../permissions/commands";
import { inputFilePath, isProtectedPath, pathAccessForTool } from "../tools/protectedPaths";
import { toolChangedPath } from "../tools/result";
import type { HookHandler } from "./types";

export const hookRunMetrics = {
  postToolUse: 0,
  reset() {
    this.postToolUse = 0;
  },
};

export function builtinSafetyHooks(): HookHandler[] {
  return [
    {
      name: "protect-paths",
      event: "before_tool",
      run(context) {
        const path = context.path || inputFilePath(context.input) || "";
        const access = pathAccessForTool(context.tool);
        if (path && isProtectedPath(path, access)) {
          return { result: "block", message: `Path "${path}" is protected.` };
        }
        return { result: "continue" };
      },
    },
    {
      name: "dangerous-command",
      event: "before_command",
      run(context) {
        const command = context.command || inputCommand(context.input);
        if (command && isDeniedCommand(command)) {
          return { result: "block", message: "Command is blocked by safety hook." };
        }
        return { result: "continue" };
      },
    },
    {
      name: "tool-metrics",
      event: "after_tool",
      run() {
        hookRunMetrics.postToolUse += 1;
        return { result: "continue" };
      },
    },
    {
      name: "track-files",
      event: "after_tool",
      run(context) {
        if (!context.tool || !isMutatingToolName(context.tool)) return { result: "continue" };
        if (!toolOutputOk(context.output)) return { result: "continue" };
        const path = toolChangedPath(context.output) || inputFilePath(context.input);
        if (!path) return { result: "continue" };
        return { result: "modify", metadata: { path } };
      },
    },
    {
      name: "require-verification",
      event: "before_completion",
      run(context) {
        if (context.mutated && context.verificationOk === false) {
          return { result: "block", message: "Required verification did not pass." };
        }
        return { result: "continue" };
      },
    },
  ];
}

export function registerBuiltinHooks(bus: {
  use(handler: HookHandler): unknown;
  list(event?: HookHandler["event"]): HookHandler[];
}) {
  const names = new Set(bus.list().map((handler) => handler.name));
  for (const handler of builtinSafetyHooks()) {
    if (!names.has(handler.name)) bus.use(handler);
  }
}
