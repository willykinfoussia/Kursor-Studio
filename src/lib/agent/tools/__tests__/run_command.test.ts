import { describe, expect, it, vi } from "vitest";
import { createRunCommandTool } from "../processTools";
import { idleToolContext } from "../result";
import type { AgentProcessService } from "../native";

function processService(overrides: Partial<AgentProcessService> = {}): AgentProcessService {
  return {
    run: vi.fn(async ({ command }) => ({ command, stdout: "ok", stderr: "", exitCode: 0 })),
    start: vi.fn(async ({ command }) => ({ jobId: "job-1", command })),
    output: vi.fn(async (jobId: string) => ({
      jobId,
      command: "",
      stdout: "",
      stderr: "",
      running: false,
      exitCode: null,
      truncated: false,
    })),
    kill: vi.fn(async () => undefined),
    ...overrides,
  };
}

describe("run_command", () => {
  it("runs a captured command", async () => {
    const process = processService();
    const result = await createRunCommandTool({ process }).execute({ command: "pnpm test" }, idleToolContext());
    expect(result.success).toBe(true);
    expect(process.run).toHaveBeenCalled();
  });

  it("rejects an empty command and traversal cwd", async () => {
    const process = processService();
    const tool = createRunCommandTool({ process });
    expect((await tool.execute({ command: "  " }, idleToolContext())).error?.code).toBe("invalid_input");
    expect((await tool.execute({ command: "pnpm test", cwd: "../" }, idleToolContext())).error?.code).toBe("path_outside_project");
  });

  it("rejects bash syntax, long-running servers, and localhost curl before spawning", async () => {
    const process = processService();
    const tool = createRunCommandTool({ process });
    const piped = await tool.execute({ command: "dir node_modules 2>nul && echo EXISTS" }, idleToolContext());
    expect(piped.error?.code).toBe("invalid_shell");
    const dev = await tool.execute({ command: "npm run dev" }, idleToolContext());
    expect(dev.error?.code).toBe("use_start_process");
    const probe = await tool.execute({ command: "curl -s http://localhost:5173/" }, idleToolContext());
    expect(probe.error?.code).toBe("localhost_probe");
    expect(process.run).not.toHaveBeenCalled();
  });
});
