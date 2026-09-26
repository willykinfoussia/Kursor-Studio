import { describe, expect, it, vi } from "vitest";
import { createReadProcessTool, createStartProcessTool } from "../processTools";
import { idleToolContext } from "../result";
import type { AgentProcessService } from "../native";

function processService(): AgentProcessService {
  return {
    run: vi.fn(async ({ command }) => ({ command, stdout: "", stderr: "", exitCode: 0 })),
    start: vi.fn(async ({ command }) => ({ jobId: "abc", command })),
    output: vi.fn(async (jobId: string) => ({
      jobId,
      command: "pnpm dev",
      stdout: "listening",
      stderr: "",
      running: true,
      exitCode: null,
      truncated: false,
    })),
    kill: vi.fn(async () => undefined),
  };
}

describe("start_process", () => {
  it("returns an agent-owned job id", async () => {
    const process = processService();
    const result = await createStartProcessTool({ process }).execute({ command: "pnpm dev" }, idleToolContext());
    expect(result.success).toBe(true);
    expect(result.data).toEqual({ jobId: "abc", command: "pnpm dev" });
  });

  it("requires a command and a project", async () => {
    const process = processService();
    const tool = createStartProcessTool({ process });
    expect((await tool.execute({ command: "" }, idleToolContext())).error?.code).toBe("invalid_input");
    expect((await tool.execute({ command: "pnpm dev" }, idleToolContext(null))).error?.code).toBe("no_project");
  });

  it("rejects bash pipes even for long-running jobs", async () => {
    const process = processService();
    const result = await createStartProcessTool({ process }).execute({ command: "pnpm dev | tee log" }, idleToolContext());
    expect(result.error?.code).toBe("invalid_shell");
    expect(process.start).not.toHaveBeenCalled();
  });

  it("turns an absolute project cwd into a relative directory", async () => {
    const process = processService();
    const result = await createStartProcessTool({ process }).execute(
      { command: "pnpm dev", cwd: "C:\\Projects\\TodoApp" },
      idleToolContext("C:/Projects/TodoApp"),
    );
    expect(result.success).toBe(true);
    expect(process.start).toHaveBeenCalledWith({ command: "pnpm dev", cwd: undefined });
  });
});

describe("read_process", () => {
  it("returns captured output for a job", async () => {
    const process = processService();
    const result = await createReadProcessTool({ process }).execute({ jobId: "abc" }, idleToolContext());
    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({ jobId: "abc", stdout: "listening", running: true });
  });

  it("requires a job id", async () => {
    const process = processService();
    const result = await createReadProcessTool({ process }).execute({ jobId: "  " }, idleToolContext());
    expect(result.error?.code).toBe("invalid_input");
    expect(process.output).not.toHaveBeenCalled();
  });
});
