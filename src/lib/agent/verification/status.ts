import { MAX_VERIFY_OUTPUT_CHARS } from "./types";
import type {
  CheckResult,
  InspectedCheck,
  ProfileInspection,
  VerificationHealth,
  VerificationHistoryEntry,
  VerificationReport,
  VerificationTrigger,
} from "./types";

export type SuiteStatus =
  | "idle"
  | "waiting"
  | "running"
  | "passed"
  | "failed"
  | "blocked"
  | "skipped"
  | "disabled"
  | "not-configured"
  | "cancelled";

export interface SuiteItem {
  id: string;
  kind: InspectedCheck["kind"] | "custom" | "files";
  name: string;
  command?: string;
  origin: InspectedCheck["origin"] | "custom";
  status: SuiteStatus;
  result?: CheckResult;
  path?: string;
  durationMs?: number;
}

export interface VerificationCounts {
  checks: number;
  passed: number;
  failed: number;
  skipped: number;
  blocked: number;
}

export function healthFrom(input: {
  running?: boolean;
  cancelled?: boolean;
  report?: VerificationReport | null;
}): VerificationHealth {
  if (input.running) return "running";
  if (input.cancelled && !input.report?.ok) return "cancelled";
  const report = input.report;
  if (!report) return "not-verified";
  if (report.cancelled) return "cancelled";
  if (report.results.some((result) => result.denied)) return "blocked";
  if (!report.ok) return "failed";
  return "verified";
}

export function statusFromReport(input: {
  running?: boolean;
  cancelled?: boolean;
  report?: VerificationReport | null;
}): VerificationHealth {
  return healthFrom(input);
}

export function repairSequences(history: readonly VerificationHistoryEntry[]): VerificationHistoryEntry[][] {
  const grouped = new Map<string, VerificationHistoryEntry[]>();
  for (const entry of history) {
    const list = grouped.get(entry.requestId) ?? [];
    list.push(entry);
    grouped.set(entry.requestId, list);
  }
  return [...grouped.values()]
    .map((attempts) => [...attempts].sort((left, right) => left.attempt - right.attempt))
    .filter((attempts) => attempts.length > 1 && attempts.some((entry) => !entry.ok));
}

export function countsFromReport(report: VerificationReport | null | undefined): VerificationCounts {
  if (!report) return { checks: 0, passed: 0, failed: 0, skipped: 0, blocked: 0 };
  let passed = 0;
  let failed = 0;
  let skipped = 0;
  let blocked = 0;
  for (const result of report.results) {
    if (result.denied) blocked += 1;
    else if (result.cancelled) skipped += 1;
    else if (result.skipped) skipped += 1;
    else if (result.ok) passed += 1;
    else failed += 1;
  }
  return {
    checks: report.results.length,
    passed,
    failed,
    skipped,
    blocked,
  };
}

export function summaryFromReport(
  report: VerificationReport,
  input: { trigger: VerificationTrigger; requestId: string; runId?: string; timestamp?: number },
): VerificationHistoryEntry {
  const counts = countsFromReport(report);
  return {
    id: `${input.requestId}:${report.attempts}`,
    timestamp: input.timestamp ?? Date.now(),
    trigger: input.trigger,
    requestId: input.requestId,
    runId: input.runId,
    ok: report.ok,
    attempt: report.attempts,
    passed: counts.passed,
    failed: counts.failed,
    skipped: counts.skipped,
    blocked: counts.blocked,
    durationMs: report.durationMs,
    cancelled: report.cancelled,
  };
}

