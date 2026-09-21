export interface TerminalSessionHandle {
  id: string;
  shell: string;
  cwd: string;
  status: "running" | "exited";
  exitCode?: number;
}

export interface TerminalService {
  createSession(cwd: string, shell?: string): Promise<TerminalSessionHandle>;
  write(sessionId: string, input: string): Promise<void>;
  resize(sessionId: string, cols: number, rows: number): Promise<void>;
  kill(sessionId: string): Promise<void>;
  onOutput(listener: (sessionId: string, data: string) => void): () => void;
  onExit(listener: (sessionId: string, exitCode: number | null) => void): () => void;
}
