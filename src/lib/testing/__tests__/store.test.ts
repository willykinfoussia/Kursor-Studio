import { describe, expect, it } from "vitest";
import type { TestRun } from "../domain";
import { toBundle } from "../store";

function runWithDurations(firstMs: number | undefined, secondMs?: number): TestRun {
  return {
    id: "run-1",
    projectId: "project-1",
    timestamp: 1_700_000_000_000.4,
    environment: "node/npm",
    status: "PASSED",
    durationMs: 162.7416,
    levels: ["unit"],
    results: [
      {
        id: "result-1",
        runId: "run-1",
        projectId: "project-1",
        case: {
          id: "case-1",
          name: "lists drinks",
          description: "lists drinks",
          type: "UNIT",
          framework: "vitest",
          runner: "vitest",
          status: "PASSED",
          durationMs: firstMs,
        },
      },
      {
        id: "result-2",
        runId: "run-1",
        projectId: "project-1",
        case: {
          id: "case-2",
          name: "creates an order",
          description: "creates an order",
          type: "UNIT",
          framework: "vitest",
          runner: "vitest",
          status: "PASSED",
          durationMs: secondMs,
        },
      },
    ],
    coverage: { lines: 80.5 },
    artifacts: [],
    commandLog: [],
  };
}

describe("toBundle", () => {
  it("rounds fractional vitest durations to integers and keeps a missing duration null", () => {
    const bundle = toBundle(runWithDurations(162.7416));
    expect(bundle.run.startedAt).toBe(1_700_000_000_000);
    expect(bundle.run.durationMs).toBe(163);
    expect(bundle.results[0]?.durationMs).toBe(163);
    expect(bundle.results[1]?.durationMs).toBeNull();
    expect(bundle.coverage?.createdAt).toBe(1_700_000_000_000);
    expect(Number.isInteger(bundle.run.durationMs)).toBe(true);
    expect(Number.isInteger(bundle.results[0]?.durationMs)).toBe(true);
  });
});
