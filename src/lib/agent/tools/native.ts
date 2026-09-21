export interface AgentProcessService {
  run(input: { command: string; cwd?: string; timeoutMs: number }): Promise<{
    command: string;
    stdout: string;
    stderr: string;
    exitCode: number | null;
    truncated?: boolean;
  }>;
  start(input: { command: string; cwd?: string }): Promise<{ jobId: string; command: string }>;
  kill(jobId: string): Promise<void>;
}

export interface AgentGitService {
  status(): Promise<{ branch: string; changedFiles: string[]; clean: boolean }>;
  diff(path?: string): Promise<{ path?: string | null; diff: string }>;
  commit(input: { message: string; paths?: string[]; push?: boolean }): Promise<{ committed: true; pushed: boolean }>;
  push(): Promise<void>;
  pull(): Promise<void>;
  fetch(): Promise<void>;
  checkout(branch: string): Promise<void>;
  createBranch(branch: string, start?: string): Promise<void>;
}

export interface AgentHttpService {
  fetchText(url: string, options: { timeoutMs: number; signal: AbortSignal; maxChars: number }): Promise<{
    url: string;
    status: number;
    contentType: string;
    body: string;
  }>;
}
