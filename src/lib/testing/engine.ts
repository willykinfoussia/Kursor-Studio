import type { AIService } from "../agent/AIService";
import type { ContextFileStore } from "../agent/context/types";
import type { CheckRunner } from "../agent/verification/types";
import { decideStrategy } from "./decide";
import { discoverProject, loadUserCases } from "./discover";
import {
  TestingError,
  emptyLevelCounts,
  type BehaviorCoverage,
  type CommandLog,
  type CoverageSnapshot,
  type LevelDecision,
  type RunStatus,
  type TestArtifact,
  type TestCase,
  type TestLevel,
  type TestPlan,
  type TestResult,
  type TestRun,
  type TestStrategyDecision,
  type UserCase,
} from "./domain";
import { createDefaultRegistry, readCoverage, type RunnerRegistry, type TestRunner } from "./runners";
import type { TestingStore } from "./store";

export interface TestingEngineOptions {
  files?: ContextFileStore;
  runner: CheckRunner;
  store: TestingStore;
  ai?: AIService;
  registry?: RunnerRegistry;
  cwd?: string;
  projectName?: string;
}

export interface RunLevelsInput {
  projectId: string;
  levels: TestLevel[];
  taskId?: string | null;
  agentRunId?: string | null;
  signal?: AbortSignal;
}

export class TestingEngine {
  private readonly registry: RunnerRegistry;

  constructor(private readonly options: TestingEngineOptions) {
    this.registry = options.registry ?? createDefaultRegistry();
  }

  async discoverStrategy(projectId: string, signal?: AbortSignal): Promise<TestStrategyDecision> {
    const discovery = await discoverProject(this.options.files);
    const loaded = await loadUserCases(this.options.files, projectId);
    const decided = await decideStrategy(discovery, this.options.ai, loaded, signal);
    await this.options.store.saveStrategy(projectId, decided.decision);
    await this.options.store.saveUserCases(projectId, decided.userCases);
    return decided.decision;
  }

  async planTests(projectId: string, projectName = this.options.projectName ?? "Project"): Promise<TestPlan> {
    const strategy = await this.options.store.getStrategy(projectId) ?? await this.discoverStrategy(projectId);
    const userCases = await this.options.store.listUserCases(projectId);
    return buildPlan(projectName, strategy, userCases);
  }

  async prepareEnvironment(projectId: string, levels: readonly TestLevel[], signal?: AbortSignal): Promise<void> {
    const strategy = await this.options.store.getStrategy(projectId) ?? await this.discoverStrategy(projectId, signal);
    const discovery = await discoverProject(this.options.files);
    for (const level of levels) {
      const decision = strategy[level];
      if (decision.action !== "install" || !decision.runner) continue;
      const runner = this.registry.get(decision.runner);
      if (!runner) {
        throw new TestingError("TEST_CONFIGURATION_ERROR", `No runner registered for ${decision.runner}.`);
      }
      await runner.install(this.context(discovery, "install", signal));
    }
  }

  async runUnitTests(input: Omit<RunLevelsInput, "levels">): Promise<TestRun> {
    return this.runLevels({ ...input, levels: ["unit"] });
  }

  async runIntegrationTests(input: Omit<RunLevelsInput, "levels">): Promise<TestRun> {
    return this.runLevels({ ...input, levels: ["integration"] });
  }

  async runE2ETests(input: Omit<RunLevelsInput, "levels">): Promise<TestRun> {
    return this.runLevels({ ...input, levels: ["e2e"] });
  }

  async runLevels(input: RunLevelsInput): Promise<TestRun> {
    const started = Date.now();
    const discovery = await discoverProject(this.options.files);
    const strategy = await this.options.store.getStrategy(input.projectId) ?? await this.discoverStrategy(input.projectId, input.signal);
    const userCases = await this.options.store.listUserCases(input.projectId);
    const git = await readGit(this.options.files);
    const run: TestRun = {
      id: crypto.randomUUID(),
      projectId: input.projectId,
      taskId: input.taskId ?? null,
      agentRunId: input.agentRunId ?? null,
      commitSha: git.commitSha,
      branch: git.branch,
      timestamp: started,
      environment: `${discovery.ecosystem}/${discovery.packageManager}`,
      status: "RUNNING",
      durationMs: 0,
      levels: [...input.levels],
      results: [],
      artifacts: [],
      commandLog: [],
    };

    try {
      if (input.signal?.aborted) {
        run.status = "CANCELLED";
        return await this.finish(run, userCases);
      }
      for (const level of input.levels) {
        const decision = strategy[level];
        if (decision.action === "not_applicable" || !decision.runner) continue;
        const runner = this.registry.get(decision.runner);
        if (!runner) {
          throw new TestingError("TEST_CONFIGURATION_ERROR", `No runner registered for ${decision.runner}.`);
        }
        if (decision.action === "install" && !runner.detect(discovery)) {
          await runner.install(this.context(discovery, run.id, input.signal));
        }
        const raw = await runner.run(this.context(discovery, run.id, input.signal), level);
        run.commandLog.push(commandLog(raw, this.options.cwd ?? "", git.commitSha));
        const cases = linkCases(runner.parseResults(raw, level), userCases, input.taskId);
        const artifacts = (await runner.collectArtifacts(this.context(discovery, run.id, input.signal), raw))
          .map((artifact) => ({ ...artifact, runId: run.id, id: `${run.id}:${artifact.id}` }));
        run.artifacts.push(...artifacts);
        run.results.push(...cases.map((item) => toResult(run, item)));
      }
      run.coverage = await this.collectCoverage();
      run.status = statusFor(run, input.levels, strategy);
    } catch (error) {
      run.status = error instanceof TestingError && error.code === "TEST_TIMEOUT" ? "CANCELLED" : "ERROR";
      run.error = error instanceof TestingError
        ? `${error.code}: ${error.message}`
        : error instanceof Error ? error.message : "Test run failed.";
    }
    return this.finish(run, userCases);
  }

