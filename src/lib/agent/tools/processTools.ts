import { toolPermission } from "../permissions/meta";
import type { AgentTool } from "../ToolRegistry";
import type { AgentProcessService } from "./native";
import { asRecord } from "./schema";
import { failResult, okResult, toToolFailure } from "./result";
import { toolSchema } from "./schema";
import { isFailure, optionalRelativeDirectory, requireProjectRoot } from "./paths";
import { assertKursorShellCommand } from "./shellCommand";

export function createRunCommandTool(deps: { process: AgentProcessService }): AgentTool {
  return {
    name: "run_command",
    description: "Run one project command in a captured Windows cmd process (not bash, not the human terminal). One command per call; no pipes, 2>&1, pwd, ls, or sleep. cwd is relative to the project root.",
    ...toolPermission("terminal.execute", "high"),
    timeoutMs: 120_000,
    mutate: true,
    parameters: toolSchema({
      command: { type: "string", description: "Command to run, e.g. pnpm test" },
      cwd: { type: "string", description: "Optional working directory. Relative to the project root, or an absolute path inside the project." },
    }, ["command"]),
    async execute(input, ctx) {
      const root = requireProjectRoot(ctx.projectRoot);
      if (isFailure(root)) return root;
      const command = String(asRecord(input).command ?? "").trim();
      if (!command) return failResult("invalid_input", "A command is required.");
      const shell = assertKursorShellCommand(command, "run");
      if (!shell.ok) return failResult(shell.code, shell.message);
      const cwd = optionalRelativeDirectory(input, "cwd", root);
      if (isFailure(cwd)) return cwd;
      try {
        const result = await deps.process.run({
          command,
          cwd: cwd || undefined,
          timeoutMs: 120_000,
        });
        const data = {
          command: result.command,
          stdout: result.stdout,
          stderr: result.stderr,
          exitCode: result.exitCode,
          truncated: result.truncated ?? false,
        };
        if (result.exitCode === 0) return okResult(data, { exitCode: 0 });
        return {
          success: false,
          data,
          error: { code: "command_failed", message: result.stderr || `Command exited with ${result.exitCode}.` },
          metadata: { exitCode: result.exitCode ?? undefined },
          durationMs: 0,
        };
      } catch (error) {
        return toToolFailure(error);
      }
    },
  };
}

export function createStartProcessTool(deps: { process: AgentProcessService }): AgentTool {
  return {
    name: "start_process",
    description: "Start a background captured process in the project. Returns a jobId. Call read_process with that jobId to see stdout and stderr. Do not look for log files. Not the human terminal.",
    ...toolPermission("terminal.long_running", "critical"),
    timeoutMs: 10_000,
    mutate: true,
    parameters: toolSchema({
      command: { type: "string", description: "Command to start" },
      cwd: { type: "string", description: "Optional working directory. Relative to the project root, or an absolute path inside the project." },
    }, ["command"]),
    async execute(input, ctx) {
      const root = requireProjectRoot(ctx.projectRoot);
      if (isFailure(root)) return root;
      const command = String(asRecord(input).command ?? "").trim();
      if (!command) return failResult("invalid_input", "A command is required.");
      const shell = assertKursorShellCommand(command, "start");
      if (!shell.ok) return failResult(shell.code, shell.message);
      const cwd = optionalRelativeDirectory(input, "cwd", root);
      if (isFailure(cwd)) return cwd;
      try {
        const result = await deps.process.start({ command, cwd: cwd || undefined });
        return okResult({ jobId: result.jobId, command: result.command });
      } catch (error) {
        return toToolFailure(error);
      }
    },
  };
}

export function createReadProcessTool(deps: { process: AgentProcessService }): AgentTool {
  return {
    name: "read_process",
    description: "Read the captured stdout and stderr of a background job started by start_process. Pass the jobId. Do not look for dev.log or run tasklist.",
    ...toolPermission("terminal.execute", "low"),
    timeoutMs: 10_000,
    mutate: false,
    parameters: toolSchema({
      jobId: { type: "string", description: "Job id returned by start_process" },
    }, ["jobId"]),
    async execute(input) {
      const jobId = String(asRecord(input).jobId ?? "").trim();
      if (!jobId) return failResult("invalid_input", "A jobId is required.");
      try {
        const result = await deps.process.output(jobId);
        return okResult(result, { exitCode: result.exitCode ?? undefined });
      } catch (error) {
        return toToolFailure(error);
      }
    },
  };
}

export function createKillProcessTool(deps: { process: AgentProcessService }): AgentTool {
  return {
    name: "kill_process",
    description: "Kill an agent-owned background process by jobId. Cannot kill arbitrary OS processes.",
    ...toolPermission("applications.execute", "high"),
    timeoutMs: 10_000,
    mutate: true,
    parameters: toolSchema({
      jobId: { type: "string", description: "Job id returned by start_process" },
    }, ["jobId"]),
    async execute(input) {
      const jobId = String(asRecord(input).jobId ?? "").trim();
      if (!jobId) return failResult("invalid_input", "A jobId is required.");
      try {
        await deps.process.kill(jobId);
        return okResult({ jobId, killed: true });
      } catch (error) {
        return toToolFailure(error);
      }
    },
  };
}
