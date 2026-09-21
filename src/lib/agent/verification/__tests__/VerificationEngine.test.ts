import { describe, expect, it } from "vitest";
import type { ContextFileStore } from "../../context/types";
import { MAX_VERIFY_OUTPUT_CHARS } from "../types";
import { clipVerifyOutput, extractErrorPath } from "../clip";
import { resolveProfile } from "../profile";
import { VerificationEngine, commandCheckRunner, completionGate, formatForModel } from "../VerificationEngine";

class MemoryFiles implements ContextFileStore {
  constructor(
    private readonly files: Record<string, string> = {},
    private readonly dirs: Record<string, { name: string; path: string; kind: "file" | "directory" }[]> = {},
  ) {}

  async readFile(path: string) {
    if (!(path in this.files)) throw new Error(`missing ${path}`);
    return this.files[path] ?? "";
  }

  async listDirectory(path: string) {
    return this.dirs[path] ?? this.dirs["."] ?? [];
  }
}

describe("resolveProfile", () => {
  it("detects Node scripts and TypeScript", async () => {
    const files = new MemoryFiles({
      "package.json": JSON.stringify({ scripts: { test: "vitest", lint: "eslint .", build: "vite build" } }),
      "tsconfig.json": "{}",
    }, {
      ".": [
        { name: "package.json", path: "package.json", kind: "file" },
        { name: "tsconfig.json", path: "tsconfig.json", kind: "file" },
      ],
    });
    const profile = await resolveProfile(files);
    expect(profile.typecheck).toBe("pnpm exec tsc --noEmit");
    expect(profile.lint).toBe("pnpm lint");
    expect(profile.test).toBe("pnpm test");
    expect(profile.build).toBe("pnpm build");
  });

  it("detects Rust and applies .kursor/verify.json overlay", async () => {
    const files = new MemoryFiles({
      "Cargo.toml": "[package]\nname = \"app\"",
      ".kursor/verify.json": JSON.stringify({ typecheck: true, lint: false, test: true, build: true }),
    }, {
      ".": [{ name: "Cargo.toml", path: "Cargo.toml", kind: "file" }],
    });
    const profile = await resolveProfile(files);
    expect(profile.typecheck).toBe("cargo check");
    expect(profile.lint).toBe(false);
    expect(profile.test).toBe("cargo test");
    expect(profile.build).toBe("cargo build");
  });
});