  async collectCoverage(): Promise<CoverageSnapshot | undefined> {
    return readCoverage(this.options.files);
  }

  async collectArtifacts(run: TestRun): Promise<TestArtifact[]> {
    return run.artifacts;
  }

  async persistRun(run: TestRun): Promise<void> {
    await this.options.store.saveRun(run);
  }

  getMonitoringData(projectId: string) {
    return this.options.store.query({ projectId });
  }

  private async finish(run: TestRun, userCases: UserCase[]): Promise<TestRun> {
    run.finishedAt = Date.now();
    run.durationMs = run.finishedAt - run.timestamp;
    run.behavior = behaviorCoverage(userCases, run.results.map((result) => result.case));
    await this.options.store.saveUserCases(run.projectId, refreshUserCases(userCases, run.results.map((result) => result.case)));
    await this.options.store.saveRun(run);
    return run;
  }

  private context(discovery: Awaited<ReturnType<typeof discoverProject>>, runId: string, signal?: AbortSignal) {
    return {
      runner: this.options.runner,
      files: this.options.files,
      packageManager: discovery.packageManager,
      cwd: this.options.cwd ?? "",
      runId,
      discovery,
      signal,
    };
  }
}

export function buildPlan(projectName: string, strategy: TestStrategyDecision, userCases: UserCase[]): TestPlan {
  const e2eCases = userCases.filter((userCase) => userCase.priority === "critical");
  const runners = [strategy.unit.runner, strategy.e2e.runner].filter((runner): runner is NonNullable<typeof runner> => Boolean(runner));
  const installation = [strategy.unit, strategy.integration, strategy.e2e]
    .filter((level) => level.action === "install" && level.runner)
    .map((level) => `${level.runner} required for ${level.testLevel}`);
  const plan: TestPlan = {
    projectName,
    applicationType: strategy.applicationType,
    unitPlanned: strategy.unit.action === "not_applicable" ? 0 : userCases.filter((item) => item.linkedTests.length > 0).length || (strategy.unit.runner ? 1 : 0),
    integrationPlanned: strategy.integration.action === "not_applicable" ? 0 : 1,
    e2ePlanned: strategy.e2e.action === "not_applicable" ? 0 : Math.max(e2eCases.length, strategy.e2e.runner ? 1 : 0),
    userCases: userCases.map((userCase) => ({ id: userCase.id, name: userCase.name, priority: userCase.priority })),
    runners: [...new Set(runners)],
    installation,
    reasons: strategy.reasons,
    text: "",
  };
  plan.text = renderPlan(plan, strategy);
  return plan;
}

function renderPlan(plan: TestPlan, strategy: TestStrategyDecision): string {
  const lines = [
    "TEST PLAN",
    "",
    "Project:",
    `    ${plan.projectName}`,
    "",
    "Application:",
    `    ${plan.applicationType}`,
    "",
    "Unit:",
    `    ${describeLevel(strategy.unit)}`,
    "",
    "Integration:",
    `    ${describeLevel(strategy.integration)}`,
    "",
    "E2E:",
    `    ${describeLevel(strategy.e2e)}`,
    "",
    "User Cases:",
    ...(plan.userCases.length > 0 ? plan.userCases.map((userCase) => `    ${userCase.id} ${userCase.name}`) : ["    none"]),
    "",
    "Runner:",
    `    ${plan.runners.join(", ") || "none"}`,
    "",
    "Installation:",
    ...(plan.installation.length > 0 ? plan.installation.map((line) => `    ${line}`) : ["    none"]),
    "",
    "Reason:",
    ...plan.reasons.map((reason) => `    ${reason}`),
  ];
  return lines.join("\n");
}

