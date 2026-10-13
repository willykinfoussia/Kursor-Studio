import { describe, expect, it } from "vitest";
import { progressFromCases, progressFromOutput } from "../progress";
import type { TestCase } from "../domain";

const passed: TestCase = {
  id: "a",
  name: "adds",
  description: "adds",
  type: "UNIT",
  framework: "vitest",
  runner: "vitest",
  status: "PASSED",
};

describe("progressFromOutput", () => {
  it("parses Vitest verbose lines into passed, failed, and running", () => {
    const stdout = [
      " ❯ src/pay.test.ts > charges the card",
      " ✓ src/pay.test.ts > charges the card 4ms",
      " × src/refund.test.ts > rejects an empty amount 2ms",
      "   → expected false",
      "",
    ].join("\n");
    const live = progressFromOutput("unit", "vitest", stdout, false);
    expect(live.passed).toBe(1);
    expect(live.failed).toBe(1);
    expect(live.cases.find((item) => item.status === "failed")?.error).toContain("expected false");
    const settled = progressFromOutput("unit", "vitest", stdout, true);
    expect(settled.phase).toBe("failed");
    expect(settled.total).toBe(2);
    expect(settled.running).toBe(0);
  });

  it("parses Playwright line reporter counts", () => {
    const stdout = [
      "Running 2 tests using 1 worker",
      "  ✓  1 [chromium] › e2e/login.spec.ts:3:1 › login (1.2s)",
      "  ✘  2 [chromium] › e2e/login.spec.ts:8:1 › logout (400ms)",
      "",
    ].join("\n");
    const progress = progressFromOutput("e2e", "playwright", stdout, true);
    expect(progress.total).toBe(2);
    expect(progress.passed).toBe(1);
    expect(progress.failed).toBe(1);
    expect(progress.cases.map((item) => item.name)).toEqual(["login", "logout"]);
    expect(progress.phase).toBe("failed");
  });

  it("parses Playwright ok and x lines from a non-color reporter", () => {
    const stdout = [
      "Running 1 test using 1 worker",
      "  ok 1 [chromium] › e2e\\app.spec.js:3:1 › ajoute, coche puis supprime une tâche (968ms)",
      "",
    ].join("\n");
    const progress = progressFromOutput("e2e", "playwright", stdout, true);
    expect(progress.passed).toBe(1);
    expect(progress.cases[0]?.name).toBe("ajoute, coche puis supprime une tâche");
    expect(progress.phase).toBe("passed");
  });

  it("stays indeterminate until a generic runner finishes", () => {
    const progress = progressFromOutput("integration", "generic", "", false);
    expect(progress.phase).toBe("running");
    expect(progress.total).toBeNull();
    expect(progress.cases).toEqual([]);
  });
});

describe("progressFromCases", () => {
  it("uses parsed cases as the final counts", () => {
    const progress = progressFromCases("unit", [
      passed,
      { ...passed, id: "b", name: "breaks", status: "FAILED", error: "nope" },
    ]);
    expect(progress).toMatchObject({ phase: "failed", passed: 1, failed: 1, total: 2 });
  });
});
