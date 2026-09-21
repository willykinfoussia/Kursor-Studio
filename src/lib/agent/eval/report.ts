import type { EvalCheck, EvalReport } from "./types";

export function formatReport(report: EvalReport): string {
  const lines = [
    `=== ${report.id} (${report.suite}) ===`,
    `Model: ${report.model}`,
    `Prompt: ${report.prompt}`,
    `Skill set: ${report.skillSet.join(", ") || "(none)"}`,
    `Success: ${report.success}`,
    `Status: ${report.status}`,
    `Steps: ${report.steps}`,
    `Tools: ${report.tools.join(", ") || "(none)"}`,
    `Fallbacks: ${report.fallbacks}`,
    `Latency: ${report.latencyMs}ms`,
    `Tokens: in ${report.tokens.input} / out ${report.tokens.output}`,
    `Cost: $${report.costEstimateUsd.toFixed(4)}`,
    `Files changed: ${report.filesChanged.join(", ") || "(none)"}`,
    `Verification: ${report.verification.ok} ${report.verification.detail}`,
    "Checks:",
    ...report.checks.map((check) => formatCheck(check)),
  ];
  return lines.join("\n");
}

export function formatSummary(reports: readonly EvalReport[]): string {
  const passed = reports.filter((report) => report.success).length;
  const rows = reports.map((report) => (
    `${report.success ? "PASS" : "FAIL"}  ${report.id.padEnd(24)} steps=${String(report.steps).padEnd(3)} ${report.latencyMs}ms`
  ));
  return [`${passed}/${reports.length} passed`, ...rows].join("\n");
}

function formatCheck(check: EvalCheck) {
  return `  ${check.ok ? "ok  " : "FAIL"} ${check.name}: ${check.detail}`;
}
