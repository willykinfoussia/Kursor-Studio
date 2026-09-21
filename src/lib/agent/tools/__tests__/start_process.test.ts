import { describe, expect, it, vi } from "vitest";
import { createStartProcessTool } from "../processTools";
import { idleToolContext } from "../result";
import type { AgentProcessService } from "../native";

describe("start_process", () => {
  it("returns an agent-owned job id", async () => {
    const process: AgentProcessService = {
      run: vi.fn(async ({ command }) => ({ command, stdout: "", stderr: "", exitCode: 0 })),
      start: vi.fn(async ({ command }) => ({ jobId: "abc", command })),
      kill: vi.fn(async () => undefined),
    };
    const result = await createStartProcessTool({ process }).execute({ command: "pnpm dev" }, idleToolContext());
    expect(result.success).toBe(true);
    expect(result.data).toEqual({ jobId: "abc", command: "pnpm dev" });
  });

  it("requires a command and a project", async () => {
    const process: AgentProcessService = {
      run: vi.fn(async ({ command }) => ({ command, stdout: "", stderr: "", exitCode: 0 })),
      start: vi.fn(async ({ command }) => ({ jobId: "abc", command })),
      kill: vi.fn(async () => undefined),
    };
    const tool = createStartProcessTool({ process });
    expect((await tool.execute({ command: "" }, idleToolContext())).error?.code).toBe("invalid_input");
    expect((await tool.execute({ command: "pnpm dev" }, idleToolContext(null))).error?.code).toBe("no_project");
  });

  it("rejects bash pipes even for long-running jobs", async () => {
    const process: AgentProcessService = {
      run: vi.fn(async ({ command }) => ({ command, stdout: "", stderr: "", exitCode: 0 })),
      start: vi.fn(async ({ command }) => ({ jobId: "abc", command })),
      kill: vi.fn(async () => undefined),
    };
    const result = await createStartProcessTool({ process }).execute({ command: "pnpm dev | tee log" }, idleToolContext());
    expect(result.error?.code).toBe("invalid_shell");
    expect(process.start).not.toHaveBeenCalled();
  });
});
