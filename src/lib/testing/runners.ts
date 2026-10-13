import type { CheckRunner } from "../agent/verification/types";
import type { ContextFileStore } from "../agent/context/types";
import { addDev, exec } from "./discover";
import { casesFromProgress, progressFromOutput, reporterForCommand, type TestLevelProgress } from "./progress";
import {
  TestingError,
  caseTypeFor,
  type ArtifactKind,
  type CoverageSnapshot,
  type DetectedRunner,
  type ProjectDiscovery,
  type RawRun,
  type RunnerId,
  type TestArtifact,
  type TestCase,
  type TestLevel,
} from "./domain";

export interface RunnerContext {
  runner: CheckRunner;
  files?: ContextFileStore;
  packageManager: ProjectDiscovery["packageManager"];
  cwd: string;
  runId: string;
  discovery: ProjectDiscovery;
  signal?: AbortSignal;
  onProgress?: (progress: TestLevelProgress) => void;
  writeFile?: (path: string, content: string) => Promise<void>;
}

export interface TestRunner {
  readonly id: RunnerId;
  readonly levels: readonly TestLevel[];
  detect(discovery: ProjectDiscovery): DetectedRunner | null;
  install(ctx: RunnerContext): Promise<{ ok: boolean; note: string }>;
  configure(ctx: RunnerContext): Promise<{ ok: boolean; note: string }>;
  generate(): Promise<{ ok: boolean; note: string }>;
  run(ctx: RunnerContext, level: TestLevel): Promise<RawRun>;
  collectArtifacts(ctx: RunnerContext, raw: RawRun): Promise<TestArtifact[]>;
  parseResults(raw: RawRun, level: TestLevel): TestCase[];
  cleanup(): Promise<void>;
}

export class RunnerRegistry {
  private readonly runners = new Map<RunnerId, TestRunner>();

  register(runner: TestRunner): void {
    this.runners.set(runner.id, runner);
  }

  unregister(id: RunnerId): void {
    this.runners.delete(id);
  }

  get(id: RunnerId): TestRunner | undefined {
    return this.runners.get(id);
  }

  list(): TestRunner[] {
    return [...this.runners.values()];
  }

  detect(discovery: ProjectDiscovery): DetectedRunner[] {
    return this.list().flatMap((runner) => {
      const found = runner.detect(discovery);
      return found ? [found] : [];
    });
  }
}

export function createDefaultRegistry(): RunnerRegistry {
  const registry = new RunnerRegistry();
  registry.register(new VitestRunner());
  registry.register(new PlaywrightRunner());
  registry.register(new ScriptRunner("jest", ["unit", "integration"], (pm) => `${exec(pm, "jest")} --json`));
  registry.register(new ScriptRunner("pytest", ["unit", "integration"], () => "pytest -q"));
  registry.register(new ScriptRunner("junit", ["unit", "integration"], () => "mvn -q test"));
  registry.register(new ScriptRunner("dotnet", ["unit", "integration"], () => "dotnet test"));
  registry.register(new ScriptRunner("cargo", ["unit", "integration"], () => "cargo test"));
  registry.register(new ScriptRunner("go", ["unit", "integration"], () => "go test ./..."));
  registry.register(new ScriptRunner("cypress", ["e2e"], (pm) => `${exec(pm, "cypress")} run`));
  registry.register(new ScriptRunner("appium", ["e2e"], () => ""));
  return registry;
}

export class VitestRunner implements TestRunner {
  readonly id = "vitest" as const;
  readonly levels = ["unit", "integration"] as const;

  detect(discovery: ProjectDiscovery): DetectedRunner | null {
    return discovery.runners.find((runner) => runner.id === "vitest" && runner.level === "unit") ?? null;
  }

  async install(ctx: RunnerContext) {
    await runFixed(ctx, addDev(pm(ctx), "vitest"), "TEST_INSTALLATION_ERROR");
    return { ok: true, note: "Installed vitest." };
  }

  async configure() {
    return { ok: true, note: "Vitest uses the existing Vite or vitest config." };
  }

