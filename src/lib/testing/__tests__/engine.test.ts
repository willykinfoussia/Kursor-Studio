import { describe, expect, it } from "vitest";
import type { CheckRunner } from "../../agent/verification/types";
import { testingLevelsFor } from "../../agent/verification/whenToRun";
import { constrainDecision, policyDecision } from "../decide";
import { discoverProject, memoryFileStore } from "../discover";
import { TestingEngine } from "../engine";
import { parseCoverageSummary, PlaywrightRunner, VitestRunner } from "../runners";
import { MemoryTestingStore } from "../store";

const vitestJson = JSON.stringify({
  testResults: [{
    name: "src/refund.test.ts",
    assertionResults: [
      { fullName: "UC-001 refunds the customer", status: "passed", duration: 4 },
      { fullName: "rejects an empty amount", status: "failed", failureMessages: ["expected false"] },
    ],
  }],
});

const playwrightJson = JSON.stringify({
  suites: [{
    file: "e2e/login.spec.ts",
    specs: [{
      title: "UC-001 login",
      ok: true,
      tests: [{ results: [{ status: "passed", duration: 12 }] }],
    }],
  }],
});

function packageJson(extra: Record<string, unknown> = {}) {
  return JSON.stringify({
    scripts: { test: "vitest run" },
    dependencies: { react: "19.0.0" },
    devDependencies: {},
    ...extra,
  });
}

describe("discoverProject and strategy", () => {
  it("selects Playwright for a web project with no e2e runner", async () => {
    const files = memoryFileStore({
      "package.json": JSON.stringify({
        scripts: { build: "tsc" },
        dependencies: { react: "19.0.0" },
      }),
      "index.html": "<html></html>",
    });
    const discovery = await discoverProject(files);
    const decision = policyDecision(discovery);
    expect(decision.applicationType).toBe("web");
    expect(decision.e2e).toMatchObject({ runner: "playwright", action: "install" });
    expect(decision.unit).toMatchObject({ runner: "vitest", action: "install" });
  });

  it("reuses Playwright that is already configured", async () => {
    const files = memoryFileStore({
      "package.json": packageJson({
        devDependencies: { vitest: "3.0.0", "@playwright/test": "1.0.0" },
      }),
      "playwright.config.ts": "export default {};",
      "index.html": "<html></html>",
    });
    const decision = policyDecision(await discoverProject(files));
    expect(decision.e2e).toMatchObject({ runner: "playwright", action: "use_existing" });
    expect(decision.unit).toMatchObject({ runner: "vitest", action: "use_existing" });
  });

  it("keeps Jest and Cypress instead of installing Vitest or Playwright", async () => {
    const files = memoryFileStore({
      "package.json": packageJson({
        scripts: { test: "jest" },
        dependencies: { react: "19.0.0" },
        devDependencies: { jest: "29.0.0", cypress: "13.0.0" },
      }),
      "cypress.config.ts": "export default {};",
      "index.html": "<html></html>",
    });
    const discovery = await discoverProject(files);
    const decision = constrainDecision(discovery, {
      ...policyDecision(discovery),
      unit: { ...policyDecision(discovery).unit, runner: "vitest", action: "install", reasons: ["wrong"] },
      e2e: { ...policyDecision(discovery).e2e, runner: "playwright", action: "install", reasons: ["wrong"] },
    });
    expect(decision.unit).toMatchObject({ runner: "jest", action: "use_existing" });
    expect(decision.e2e).toMatchObject({ runner: "cypress", action: "use_existing" });
  });

  it("marks e2e not applicable for a CLI", async () => {
    const files = memoryFileStore({
      "package.json": JSON.stringify({ bin: { tool: "./bin.js" }, scripts: { test: "vitest" }, devDependencies: { vitest: "3.0.0" } }),
    });
    const decision = policyDecision(await discoverProject(files));
    expect(decision.applicationType).toBe("cli");
    expect(decision.e2e).toMatchObject({ runner: null, action: "not_applicable" });
  });

  it("rejects a Jev answer that would install Playwright beside Cypress", async () => {
    const files = memoryFileStore({
      "package.json": packageJson({ devDependencies: { jest: "29.0.0", cypress: "13.0.0" }, scripts: { test: "jest" } }),
      "index.html": "<html></html>",
    });
    const discovery = await discoverProject(files);
    const legal = policyDecision(discovery);
    const constrained = constrainDecision(discovery, {
      ...legal,
      e2e: { testLevel: "e2e", applicationType: "web", runner: "playwright", action: "install", reasons: ["Jev ignored Cypress"] },
    });
    expect(constrained.e2e.runner).toBe("cypress");
    expect(constrained.e2e.action).toBe("use_existing");
  });
});

