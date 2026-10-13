import { describe, expect, it } from "vitest";
import { ensureLocalTools, resetLocalToolsForTests, type LocalTools } from "../ensure";

describe("ensureLocalTools", () => {
  it("runs one install for both callers and reuses the result", async () => {
    resetLocalToolsForTests();
    let calls = 0;
    const load = () => {
      calls += 1;
      return new Promise<LocalTools>((resolve) => {
        setTimeout(() => resolve({ codegraph: "C:\\tools\\codegraph.cmd", graphify: "C:\\tools\\graphify.exe" }), 20);
      });
    };
    const [first, second] = await Promise.all([ensureLocalTools(load), ensureLocalTools(load)]);
    expect(calls).toBe(1);
    expect(first).toEqual(second);
    await ensureLocalTools(load);
    expect(calls).toBe(1);
    resetLocalToolsForTests();
  });

  it("does not cache a failed install", async () => {
    resetLocalToolsForTests();
    let calls = 0;
    const load = () => {
      calls += 1;
      return Promise.reject(new Error("offline"));
    };
    await expect(ensureLocalTools(load)).rejects.toThrow("offline");
    await expect(ensureLocalTools(load)).rejects.toThrow("offline");
    expect(calls).toBe(2);
    resetLocalToolsForTests();
  });
});
