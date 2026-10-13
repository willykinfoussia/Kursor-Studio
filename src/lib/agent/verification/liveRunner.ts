import type { PermissionGate } from "../PermissionGate";
import { assertKursorShellCommand } from "../tools/shellCommand";
import type { AgentProcessService } from "../tools/native";
import { commandCheckRunner } from "./VerificationEngine";
import type { CheckRunner, CommandRunResult } from "./types";

const POLL_MS = 250;
const TIMEOUT_MS = 120_000;

export function liveCommandRunner(options: {
  run: (command: string) => Promise<{
    success: boolean;
    data?: unknown;
    error?: { code: string; message: string };
    metadata?: Record<string, unknown>;
  }>;
  gate: PermissionGate;
  process: AgentProcessService;
}): CheckRunner {
  const blocking = commandCheckRunner(options.run);
  return {
    run: (command) => blocking.run(command),
    async runLive(command, onChunk, signal) {
      const shell = assertKursorShellCommand(command, "run");
      if (!shell.ok) return { exitCode: 1, stdout: "", stderr: shell.message };
      const decision = await options.gate.authorize("run_command", { command });
      if (decision !== "allow") {
        return { exitCode: null, stdout: "", stderr: "Permission denied.", denied: true };
      }
      const job = await options.process.start({ command });
      const started = Date.now();
      let stdout = "";
      let stderr = "";
      let exitCode: number | null = null;
      try {
        while (true) {
          if (signal?.aborted) {
            await options.process.kill(job.jobId).catch(() => undefined);
            throw new Error("Test run was cancelled.");
          }
          if (Date.now() - started > TIMEOUT_MS) {
            await options.process.kill(job.jobId).catch(() => undefined);
            throw new Error("Command timed out.");
          }
          const output = await options.process.output(job.jobId);
          stdout = output.stdout;
          stderr = output.stderr;
          exitCode = output.exitCode;
          onChunk(stdout);
          if (!output.running) break;
          await wait(POLL_MS, signal);
        }
      } catch (error) {
        if (signal?.aborted) {
          await options.process.kill(job.jobId).catch(() => undefined);
        }
        throw error;
      }
      return { exitCode, stdout, stderr } satisfies CommandRunResult;
    },
  };
}

function wait(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error("Test run was cancelled."));
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new Error("Test run was cancelled."));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}
