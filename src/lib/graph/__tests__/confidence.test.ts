import { describe, expect, it } from "vitest";
import { combineConfidence } from "../analyze/confidence";

describe("combineConfidence", () => {
  it("uses a noisy-OR product bounded to 0-1", () => {
    expect(combineConfidence([])).toBe(0);
    expect(combineConfidence([{ type: "import_reference", source: "explicit", score: 1 }])).toBe(1);
    expect(combineConfidence([
      { type: "basename_match", source: "deterministic", score: 0.4 },
      { type: "directory_match", source: "deterministic", score: 0.2 },
    ])).toBeCloseTo(0.52, 8);
  });
});
