import { describe, expect, it, vi } from "vitest";
import { createKillProcessTool } from "../processTools";
import { idleToolContext } from "../result";
import type { AgentProcessService } from "../native";

describe("kill_process", () => {
  it("kills an agent-owned job", async () => {
    const process: AgentProcessService = {
      run: vi.fn(async ({ command }) => ({ command, stdout: "", stderr: "", exitCode: 0 })),
      start: vi.fn(async ({ command }) => ({ jobId: "abc", command })),
      output: vi.fn(async (jobId: string) => ({ jobId, command: "", stdout: "", stderr: "", running: false, exitCode: null, truncated: false })),
      kill: vi.fn(async () => undefined),
    };
    const result = await createKillProcessTool({ process }).execute({ jobId: "abc" }, idleToolContext());
    expect(process.kill).toHaveBeenCalledWith("abc");
    expect(result.success).toBe(true);
  });

  it("fails for a missing or unknown job", async () => {
    const process: AgentProcessService = {
      run: vi.fn(async ({ command }) => ({ command, stdout: "", stderr: "", exitCode: 0 })),
      start: vi.fn(async ({ command }) => ({ jobId: "abc", command })),
      output: vi.fn(async (jobId: string) => ({ jobId, command: "", stdout: "", stderr: "", running: false, exitCode: null, truncated: false })),
      kill: vi.fn(async () => {
        throw new Error("Unknown process job.");
      }),
    };
    const tool = createKillProcessTool({ process });
    expect((await tool.execute({ jobId: "" }, idleToolContext())).error?.code).toBe("invalid_input");
    expect((await tool.execute({ jobId: "missing" }, idleToolContext())).error?.code).toBe("execution_failed");
  });
});
