import type { ProcessJob, ProcessOutput, ProcessResult } from "../../types/tauri";
import { invokeCommand } from "./invoke";

export const processApi = {
  execute: (command: string) => invokeCommand<ProcessResult>("process_execute", { command }),
  run: (command: string, cwd?: string, timeoutMs?: number) =>
    invokeCommand<ProcessResult>("process_run", { command, cwd, timeoutMs }),
  start: (command: string, cwd?: string) =>
    invokeCommand<ProcessJob>("process_start", { command, cwd }),
  output: (jobId: string) => invokeCommand<ProcessOutput>("process_output", { jobId }),
  kill: (jobId: string) => invokeCommand<void>("process_kill", { jobId }),
};