export function suiteFrom(
  inspection: ProfileInspection | null,
  report: VerificationReport | null,
  live?: { runningId?: string | null; waiting?: boolean },
): SuiteItem[] {
  const items: SuiteItem[] = [];
  const byKey = indexResults(report?.results ?? []);

  for (const check of inspection?.checks ?? []) {
    const result = byKey.get(standardKey(check.kind));
    items.push({
      id: `standard:${check.kind}`,
      kind: check.kind,
      name: labelForKind(check.kind),
      command: check.command ?? check.autoCommand,
      origin: check.origin,
      status: statusFor(check.origin, result, live?.runningId === `standard:${check.kind}`, live?.waiting),
      result,
      durationMs: result?.durationMs,
    });
  }

  for (const custom of inspection?.resolved.custom ?? []) {
    const id = `custom:${custom.name || custom.command}`;
    const result = byKey.get(customKey(custom.name, custom.command));
    items.push({
      id,
      kind: "custom",
      name: custom.name || custom.command,
      command: custom.command,
      origin: "custom",
      status: statusFor("custom", result, live?.runningId === id, live?.waiting),
      result,
      durationMs: result?.durationMs,
    });
  }

  for (const path of inspection?.resolved.expectedFiles ?? []) {
    const id = `file:${path}`;
    const result = byKey.get(fileKey(path));
    items.push({
      id,
      kind: "files",
      name: path,
      origin: "custom",
      path,
      status: statusFor("custom", result, live?.runningId === id, live?.waiting),
      result,
      durationMs: result?.durationMs,
    });
  }

  return items;
}

export function verificationGaps(inspection: ProfileInspection | null): string[] {
  if (!inspection) return ["No project is open."];
  const gaps: string[] = [];
  const enabled = inspection.checks.filter((check) => check.origin !== "disabled" && check.origin !== "absent");
  if (enabled.length === 0 && !inspection.hasCustom && !(inspection.resolved.expectedFiles?.length)) {
    gaps.push("No verification configured");
  }
  const byKind = new Map(inspection.checks.map((check) => [check.kind, check]));
  if (byKind.get("typecheck")?.origin === "absent") gaps.push("No typecheck");
  if (byKind.get("test")?.origin === "absent") gaps.push("No tests configured");
  if (byKind.get("build")?.origin === "absent") gaps.push("No build verification");
  if (byKind.get("runtime")?.origin === "absent") gaps.push("No runtime check");
  if (!inspection.hasCustom) gaps.push("No E2E verification configured");
  gaps.push("Coverage not collected");
  return [...new Set(gaps)];
}

export function outputIsClipped(text: string | undefined): boolean {
  if (!text) return false;
  return text.includes("\n…\n") || text.length >= MAX_VERIFY_OUTPUT_CHARS;
}

export function labelForKind(kind: string): string {
  if (kind === "typecheck") return "Typecheck";
  if (kind === "lint") return "Lint";
  if (kind === "test") return "Test";
  if (kind === "build") return "Build";
  if (kind === "runtime") return "Runtime";
  if (kind === "files") return "Expected file";
  return "Custom";
}

export function ecosystemLabel(value: ProfileInspection["ecosystem"], detectedFrom: string[]): string {
  if (value === "node") {
    return detectedFrom.some((item) => item.startsWith("tsconfig")) ? "Node.js / TypeScript" : "Node.js";
  }
  if (value === "rust") return "Rust";
  if (value === "go") return "Go";
  if (value === "python") return "Python";
  return "Unknown";
}

function statusFor(
  origin: InspectedCheck["origin"] | "custom",
  result: CheckResult | undefined,
  running: boolean,
  waiting?: boolean,
): SuiteStatus {
  if (running) return "running";
  if (result?.cancelled) return "cancelled";
  if (result?.denied) return "blocked";
  if (result && !result.skipped && result.ok) return "passed";
  if (result && !result.skipped && !result.ok) return "failed";
  if (origin === "disabled" || result?.diagnosis === "disabled by profile") return "disabled";
  if (result?.skipped) return "skipped";
  if (origin === "absent") return "not-configured";
  if (waiting) return "waiting";
  return "idle";
}

function indexResults(results: readonly CheckResult[]): Map<string, CheckResult> {
  const map = new Map<string, CheckResult>();
  for (const result of results) {
    if (result.expectedFile && result.name) map.set(fileKey(result.name), result);
    else if (result.kind === "custom") map.set(customKey(result.name, result.command), result);
    else map.set(standardKey(result.kind), result);
  }
  return map;
}

function standardKey(kind: string) {
  return `standard:${kind}`;
}

function customKey(name?: string, command?: string) {
  return `custom:${name || command || ""}`;
}

function fileKey(path: string) {
  return `file:${path}`;
}