describe("VerificationEngine", () => {
  it("clips large stdout and keeps path plus exit code in the diagnosis", async () => {
    const engine = new VerificationEngine({ profile: { test: "pnpm test" } });
    const report = await engine.run({
      runner: {
        async run() {
          return {
            exitCode: 1,
            stdout: "ok ".repeat(3000),
            stderr: "src/app.ts(12,5): error TS2322: Type 'string' is not assignable.",
          };
        },
      },
    });
    expect(report.ok).toBe(false);
    const failed = report.results.find((item) => item.kind === "test");
    expect(failed?.stdout.length).toBeLessThanOrEqual(MAX_VERIFY_OUTPUT_CHARS);
    expect(failed?.path).toBe("src/app.ts");
    expect(failed?.diagnosis).toContain("exit code 1");
    expect(failed?.diagnosis).toContain("src/app.ts");
    const forModel = formatForModel(report);
    expect(forModel).toContain("Exit code: 1");
    expect(forModel).toContain("src/app.ts");
    expect(clipVerifyOutput("x".repeat(10_000)).length).toBeLessThan(5_000);
    expect(extractErrorPath("--> src/main.rs:9:1")).toBe("src/main.rs");
  });

  it("skips a disabled check even if the runner would fail", async () => {
    const engine = new VerificationEngine({ profile: { test: false, lint: "pnpm lint" } });
    const report = await engine.run({
      runner: {
        async run(command) {
          return { exitCode: command.includes("lint") ? 0 : 1, stdout: "", stderr: "fail" };
        },
      },
    });
    expect(report.results.find((item) => item.kind === "test")?.skipped).toBe(true);
    expect(report.ok).toBe(true);
  });

  it("blocks completion when an expected file is missing", async () => {
    const files = new MemoryFiles({ "src/present.ts": "export {}" }, { ".": [] });
    const engine = new VerificationEngine({
      files,
      profile: { expectedFiles: ["src/missing.ts"] },
    });
    const report = await engine.run({ runner: { async run() { return { exitCode: 0, stdout: "", stderr: "" }; } } });
    expect(report.ok).toBe(false);
    expect(report.missingFiles).toContain("src/missing.ts");
    expect(completionGate(report.results, report.missingFiles).some((item) => item.includes("src/missing.ts"))).toBe(true);
  });

  it("treats a denied required command as a blocker", async () => {
    const engine = new VerificationEngine({ profile: { test: "pnpm test" } });
    const report = await engine.run({
      runner: {
        async run() {
          return { exitCode: null, stdout: "", stderr: "Permission denied.", denied: true };
        },
      },
    });
    expect(report.ok).toBe(false);
    expect(report.results.find((item) => item.kind === "test")?.denied).toBe(true);
    expect(completionGate(report.results).some((item) => item.includes("denied"))).toBe(true);
  });

  it("does not treat a skipped check as a denied blocker", async () => {
    const engine = new VerificationEngine({ profile: { lint: false, test: "pnpm test" } });
    const report = await engine.run({
      runner: { async run() { return { exitCode: 0, stdout: "", stderr: "" }; } },
    });
    const lint = report.results.find((item) => item.kind === "lint");
    expect(lint?.skipped).toBe(true);
    expect(lint?.denied).toBeUndefined();
    expect(completionGate(report.results)).toEqual([]);
  });

  it("records durationMs and filters by kind", async () => {
    const engine = new VerificationEngine({ profile: { lint: "pnpm lint", test: "pnpm test" } });
    const ran: string[] = [];
    const report = await engine.run({
      kinds: ["test"],
      runner: {
        async run(command) {
          ran.push(command);
          return { exitCode: 0, stdout: "", stderr: "" };
        },
      },
    });
    expect(ran).toEqual(["pnpm test"]);
    expect(report.results.map((item) => item.kind)).toEqual(["test"]);
    expect(report.results[0]?.durationMs).toBeGreaterThanOrEqual(0);
    expect(report.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("cancels remaining checks after the signal aborts between commands", async () => {
    const engine = new VerificationEngine({ profile: { lint: "pnpm lint", test: "pnpm test" } });
    const controller = new AbortController();
    let started = 0;
    const report = await engine.run({
      kinds: ["lint", "test"],
      signal: controller.signal,
      runner: {
        async run() {
          started += 1;
          if (started === 1) controller.abort();
          return { exitCode: 0, stdout: "ok", stderr: "" };
        },
      },
    });
    expect(report.cancelled).toBe(true);
    expect(report.ok).toBe(false);
    expect(report.results).toHaveLength(2);
    expect(report.results[0]?.cancelled).toBeFalsy();
    expect(report.results[0]?.ok).toBe(true);
    expect(report.results[1]?.cancelled).toBe(true);
    expect(report.results[1]?.diagnosis).toBe("cancelled by user");
  });
});

describe("commandCheckRunner", () => {
  it("treats workflow_denied like a permission deny", async () => {
    const runner = commandCheckRunner(async () => ({
      success: false,
      error: { code: "workflow_denied", message: "Call update_plan_todo in_progress on the next todo before mutating files." },
    }));
    const result = await runner.run("pnpm exec tsc --noEmit");
    expect(result.denied).toBe(true);
    expect(result.exitCode).toBeNull();
    expect(result.stderr).toMatch(/update_plan_todo/);
  });
});

describe("denied check diagnosis", () => {
  it("surfaces the workflow gate reason instead of a generic permissions message", async () => {
    const engine = new VerificationEngine({ profile: { test: "pnpm test" } });
    const report = await engine.run({
      runner: {
        async run() {
          return {
            exitCode: null,
            stdout: "",
            stderr: "Create the implementation branch with git_branch before mutating files.",
            denied: true,
          };
        },
      },
    });
    expect(report.ok).toBe(false);
    const failed = report.results.find((item) => item.kind === "test");
    expect(failed?.denied).toBe(true);
    expect(failed?.diagnosis).toMatch(/git_branch/);
    expect(failed?.diagnosis).not.toMatch(/permissions or hooks/);
  });
});
