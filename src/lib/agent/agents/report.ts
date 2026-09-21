import { toolOutputOk } from "../AgentStep";
import { FILE_MUTATE_TOOLS, isTestCommand } from "../recovery";
import { toolChangedPath } from "../tools/result";
import type { ToolCall } from "../types";
import type { DelegateReport, SpecialistId } from "./types";

export function parseDelegateTrailer(content: string): Pick<DelegateReport, "summary" | "findings" | "issues"> {
  const parsed = extractJsonObject(content);
  if (!parsed || typeof parsed !== "object") {
    return { summary: content.trim(), findings: [], issues: [] };
  }
  const record = parsed as Record<string, unknown>;
  const summary = typeof record.summary === "string" && record.summary.trim()
    ? record.summary.trim()
    : stripTrailer(content);
  return {
    summary,
    findings: stringList(record.findings),
    issues: stringList(record.issues),
  };
}

export function collectHarnessEvidence(toolCalls: readonly ToolCall[]): Pick<DelegateReport, "filesChanged" | "tests"> {
  const filesChanged: string[] = [];
  const tests: { command: string; ok: boolean }[] = [];
  for (const call of toolCalls) {
    if (!toolOutputOk(call.output)) continue;
    if (FILE_MUTATE_TOOLS.has(call.tool)) {
      const path = toolChangedPath(call.output) ?? readInputPath(call.input);
      if (path && !filesChanged.includes(path)) filesChanged.push(path);
    }
    if (call.tool === "run_command") {
      const command = readInputCommand(call.input);
      if (command && isTestCommand(command)) {
        tests.push({ command, ok: toolOutputOk(call.output) && exitOk(call.output) });
      }
    }
  }
  return { filesChanged, tests };
}

export function buildDelegateReport(
  agentId: SpecialistId,
  content: string,
  toolCalls: readonly ToolCall[],
): DelegateReport {
  const trailer = parseDelegateTrailer(content);
  const evidence = collectHarnessEvidence(toolCalls);
  return {
    agentId,
    summary: trailer.summary,
    findings: trailer.findings,
    filesChanged: evidence.filesChanged,
    tests: evidence.tests,
    issues: trailer.issues,
  };
}

export function formatHandoff(goal: string, reports: readonly DelegateReport[]): string {
  if (reports.length === 0) return goal;
  const blocks = reports.map((report) => formatReport(report));
  return `${goal.trim()}\n\nPrevious specialist reports:\n${blocks.join("\n\n")}`;
}

export function formatReportsForParent(reports: readonly DelegateReport[]): string {
  return reports.map((report) => formatReport(report)).join("\n\n");
}

export function formatReport(report: DelegateReport): string {
  const lines = [`## ${report.agentId}`, report.summary];
  if (report.findings.length > 0) {
    lines.push("Findings:");
    for (const finding of report.findings) lines.push(`- ${finding}`);
  }
  if (report.filesChanged.length > 0) {
    lines.push(`Files changed: ${report.filesChanged.join(", ")}`);
  }
  if (report.tests.length > 0) {
    lines.push("Tests:");
    for (const test of report.tests) lines.push(`- ${test.ok ? "ok" : "fail"} ${test.command}`);
  }
  if (report.issues.length > 0) {
    lines.push("Issues:");
    for (const issue of report.issues) lines.push(`- ${issue}`);
  }
  return lines.join("\n");
}

function extractJsonObject(text: string): unknown | null {
  const fenced = text.match(/```json\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    try {
      return JSON.parse(fenced[1]);
    } catch {
      /* fall through */
    }
  }
  const start = text.lastIndexOf("{");
  if (start < 0) return null;
  try {
    return JSON.parse(text.slice(start));
  } catch {
    return null;
  }
}

function stripTrailer(content: string): string {
  const fenced = content.replace(/```json\s*[\s\S]*?```/i, "").trim();
  const start = fenced.lastIndexOf("{");
  const without = start >= 0 ? fenced.slice(0, start).trim() : fenced;
  return without || content.trim();
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && Boolean(item.trim()));
}

function readInputPath(input: unknown): string | undefined {
  if (!input || typeof input !== "object") return undefined;
  const path = (input as { path?: unknown }).path;
  return typeof path === "string" && path ? path : undefined;
}

function readInputCommand(input: unknown): string | undefined {
  if (!input || typeof input !== "object") return undefined;
  const command = (input as { command?: unknown }).command;
  return typeof command === "string" && command.trim() ? command.trim() : undefined;
}

function exitOk(output: unknown): boolean {
  if (!output || typeof output !== "object") return true;
  const record = output as { data?: { exitCode?: unknown }; exitCode?: unknown };
  const code = record.data && typeof record.data === "object"
    ? record.data.exitCode
    : record.exitCode;
  if (code === undefined || code === null) return true;
  return code === 0;
}
