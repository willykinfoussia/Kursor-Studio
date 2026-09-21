function isWindowsPlatform() {
  if (typeof navigator === "undefined") return false;
  return navigator.userAgent.toLowerCase().includes("windows");
}

export function defaultShellName() {
  if (isWindowsPlatform()) return "PowerShell";
  if (typeof navigator !== "undefined" && navigator.userAgent.toLowerCase().includes("mac")) return "zsh";
  return "bash";
}

export function availableShells() {
  if (isWindowsPlatform()) return ["PowerShell", "Command Prompt", "Git Bash"] as const;
  return ["zsh", "bash", "sh"] as const;
}

export function tabLabelForShell(shell: string) {
  const value = shell.toLowerCase();
  if (value.includes("powershell")) return "powershell";
  if (value.includes("cmd")) return "cmd";
  if (value.includes("zsh")) return "zsh";
  if (value.includes("bash")) return "bash";
  return shell.split(/[\\/]/).pop() ?? "shell";
}
