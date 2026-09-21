import type { AgentTool, ToolRegistry } from "./ToolRegistry";
import { toolRegistry } from "./ToolRegistry";
import type { AgentProcessService } from "./tools/native";
import { createRunCommandTool } from "./tools/processTools";

export interface CommandRunner {
  run(command: string): Promise<{ command: string; stdout: string; stderr: string; exitCode: number | null }>;
}

export function createCommandTool(runner: CommandRunner): AgentTool {
  const process: AgentProcessService = {
    run: async ({ command }) => runner.run(command),
    start: async ({ command }) => ({ jobId: "test-job", command }),
    kill: async () => undefined,
  };
  return createRunCommandTool({ process });
}

export function registerCommandTool(
  registry: ToolRegistry = toolRegistry,
  runner?: CommandRunner,
) {
  if (runner) registry.register(createCommandTool(runner));
}