  async generate() {
    return { ok: true, note: "The agent writes unit tests. Vitest only executes them." };
  }

  async run(ctx: RunnerContext, level: TestLevel): Promise<RawRun> {
    const exclude = level === "unit"
      ? " --exclude **/*.integration.test.ts --exclude **/*.e2e.test.ts --passWithNoTests"
      : "";
    const include = level === "integration"
      ? " **/*.integration.test.ts tests/integration --passWithNoTests"
      : "";
    const coverage = ctx.discovery.markers.includes("coverage") || scriptHasCoverage(ctx.discovery)
      ? " --coverage.enabled --coverage.reporter=json-summary"
      : "";
    const jsonPath = `.kursor/vitest-${level}.json`;
    const raw = await runFixed(
      ctx,
      `${exec(pm(ctx), "vitest")} run --reporter=verbose --reporter=json --outputFile.json=${jsonPath}${exclude}${include}${coverage}`,
      "TEST_EXECUTION_ERROR",
      level,
    );
    const reportJson = (await ctx.files?.readFile(jsonPath).catch(() => ""))?.trim();
    return reportJson ? { ...raw, reportJson } : raw;
  }

  async collectArtifacts(_ctx: RunnerContext, raw: RawRun): Promise<TestArtifact[]> {
    return logArtifacts(raw);
  }

  parseResults(raw: RawRun, level: TestLevel): TestCase[] {
    const json = structuredReport(raw);
    const cases: TestCase[] = [];
    const files = json && Array.isArray(json.testResults) ? json.testResults : [];
    for (const file of files) {
      if (!file || typeof file !== "object") continue;
      const row = file as Record<string, unknown>;
      const fileName = typeof row.name === "string" ? row.name : undefined;
      const assertions = Array.isArray(row.assertionResults) ? row.assertionResults : [];
      for (const assertion of assertions) {
        if (!assertion || typeof assertion !== "object") continue;
        cases.push(caseFromAssertion(assertion as Record<string, unknown>, fileName, level, "vitest"));
      }
    }
    if (cases.length > 0) return cases;
    const live = casesFromReporter(raw, level, "vitest");
    if (live.length > 0) return live;
    if (noTestFilesFound(raw) || (level === "integration" && cases.length === 0)) {
      return [skippedSuite(raw, level, "vitest")];
    }
    return [summaryCase(raw, level, "vitest")];
  }

  async cleanup() {
    return undefined;
  }
}

export class PlaywrightRunner implements TestRunner {
  readonly id = "playwright" as const;
  readonly levels = ["e2e"] as const;

  detect(discovery: ProjectDiscovery): DetectedRunner | null {
    return discovery.runners.find((runner) => runner.id === "playwright") ?? null;
  }

  async install(ctx: RunnerContext) {
    await runFixed(ctx, addDev(pm(ctx), "@playwright/test"), "TEST_INSTALLATION_ERROR");
    await runFixed(ctx, `${exec(pm(ctx), "playwright")} install`, "TEST_INSTALLATION_ERROR");
    return { ok: true, note: "Installed @playwright/test and browsers." };
  }

  async configure() {
    return { ok: true, note: "Playwright uses playwright.config when it is already in the project." };
  }

  async generate() {
    return { ok: true, note: "The agent writes user-case specs. Playwright only executes them." };
  }

  async run(ctx: RunnerContext, _level?: TestLevel): Promise<RawRun> {
    const script = ctx.discovery.scripts["test:e2e"];
    const base = script && script.toLowerCase().includes("playwright")
      ? script
      : `${exec(pm(ctx), "playwright")} test --reporter=line`;
    const command = await withPreviewConfig(ctx, base);
    return runFixed(ctx, command, "TEST_EXECUTION_ERROR", "e2e");
  }

