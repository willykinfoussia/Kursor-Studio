import { completionGate } from "../agent/verification/VerificationEngine";
import type { CheckResult, VerificationReport } from "../agent/verification/types";
import type { TestLevel, TestRun, TestStrategyDecision } from "./domain";
import { TestingError } from "./domain";

export function testingLevelsFor(planned: { kinds?: readonly string[] } | null): TestLevel[] | null {
  if (!planned) return null;
  if (!planned.kinds) return ["unit", "integration", "e2e"];
  if (planned.kinds.includes("test")) return ["unit"];
  return null;
}

export function verificationKindsWithoutTest(planned: { kinds?: readonly string[] }): {
  kinds?: Array<"typecheck" | "lint" | "test" | "build" | "runtime" | "custom" | "files">;
  customNames?: string[];
} {
  if (!planned.kinds) {
    return { kinds: ["typecheck", "lint", "build", "runtime", "custom", "files"] };
  }
  const kinds = planned.kinds.filter((kind) => kind !== "test") as Array<"typecheck" | "lint" | "test" | "build" | "runtime" | "custom" | "files">;
  if (kinds.length === 0) return { kinds: ["custom"], customNames: ["__kursor_testing_skip__"] };
  return { kinds };
}

export function mergeTestingReport(
  report: VerificationReport,
  run: TestRun,
  strategy: TestStrategyDecision,
  levels: readonly TestLevel[],
): VerificationReport {
  const results = [...report.results, ...levels.map((level) => checkForLevel(run, strategy, level))];
  const blockers = completionGate(results, report.missingFiles);
  return {
    ...report,
    results,
    blockers,
    ok: !report.cancelled && blockers.length === 0,
  };
}

export function mergeTestingFailure(report: VerificationReport, error: unknown): VerificationReport {
  const message = error instanceof TestingError
    ? `${error.code}: ${error.message}`
    : error instanceof Error ? error.message : "Test run failed.";
  const result: CheckResult = {
    kind: "test",
    name: "testing-engine",
    exitCode: 1,
    stdout: "",
    stderr: message,
    diagnosis: message,
    ok: false,
  };
  const results = [...report.results, result];
  const blockers = completionGate(results, report.missingFiles);
  return { ...report, results, blockers, ok: false };
}

function checkForLevel(run: TestRun, strategy: TestStrategyDecision, level: TestLevel): CheckResult {
  const decision = strategy[level];
  if (decision.action === "not_applicable") {
    return {
      kind: "test",
      name: level,
      exitCode: 0,
      stdout: "",
      stderr: "",
      diagnosis: `${level} is not applicable`,
      ok: true,
      skipped: true,
    };
  }
  const type = level === "integration" ? "INTEGRATION" : level === "e2e" ? "E2E" : "UNIT";
  const cases = run.results.map((result) => result.case).filter((item) => item.type === type);
  const failed = cases.filter((item) => item.status === "FAILED" || item.status === "ERROR");
  if (run.status === "ERROR" || run.status === "CANCELLED" || failed.length > 0 || cases.length === 0) {
    const diagnosis = failed.length > 0
      ? failed.slice(0, 5).map((item) => item.name).join(", ")
      : run.error ?? `${level} did not pass`;
    return {
      kind: "test",
      name: level,
      command: run.commandLog.find((entry) => entry.command.toLowerCase().includes(decision.runner ?? ""))?.command,
      exitCode: 1,
      stdout: diagnosis,
      stderr: run.error ?? failed[0]?.error ?? "",
      diagnosis,
      ok: false,
      durationMs: run.durationMs,
    };
  }
  return {
    kind: "test",
    name: level,
    exitCode: 0,
    stdout: `${cases.length} ${level} tests passed`,
    stderr: "",
    diagnosis: "",
    ok: true,
    durationMs: run.durationMs,
  };
}
