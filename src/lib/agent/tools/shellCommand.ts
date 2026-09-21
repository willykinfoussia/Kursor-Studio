export type ShellKind = "run" | "start";

const SHELL_MESSAGE =
  "run_command uses Windows cmd, not bash. One command per call; no pipes, &&, ;, or 2>&1. Use dir or list_files instead of ls/pwd.";
const DEV_SERVER_MESSAGE =
  "Long-running servers (npm run dev, pnpm dev, vite, next dev) must use start_process.";
const LOCALHOST_MESSAGE =
  "Do not curl localhost from run_command. Use start_process and read that job.";

export type ShellCommandCheck =
  | { ok: true }
  | { ok: false; code: string; message: string };

function withoutQuotes(command: string): string {
  return command.replace(/"(?:\\.|[^"\\])*"/g, " ").replace(/'(?:\\.|[^'\\])*'/g, " ");
}

function isLongRunningDevServer(command: string): boolean {
  const body = withoutQuotes(command);
  if (/\b(?:npm|pnpm|yarn|bun)(?:\.cmd)?\s+run\s+dev\b/i.test(body)) return true;
  if (/\b(?:pnpm|npm|yarn|bun)(?:\.cmd)?\s+dev\b/i.test(body)) return true;
  if (/\bnext\s+dev\b/i.test(body)) return true;
  if (/^(?:npx\s+)?vite\b/i.test(body.trim())) return true;
  return false;
}

function isLocalhostProbe(command: string): boolean {
  const body = withoutQuotes(command);
  return /\b(?:curl|wget)\b/i.test(body) && /\b(?:localhost|127\.0\.0\.1)\b/i.test(body);
}

export function assertKursorShellCommand(command: string, kind: ShellKind): ShellCommandCheck {
  const trimmed = command.trim();
  if (!trimmed) return { ok: false, code: "invalid_input", message: "A command is required." };
  const exposed = withoutQuotes(trimmed);
  if (/[;&|]/.test(exposed) || /(?:^|\s)(?:2>&1|2>|1>|>>|>\/dev\/null)/.test(exposed)) {
    return { ok: false, code: "invalid_shell", message: SHELL_MESSAGE };
  }
  if (/\b(?:rm\s+-rf|head\b|tail\b|pwd\b|ls\b|sleep\b)\b/i.test(exposed)) {
    return { ok: false, code: "invalid_shell", message: SHELL_MESSAGE };
  }
  if (/^[A-Za-z_][A-Za-z0-9_]*=\S+\s+\S/.test(trimmed)) {
    return { ok: false, code: "invalid_shell", message: SHELL_MESSAGE };
  }
  if (kind === "run" && isLongRunningDevServer(trimmed)) {
    return { ok: false, code: "use_start_process", message: DEV_SERVER_MESSAGE };
  }
  if (kind === "run" && isLocalhostProbe(trimmed)) {
    return { ok: false, code: "localhost_probe", message: LOCALHOST_MESSAGE };
  }
  return { ok: true };
}