  async collectArtifacts(ctx: RunnerContext, raw: RawRun): Promise<TestArtifact[]> {
    const artifacts = logArtifacts(raw);
    const dirs = ["test-results", "playwright-report"];
    for (const dir of dirs) {
      const entries = await ctx.files?.listDirectory(dir).catch(() => []) ?? [];
      for (const entry of entries) {
        const kind = artifactKind(entry.name);
        if (!kind) continue;
        artifacts.push({
          id: `${ctx.runId}:${entry.path}`,
          runId: ctx.runId,
          kind,
          path: entry.path,
          label: entry.name,
        });
      }
    }
    return artifacts;
  }

  parseResults(raw: RawRun): TestCase[] {
    const json = structuredReport(raw);
    const suites = json && Array.isArray(json.suites) ? json.suites : [];
    const cases = flattenPlaywright(suites, "e2e");
    if (cases.length > 0) return cases;
    const live = casesFromReporter(raw, "e2e", "playwright");
    return live.length > 0 ? live : [summaryCase(raw, "e2e", "playwright")];
  }

  async cleanup() {
    return undefined;
  }
}

export class ScriptRunner implements TestRunner {
  readonly levels: readonly TestLevel[];

  constructor(
    readonly id: RunnerId,
    levels: readonly TestLevel[],
    private readonly commandFor: (pm: string, discovery: ProjectDiscovery) => string,
  ) {
    this.levels = levels;
  }

  detect(discovery: ProjectDiscovery): DetectedRunner | null {
    return discovery.runners.find((runner) => runner.id === this.id) ?? null;
  }

  async install(): Promise<{ ok: boolean; note: string }> {
    return { ok: false, note: `${this.id} install is not performed automatically.` };
  }

  async configure(): Promise<{ ok: boolean; note: string }> {
    return { ok: true, note: `Using the existing ${this.id} command.` };
  }

  async generate(): Promise<{ ok: boolean; note: string }> {
    return { ok: true, note: "The agent writes tests. This runner only executes the existing command." };
  }

  async run(ctx: RunnerContext, level: TestLevel): Promise<RawRun> {
    const detected = this.detect(ctx.discovery);
    const command = detected?.command || this.commandFor(pm(ctx), ctx.discovery);
    if (!command.trim()) {
      throw new TestingError("TEST_CONFIGURATION_ERROR", `${this.id} has no command for ${level}.`);
    }
    return runFixed(ctx, command, "TEST_EXECUTION_ERROR");
  }

  async collectArtifacts(_ctx: RunnerContext, raw: RawRun): Promise<TestArtifact[]> {
    return logArtifacts(raw);
  }

  parseResults(raw: RawRun, level: TestLevel): TestCase[] {
    const json = extractJson(raw.stdout);
    if (json && Array.isArray(json.testResults)) {
      return new VitestRunner().parseResults(raw, level).map((item) => ({ ...item, framework: this.id, runner: this.id }));
    }
    const junit = parseJUnit(raw.stdout) ?? parseJUnit(raw.stderr);
    if (junit.length > 0) {
      return junit.map((item) => ({ ...item, type: caseTypeFor(level), framework: this.id, runner: this.id }));
    }
    return [summaryCase(raw, level, this.id)];
  }

  async cleanup() {
    return undefined;
  }
}

export function parseCoverageSummary(raw: string): CoverageSnapshot | undefined {
  const json = extractJson(raw);
  const total = json?.total && typeof json.total === "object" ? json.total as Record<string, unknown> : json;
  if (!total || typeof total !== "object") return undefined;
  const snapshot: CoverageSnapshot = {};
  for (const key of ["lines", "branches", "functions", "statements"] as const) {
    const block = (total as Record<string, unknown>)[key];
    const pct = block && typeof block === "object" ? (block as { pct?: unknown }).pct : undefined;
    if (typeof pct === "number" && Number.isFinite(pct)) snapshot[key] = pct;
  }
  return Object.keys(snapshot).length > 0 ? snapshot : undefined;
}

export async function readCoverage(files?: ContextFileStore): Promise<CoverageSnapshot | undefined> {
  if (!files) return undefined;
  for (const path of ["coverage/coverage-summary.json"]) {
    const raw = await files.readFile(path).catch(() => "");
    const parsed = raw ? parseCoverageSummary(raw) : undefined;
    if (parsed) return parsed;
  }
  return undefined;
}

