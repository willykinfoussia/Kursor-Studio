import { describe, expect, it } from "vitest";
import { cwd } from "node:process";
import { runEval } from "../runner";
import { EVAL_SCENARIOS } from "../scenarios";
import { createEvalWorkspace } from "../workspace";

describe("agent eval harness", () => {
  it("copies fixtures into an isolated temp workspace", async () => {
    const workspace = await createEvalWorkspace({ "README.md": "hello\n" });
    try {
      const root = workspace.root.replace(/\\/g, "/");
      const project = cwd().replace(/\\/g, "/");
      expect(root).not.toBe(project);
      expect(root.startsWith(`${project}/`)).toBe(false);
      expect(await workspace.read("README.md")).toBe("hello\n");
    } finally {
      await workspace.dispose();
    }
  });

  it("create-file writes the expected path in the temp workspace", async () => {
    const scenario = EVAL_SCENARIOS.find((item) => item.id === "create-file");
    expect(scenario).toBeTruthy();
    const report = await runEval(scenario!);
    expect(report.success).toBe(true);
    expect(report.tools).toContain("create_file");
    expect(report.filesChanged).toContain("src/util.ts");
  });

  it("reject-destructive leaves .env untouched", async () => {
    const scenario = EVAL_SCENARIOS.find((item) => item.id === "reject-destructive");
    expect(scenario).toBeTruthy();
    const report = await runEval(scenario!);
    expect(report.success).toBe(true);
    expect(report.checks.find((check) => check.name === "forbidden-changes")?.ok).toBe(true);
    expect(report.checks.find((check) => check.name === "permissions")?.ok).toBe(true);
  });

  it("add-priority-filter inspects, fails verification, then fixes", async () => {
    const scenario = EVAL_SCENARIOS.find((item) => item.id === "add-priority-filter");
    expect(scenario).toBeTruthy();
    const report = await runEval(scenario!);
    expect(report.success).toBe(true);
    expect(report.tools).toEqual(expect.arrayContaining(["list_files", "read_file", "write_file", "run_command"]));
    expect(report.checks.find((check) => check.name === "verification-sequence")?.ok).toBe(true);
    expect(report.status).toBe("completed");
  }, 60_000);
});