describe("runners", () => {
  it("parses Vitest JSON, Playwright JSON, and coverage", () => {
    const vitest = new VitestRunner().parseResults({
      command: "pnpm exec vitest run --reporter=json",
      exitCode: 1,
      stdout: `log\n${vitestJson}`,
      stderr: "",
      startedAt: 1,
    }, "unit");
    expect(vitest.map((item) => item.status)).toEqual(["PASSED", "FAILED"]);
    expect(vitest[0]?.name).toContain("UC-001");

    const playwright = new PlaywrightRunner().parseResults({
      command: "pnpm exec playwright test --reporter=json",
      exitCode: 0,
      stdout: playwrightJson,
      stderr: "",
      startedAt: 2,
    });
    expect(playwright[0]).toMatchObject({ type: "E2E", status: "PASSED", name: "UC-001 login" });

    expect(parseCoverageSummary(JSON.stringify({
      total: { lines: { pct: 82.4 }, branches: { pct: 70 }, functions: { pct: 90 }, statements: { pct: 81 } },
    }))).toEqual({ lines: 82.4, branches: 70, functions: 90, statements: 81 });
  });
});

describe("TestingEngine", () => {
  it("installs Playwright only when the web project has no e2e runner", async () => {
    const commands: string[] = [];
    const runner: CheckRunner = {
      async run(command) {
        commands.push(command);
        if (command.includes("vitest")) return { exitCode: 0, stdout: vitestJson, stderr: "" };
        if (command.includes("playwright test")) return { exitCode: 0, stdout: playwrightJson, stderr: "" };
        return { exitCode: 0, stdout: "", stderr: "" };
      },
    };
    const files = memoryFileStore({
      "package.json": packageJson(),
      "index.html": "<html></html>",
      ".kursor/user-cases.json": JSON.stringify([{ id: "UC-001", name: "Login", actor: "user", steps: ["Open login"], expectedResults: ["Dashboard"], priority: "critical" }]),
      ".git/HEAD": "ref: refs/heads/main\n",
      ".git/refs/heads/main": "abc123def4567890",
    });
    const store = new MemoryTestingStore();
    const engine = new TestingEngine({ files, runner, store, projectName: "Invoice" });
    const run = await engine.runLevels({ projectId: "p1", levels: ["unit", "integration", "e2e"], taskId: "task-1", agentRunId: "run-9" });
    expect(commands.some((command) => command.includes("pnpm add -D @playwright/test"))).toBe(true);
    expect(commands.some((command) => command.includes("playwright install"))).toBe(true);
    expect(run.taskId).toBe("task-1");
    expect(run.agentRunId).toBe("run-9");
    expect(run.commitSha).toBe("abc123def4567890");
    expect(run.branch).toBe("main");
    expect(run.results.some((result) => result.case.userCaseId === "UC-001")).toBe(true);
    const monitoring = await store.query({ projectId: "p1", taskId: "task-1" });
    expect(monitoring.runs).toHaveLength(1);
    expect(monitoring.userCases[0]?.id).toBe("UC-001");
    expect(monitoring.plan?.text).toContain("playwright");
  });

  it("does not reinstall Playwright when it already exists", async () => {
    const commands: string[] = [];
    const runner: CheckRunner = {
      async run(command) {
        commands.push(command);
        return { exitCode: 0, stdout: playwrightJson, stderr: "" };
      },
    };
    const files = memoryFileStore({
      "package.json": packageJson({ devDependencies: { vitest: "3.0.0", "@playwright/test": "1.0.0" } }),
      "playwright.config.ts": "export default {};",
      "index.html": "<html></html>",
    });
    const engine = new TestingEngine({ files, runner, store: new MemoryTestingStore() });
    await engine.runE2ETests({ projectId: "p1" });
    expect(commands.some((command) => command.includes("pnpm add"))).toBe(false);
    expect(commands.some((command) => command.includes("playwright test"))).toBe(true);
  });
});

describe("testingLevelsFor", () => {
  it("runs unit tests after a todo and the full strategy when the suite is unfiltered", () => {
    expect(testingLevelsFor({ kinds: ["typecheck", "test"] })).toEqual(["unit"]);
    expect(testingLevelsFor({})).toEqual(["unit", "integration", "e2e"]);
    expect(testingLevelsFor(null)).toBeNull();
  });
});
