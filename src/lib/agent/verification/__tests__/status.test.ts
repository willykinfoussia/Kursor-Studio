import { describe, expect, it } from "vitest";
import { countsFromReport, repairSequences, statusFromReport, suiteFrom, verificationGaps } from "../status";
import { mergeHistory } from "../history";
import type { ProfileInspection, VerificationHistoryEntry, VerificationReport } from "../types";

const inspection: ProfileInspection = {
  ecosystem: "node",
  detectedFrom: ["package.json"],
  auto: { test: "pnpm test" },
  overlay: {},
  resolved: { test: "pnpm test" },
  checks: [
    { kind: "typecheck", origin: "absent" },
    { kind: "lint", origin: "absent" },
    { kind: "test", origin: "auto", autoCommand: "pnpm test", command: "pnpm test" },
    { kind: "build", origin: "absent" },
    { kind: "runtime", origin: "absent" },
  ],
  hasCustom: false,
};

describe("statusFromReport", () => {
  it("returns running, not-verified, blocked, failed, and verified", () => {
    expect(statusFromReport({ running: true })).toBe("running");
    expect(statusFromReport({ report: null })).toBe("not-verified");
    expect(statusFromReport({ cancelled: true })).toBe("cancelled");
    expect(statusFromReport({ report: report({ denied: true, ok: false, skipped: false }) })).toBe("blocked");
    expect(statusFromReport({ report: report({ ok: false, exitCode: 1 }) })).toBe("failed");
    expect(statusFromReport({ report: report({ ok: true }) })).toBe("verified");
  });

  it("counts blocked separately from skipped", () => {
    const counts = countsFromReport({
      ok: false,
      attempts: 1,
      results: [
        result({ ok: true }),
        result({ kind: "lint", skipped: true, ok: true, diagnosis: "no command" }),
        result({ kind: "build", denied: true, ok: false, exitCode: null, diagnosis: "denied" }),
      ],
      blockers: ["denied"],
      missingFiles: [],
    });
    expect(counts).toEqual({ checks: 3, passed: 1, failed: 0, skipped: 1, blocked: 1 });
  });
});

describe("suiteFrom", () => {
  it("marks denied results blocked and skipped results skipped", () => {
    const items = suiteFrom(inspection, {
      ok: false,
      attempts: 1,
      results: [
        result({ denied: true, ok: false, exitCode: null, diagnosis: "denied" }),
        result({ kind: "lint", skipped: true, ok: true, diagnosis: "no command" }),
      ],
      blockers: ["denied"],
      missingFiles: [],
    });
    expect(items.find((item) => item.kind === "test")?.status).toBe("blocked");
    expect(items.find((item) => item.kind === "lint")?.status).toBe("skipped");
    expect(items.find((item) => item.kind === "typecheck")?.status).toBe("not-configured");
  });
});

describe("verificationGaps", () => {
  it("lists honest gaps without inventing coverage", () => {
    const gaps = verificationGaps(inspection);
    expect(gaps).toContain("No typecheck");
    expect(gaps).toContain("No E2E verification configured");
    expect(gaps).toContain("Coverage not collected");
    expect(gaps.some((gap) => /%/.test(gap))).toBe(false);
  });
});

describe("mergeHistory", () => {
  it("deduplicates agent traces against persisted summaries", () => {
    const persisted = [entry("r1:1", 20)];
    const traces = [entry("r1:1", 10), entry("r2:1", 30)];
    expect(mergeHistory(persisted, traces).map((item) => item.id)).toEqual(["r2:1", "r1:1"]);
  });
});

describe("repairSequences", () => {
  it("groups failed then retried attempts of the same request", () => {
    const sequences = repairSequences([
      { ...entry("r1:2", 2), attempt: 2, ok: true },
      { ...entry("r1:1", 1), attempt: 1, ok: false, failed: 1, passed: 0 },
    ]);
    expect(sequences).toHaveLength(1);
    expect(sequences[0]?.map((item) => item.attempt)).toEqual([1, 2]);
  });
});

function result(partial: Partial<VerificationReport["results"][number]> = {}): VerificationReport["results"][number] {
  return {
    kind: "test",
    command: "pnpm test",
    exitCode: 0,
    stdout: "",
    stderr: "",
    diagnosis: "",
    ok: true,
    ...partial,
  };
}

function report(partial: Partial<VerificationReport["results"][number]> & { ok?: boolean }): VerificationReport {
  const item = result(partial);
  return {
    ok: partial.ok ?? item.ok,
    attempts: 1,
    results: [item],
    blockers: item.ok ? [] : [item.diagnosis],
    missingFiles: [],
  };
}

function entry(id: string, timestamp: number): VerificationHistoryEntry {
  return {
    id,
    timestamp,
    trigger: "agent",
    requestId: id.split(":")[0] ?? id,
    ok: true,
    attempt: 1,
    passed: 1,
    failed: 0,
    skipped: 0,
    blocked: 0,
  };
}
