import { clipText } from "../context/tokens";
import { MAX_VERIFY_OUTPUT_CHARS } from "./types";

export function clipVerifyOutput(text: string, max = MAX_VERIFY_OUTPUT_CHARS): string {
  if (!text) return "";
  if (text.length <= max) return text;
  if (max <= 5) return clipText(text, max);
  const keep = Math.max(1, Math.floor((max - 3) / 2));
  return `${text.slice(0, keep)}\n…\n${text.slice(-keep)}`;
}

export function extractErrorPath(text: string): string | undefined {
  const patterns = [
    /(?:^|\s)([A-Za-z0-9_./\\-]+\.(?:ts|tsx|js|jsx|mjs|cjs|rs|go|py|java))(?:\(|:)\d+/,
    /-->\s+([A-Za-z0-9_./\\-]+\.[A-Za-z0-9]+):\d+/,
    /(?:error|Error)[:\s]+([A-Za-z0-9_./\\-]+\.[A-Za-z0-9]+)/,
  ];
  for (const pattern of patterns) {
    const match = pattern.exec(text);
    const path = match?.[1]?.replace(/\\/g, "/");
    if (path) return path;
  }
  return undefined;
}

export function firstErrorLine(stdout: string, stderr: string): string {
  const blob = [stderr, stdout].filter(Boolean).join("\n");
  const lines = blob.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const error = lines.find((line) => /error|fail|denied|cannot|unable/i.test(line));
  return error ?? lines[0] ?? "";
}

export function diagnoseCheck(input: {
  kind: string;
  command?: string;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  denied?: boolean;
}): { diagnosis: string; path?: string } {
  const stdout = clipVerifyOutput(input.stdout);
  const stderr = clipVerifyOutput(input.stderr);
  if (input.denied) {
    const reason = firstErrorLine(stdout, stderr);
    return {
      diagnosis: reason
        ? `Check ${input.kind} was denied: ${reason}`
        : `Check ${input.kind} was denied by permissions or hooks.`,
    };
  }
  const combined = `${stderr}\n${stdout}`;
  const path = extractErrorPath(combined);
  const line = firstErrorLine(stdout, stderr);
  const exit = input.exitCode == null ? "unknown" : String(input.exitCode);
  const parts = [
    `Check ${input.kind} failed with exit code ${exit}.`,
    path ? `Path: ${path}` : "",
    line ? `Diagnosis: ${line}` : "",
  ].filter(Boolean);
  return { diagnosis: parts.join(" "), path };
}
