const DENIED_PROGRAMS = new Set([
  "sudo",
  "su",
  "doas",
  "shutdown",
  "reboot",
  "mkfs",
  "diskpart",
  "format",
]);

const INTERACTIVE_SHELLS = new Set([
  "cmd",
  "cmd.exe",
  "powershell",
  "powershell.exe",
  "pwsh",
  "bash",
  "sh",
  "zsh",
  "fish",
]);

export function firstProgram(command: string): string | undefined {
  const token = command.trim().split(/\s+/)[0];
  if (!token) return undefined;
  const unquoted = token.replace(/^["']|["']$/g, "");
  const parts = unquoted.replace(/\\/g, "/").split("/");
  return parts[parts.length - 1] || undefined;
}

export function commandFamily(command: string): string | undefined {
  const program = firstProgram(command);
  if (!program) return undefined;
  return program.replace(/\.(cmd|exe|bat)$/i, "").toLowerCase();
}

export function isDeniedCommand(command: string): boolean {
  const lower = command.toLowerCase();
  const program = (firstProgram(command) ?? "").toLowerCase();
  const family = commandFamily(command) ?? "";
  if (DENIED_PROGRAMS.has(family) || DENIED_PROGRAMS.has(program)) return true;
  const args = command.trim().split(/\s+/).slice(1);
  if ((INTERACTIVE_SHELLS.has(family) || INTERACTIVE_SHELLS.has(program)) && args.length === 0) {
    return true;
  }
  if (lower.includes("rm -rf /") || lower.includes("rm -rf /*") || lower.includes("rm -rf c:\\")) {
    return true;
  }
  if (lower.includes("169.254.169.254") || lower.includes("metadata.google")) {
    return true;
  }
  return false;
}

export function inputCommand(input: unknown): string | undefined {
  if (!input || typeof input !== "object") return undefined;
  const command = (input as Record<string, unknown>).command;
  return typeof command === "string" && command.trim() ? command.trim() : undefined;
}
