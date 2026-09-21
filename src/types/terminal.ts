export type TerminalSessionStatus = "running" | "exited";

export interface TerminalSession {
  id: string;
  name: string;
  shell: string;
  cwd: string;
  projectId?: string;
  status: TerminalSessionStatus;
  exitCode?: number;
}