function describeLevel(level: LevelDecision): string {
  if (level.action === "not_applicable") return "NOT_APPLICABLE";
  return `${level.action} ${level.runner ?? ""}`.trim();
}

function statusFor(run: TestRun, levels: readonly TestLevel[], strategy: TestStrategyDecision): RunStatus {
  const required = levels.filter((level) => strategy[level].action !== "not_applicable");
  if (required.length === 0) return "PASSED";
  const cases = run.results.map((result) => result.case);
  if (cases.length === 0) return "ERROR";
  const failed = cases.some((item) => item.status === "FAILED" || item.status === "ERROR");
  const passed = cases.some((item) => item.status === "PASSED");
  if (failed && passed) return "PARTIAL";
  if (failed) return "FAILED";
  return "PASSED";
}

function behaviorCoverage(userCases: UserCase[], cases: TestCase[]): BehaviorCoverage {
  const critical = userCases.filter((userCase) => userCase.priority === "critical");
  return {
    userCasesTotal: userCases.length,
    userCasesCovered: userCases.filter((userCase) => covered(userCase, cases)).length,
    criticalPathsTotal: critical.length,
    criticalPathsCovered: critical.filter((userCase) => covered(userCase, cases, true)).length,
  };
}

function covered(userCase: UserCase, cases: TestCase[], requirePass = false): boolean {
  return cases.some((item) => {
    if (item.userCaseId !== userCase.id && !userCase.linkedTests.includes(item.name) && !item.name.includes(userCase.id)) return false;
    if (!requirePass) return item.status === "PASSED" || item.status === "FAILED";
    return item.status === "PASSED";
  });
}

function refreshUserCases(userCases: UserCase[], cases: TestCase[]): UserCase[] {
  return userCases.map((userCase) => {
    const linked = cases.filter((item) => item.userCaseId === userCase.id || item.name.includes(userCase.id) || userCase.linkedTests.includes(item.name));
    const status = linked.some((item) => item.status === "FAILED" || item.status === "ERROR")
      ? "failing" as const
      : linked.some((item) => item.status === "PASSED")
        ? "covered" as const
        : userCase.status;
    return {
      ...userCase,
      status,
      linkedTests: [...new Set([...userCase.linkedTests, ...linked.map((item) => item.name)])],
    };
  });
}

function linkCases(cases: TestCase[], userCases: UserCase[], taskId?: string | null): TestCase[] {
  return cases.map((item) => {
    const match = userCases.find((userCase) => item.name.includes(userCase.id) || userCase.linkedTests.includes(item.name) || userCase.linkedTests.includes(item.file ?? ""));
    return { ...item, taskId: taskId ?? null, userCaseId: match?.id ?? item.userCaseId ?? null };
  });
}

function toResult(run: TestRun, item: TestCase): TestResult {
  return {
    id: `${run.id}:${item.id}`,
    runId: run.id,
    projectId: run.projectId,
    taskId: run.taskId,
    case: item,
  };
}

function commandLog(raw: { command: string; exitCode: number | null; stdout: string; stderr: string; startedAt: number }, cwd: string, commitSha: string | null): CommandLog {
  return {
    command: raw.command,
    cwd,
    exitCode: raw.exitCode,
    stdout: raw.stdout.slice(0, 20_000),
    stderr: raw.stderr.slice(0, 20_000),
    timestamp: raw.startedAt,
    commitSha,
  };
}

async function readGit(files?: ContextFileStore): Promise<{ branch: string | null; commitSha: string | null }> {
  if (!files) return { branch: null, commitSha: null };
  const head = (await files.readFile(".git/HEAD").catch(() => "")).trim();
  if (head.startsWith("ref: ")) {
    const ref = head.slice(5).trim();
    const branch = ref.split("/").pop() ?? null;
    const sha = (await files.readFile(`.git/${ref}`).catch(() => "")).trim();
    return { branch, commitSha: /^[0-9a-f]{7,40}$/i.test(sha) ? sha : null };
  }
  if (/^[0-9a-f]{7,40}$/i.test(head)) return { branch: null, commitSha: head };
  return { branch: null, commitSha: null };
}

export function levelCounts(results: TestResult[]) {
  const counts = emptyLevelCounts();
  for (const result of results) {
    const level = result.case.type === "INTEGRATION" ? "integration" : result.case.type === "E2E" ? "e2e" : "unit";
    if (result.case.status === "PASSED") counts[level].passed += 1;
    else if (result.case.status === "FAILED" || result.case.status === "ERROR") counts[level].failed += 1;
    else counts[level].skipped += 1;
  }
  return counts;
}

export type { TestRunner };