async function runFixed(
  ctx: RunnerContext,
  command: string,
  code: "TEST_EXECUTION_ERROR" | "TEST_INSTALLATION_ERROR",
  level?: TestLevel,
): Promise<RawRun> {
  if (ctx.signal?.aborted) {
    throw new TestingError("TEST_TIMEOUT", "Test run was cancelled.");
  }
  const startedAt = Date.now();
  let ran: Awaited<ReturnType<CheckRunner["run"]>>;
  const reporter = level ? reporterForCommand(command) : "generic";
  try {
    if (level && ctx.runner.runLive) {
      ran = await ctx.runner.runLive(command, (stdout) => {
        ctx.onProgress?.(progressFromOutput(level, reporter, stdout, false));
      }, ctx.signal);
    } else {
      ran = await ctx.runner.run(command);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Command failed.";
    if (/timed out|cancelled/i.test(message)) throw new TestingError("TEST_TIMEOUT", message);
    throw new TestingError(code, message);
  }
  if (ran.denied) {
    throw new TestingError("TEST_ENVIRONMENT_ERROR", ran.stderr || "Command was denied.");
  }
  if (level && ctx.runner.runLive) {
    ctx.onProgress?.(progressFromOutput(level, reporter, ran.stdout, true));
  }
  return {
    command,
    exitCode: ran.exitCode,
    stdout: ran.stdout,
    stderr: ran.stderr,
    denied: ran.denied,
    startedAt,
  };
}

const PREVIEW_CONFIG = ".kursor/playwright.preview.config.ts";
const PLAYWRIGHT_CONFIGS = ["playwright.config.ts", "playwright.config.mts", "playwright.config.js", "playwright.config.mjs", "playwright.config.cjs"];

export function playwrightPreviewConfig(sourceFile: string | null): string {
  const header = `import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "@playwright/test";
${sourceFile ? `import config from "../${sourceFile}";\n` : ""}
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function fromRoot(value) {
  if (!value || typeof value !== "string") return null;
  return path.isAbsolute(value) ? value : path.resolve(projectRoot, value);
}

function anchorServer(server) {
  if (!server) return undefined;
  if (Array.isArray(server)) return server.map((item) => anchorServer(item));
  return { ...server, cwd: fromRoot(server.cwd) ?? projectRoot };
}
`;
  if (!sourceFile) {
    return `${header}
export default defineConfig({
  testDir: projectRoot,
  testMatch: [
    "**/e2e/**/*.{spec,test}.{js,ts,mjs,cjs,jsx,tsx}",
    "**/*.e2e.test.{js,ts,mjs,cjs,jsx,tsx}",
    "**/*.spec.{js,ts,mjs,cjs,jsx,tsx}",
  ],
  testIgnore: ["**/node_modules/**", "**/dist/**", "**/src/**"],
  outputDir: path.join(projectRoot, "test-results"),
  use: {
    screenshot: "on",
    video: "on",
  },
});
`;
  }
  return `${header}
const resolved = config && typeof config === "object" && "default" in config ? config.default : config;
const webServer = anchorServer(resolved?.webServer);

export default defineConfig({
  ...resolved,
  testDir: fromRoot(resolved?.testDir) ?? projectRoot,
  outputDir: fromRoot(resolved?.outputDir) ?? path.join(projectRoot, "test-results"),
  ...(resolved?.testDir ? {} : {
    testMatch: [
      "**/e2e/**/*.{spec,test}.{js,ts,mjs,cjs,jsx,tsx}",
      "**/*.e2e.test.{js,ts,mjs,cjs,jsx,tsx}",
      "**/*.spec.{js,ts,mjs,cjs,jsx,tsx}",
    ],
    testIgnore: ["**/node_modules/**", "**/dist/**", "**/src/**"],
  }),
  use: {
    ...(resolved?.use ?? {}),
    screenshot: "on",
    video: "on",
  },
  ...(webServer ? { webServer } : {}),
});
`;
}

async function withPreviewConfig(ctx: RunnerContext, command: string): Promise<string> {
  if (!ctx.writeFile) return command;
  const source = PLAYWRIGHT_CONFIGS.find((name) => ctx.discovery.markers.includes(name)) ?? null;
  try {
    await ctx.writeFile(PREVIEW_CONFIG, playwrightPreviewConfig(source));
  } catch {
    return command;
  }
  if (/\s--config(?:=|\s)/.test(command)) return command;
  return `${command} --config=${PREVIEW_CONFIG}`;
}

function summaryCase(raw: RawRun, level: TestLevel, framework: string): TestCase {
  const failed = raw.exitCode !== 0;
  return {
    id: `${framework}:${level}:suite`,
    name: `${framework} ${level} suite`,
    description: raw.command,
    type: caseTypeFor(level),
    framework,
    runner: framework,
    status: failed ? "FAILED" : "PASSED",
    error: failed ? (raw.stderr || raw.stdout).slice(0, 2_000) : undefined,
    stack: failed ? raw.stderr.slice(0, 4_000) : undefined,
  };
}

function skippedSuite(raw: RawRun, level: TestLevel, framework: string): TestCase {
  return {
    id: `${framework}:${level}:suite`,
    name: `${framework} ${level} suite`,
    description: raw.command,
    type: caseTypeFor(level),
    framework,
    runner: framework,
    status: "SKIPPED",
  };
}

function noTestFilesFound(raw: RawRun): boolean {
  return /No test files found/i.test(`${raw.stderr}\n${raw.stdout}`);
}

function caseFromAssertion(row: Record<string, unknown>, file: string | undefined, level: TestLevel, framework: string): TestCase {
  const name = typeof row.fullName === "string" ? row.fullName : typeof row.title === "string" ? row.title : "test";
  const status = mapStatus(row.status);
  const failure = Array.isArray(row.failureMessages) ? row.failureMessages.filter((item) => typeof item === "string").join("\n") : "";
  return {
    id: `${framework}:${file ?? "file"}:${name}`,
    name,
    description: name,
    type: caseTypeFor(level),
    framework,
    runner: framework,
    file,
    status,
    durationMs: typeof row.duration === "number" ? row.duration : undefined,
    error: failure ? failure.slice(0, 2_000) : undefined,
    stack: failure ? failure.slice(0, 4_000) : undefined,
  };
}

function flattenPlaywright(suites: unknown[], level: TestLevel): TestCase[] {
  const cases: TestCase[] = [];
  for (const suite of suites) {
    if (!suite || typeof suite !== "object") continue;
    const row = suite as Record<string, unknown>;
    if (Array.isArray(row.suites)) cases.push(...flattenPlaywright(row.suites, level));
    const specs = Array.isArray(row.specs) ? row.specs : [];
    for (const spec of specs) {
      if (!spec || typeof spec !== "object") continue;
      const specRow = spec as Record<string, unknown>;
      const title = typeof specRow.title === "string" ? specRow.title : "spec";
      const file = typeof specRow.file === "string" ? specRow.file : typeof row.file === "string" ? row.file : undefined;
      const tests = Array.isArray(specRow.tests) ? specRow.tests : [];
      const results = tests.flatMap((test) => {
        if (!test || typeof test !== "object") return [];
        const nested = (test as { results?: unknown }).results;
        return Array.isArray(nested) ? nested : [];
      });
      const first = results[0] && typeof results[0] === "object" ? results[0] as Record<string, unknown> : undefined;
      const status = mapStatus(specRow.ok === false ? "failed" : first?.status ?? specRow.status);
      const errorText = first && typeof first.error === "object" && first.error
        ? String((first.error as { message?: unknown }).message ?? "")
        : "";
      cases.push({
        id: `playwright:${file ?? "spec"}:${title}`,
        name: title,
        description: title,
        type: "E2E",
        framework: "playwright",
        runner: "playwright",
        file,
        status,
        durationMs: typeof first?.duration === "number" ? first.duration : undefined,
        error: errorText ? errorText.slice(0, 2_000) : undefined,
        stack: errorText ? errorText.slice(0, 4_000) : undefined,
      });
    }
  }
  return cases;
}

function parseJUnit(raw: string): TestCase[] {
  if (!raw.includes("<testcase")) return [];
  const cases: TestCase[] = [];
  const pattern = /<testcase\b([^>]*)>([\s\S]*?)<\/testcase>/g;
  for (const match of raw.matchAll(pattern)) {
    const attrs = match[1] ?? "";
    const body = match[2] ?? "";
    const name = attr(attrs, "name") ?? "testcase";
    const file = attr(attrs, "classname") ?? undefined;
    const failed = /<failure\b/.test(body) || /<error\b/.test(body);
    cases.push({
      id: `junit:${file ?? "suite"}:${name}`,
      name,
      description: name,
      type: "UNIT",
      framework: "junit",
      runner: "junit",
      file,
      status: failed ? "FAILED" : "PASSED",
      error: failed ? body.replace(/<[^>]+>/g, "").trim().slice(0, 2_000) : undefined,
    });
  }
  return cases;
}

function attr(source: string, name: string): string | null {
  const match = new RegExp(`${name}="([^"]*)"`).exec(source);
  return match?.[1] ?? null;
}

function mapStatus(status: unknown): TestCase["status"] {
  const value = typeof status === "string" ? status.toLowerCase() : "";
  if (value === "passed" || value === "expected") return "PASSED";
  if (value === "failed" || value === "unexpected" || value === "timedout") return "FAILED";
  if (value === "skipped" || value === "pending" || value === "todo") return "SKIPPED";
  if (!value) return "ERROR";
  return "ERROR";
}

function structuredReport(raw: RawRun): Record<string, unknown> | null {
  const fromFile = raw.reportJson ? extractJson(raw.reportJson) : null;
  if (fromFile && (Array.isArray(fromFile.testResults) || Array.isArray(fromFile.suites))) return fromFile;
  const fromOut = extractJson(raw.stdout);
  if (fromOut && (Array.isArray(fromOut.testResults) || Array.isArray(fromOut.suites))) return fromOut;
  return null;
}

function casesFromReporter(raw: RawRun, level: TestLevel, framework: string): TestCase[] {
  const reporter = framework === "playwright" ? "playwright" as const : framework === "vitest" ? "vitest" as const : reporterForCommand(raw.command);
  const progress = progressFromOutput(level, reporter, `${raw.stdout}\n${raw.stderr}`, true);
  return progress.cases.length > 0 ? casesFromProgress(progress, framework) : [];
}

function extractJson(raw: string): Record<string, unknown> | null {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const value = JSON.parse(raw.slice(start, end + 1)) as unknown;
    return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

function logArtifacts(raw: RawRun): TestArtifact[] {
  const artifacts: TestArtifact[] = [];
  if (raw.stdout.trim()) {
    artifacts.push({ id: `stdout:${raw.startedAt}`, runId: "", kind: "stdout", path: "stdout", label: "stdout", body: raw.stdout.slice(0, 20_000) });
  }
  if (raw.stderr.trim()) {
    artifacts.push({ id: `stderr:${raw.startedAt}`, runId: "", kind: "stderr", path: "stderr", label: "stderr", body: raw.stderr.slice(0, 20_000) });
  }
  return artifacts;
}

function artifactKind(name: string): ArtifactKind | null {
  const lower = name.toLowerCase();
  if (lower.endsWith(".png") || lower.endsWith(".jpg") || lower.endsWith(".webp")) return "screenshot";
  if (lower.endsWith(".zip") || lower.includes("trace")) return "trace";
  if (lower.endsWith(".webm") || lower.endsWith(".mp4")) return "video";
  if (lower.endsWith(".log") || lower.endsWith(".txt")) return "log";
  return null;
}

function scriptHasCoverage(discovery: ProjectDiscovery): boolean {
  return Object.values(discovery.scripts).some((script) => script.includes("coverage"));
}

function pm(ctx: RunnerContext): string {
  return ctx.packageManager === "none" ? "pnpm" : ctx.packageManager;
}
