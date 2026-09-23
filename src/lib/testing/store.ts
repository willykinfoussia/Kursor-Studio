import { isTauri } from "../tauri/invoke";
import { databaseApi } from "../tauri/databaseApi";
import type {
  CoverageSnapshotRecord,
  TestArtifactRecord,
  TestResultRecord,
  TestRunRecord,
  TestStrategyRecord,
  UserCaseRecord,
} from "../storage/types";
import { buildPlan } from "./engine";
import {
  emptyLevelCounts,
  type CoverageSnapshot,
  type MonitoringData,
  type MonitoringQuery,
  type TestArtifact,
  type TestLevel,
  type TestResult,
  type TestRun,
  type TestStrategyDecision,
  type UserCase,
} from "./domain";

export interface TestingStore {
  saveStrategy(projectId: string, decision: TestStrategyDecision): Promise<void>;
  getStrategy(projectId: string): Promise<TestStrategyDecision | null>;
  saveUserCases(projectId: string, cases: UserCase[]): Promise<void>;
  listUserCases(projectId: string): Promise<UserCase[]>;
  saveRun(run: TestRun): Promise<void>;
  query(query: MonitoringQuery): Promise<MonitoringData>;
}

export class MemoryTestingStore implements TestingStore {
  private readonly strategies = new Map<string, TestStrategyDecision>();
  private readonly userCases = new Map<string, UserCase[]>();
  private readonly runs: TestRun[] = [];

  async saveStrategy(projectId: string, decision: TestStrategyDecision): Promise<void> {
    this.strategies.set(projectId, decision);
  }

  async getStrategy(projectId: string): Promise<TestStrategyDecision | null> {
    return this.strategies.get(projectId) ?? null;
  }

  async saveUserCases(projectId: string, cases: UserCase[]): Promise<void> {
    this.userCases.set(projectId, cases.map((item) => ({ ...item, projectId })));
  }

  async listUserCases(projectId: string): Promise<UserCase[]> {
    return this.userCases.get(projectId) ?? [];
  }

  async saveRun(run: TestRun): Promise<void> {
    const index = this.runs.findIndex((item) => item.id === run.id);
    if (index >= 0) this.runs[index] = run;
    else this.runs.push(run);
  }

  async query(query: MonitoringQuery): Promise<MonitoringData> {
    return assemble(query, this.runs.filter((run) => matchesRun(run, query)), await this.listUserCases(query.projectId), await this.getStrategy(query.projectId));
  }
}

const memoryStore = new MemoryTestingStore();

export function createTestingStore(): TestingStore {
  return isTauri() ? sqliteTestingStore : memoryStore;
}

export const sqliteTestingStore: TestingStore = {
  async saveStrategy(projectId, decision) {
    const record: TestStrategyRecord = {
      projectId,
      payloadJson: JSON.stringify(decision),
      updatedAt: Date.now(),
    };
    await databaseApi.testStrategyUpsert(record);
  },
  async getStrategy(projectId) {
    const record = await databaseApi.testStrategyGet(projectId);
    if (!record?.payloadJson) return null;
    return JSON.parse(record.payloadJson) as TestStrategyDecision;
  },
  async saveUserCases(projectId, cases) {
    const records: UserCaseRecord[] = cases.map((item) => ({
      id: item.id,
      projectId,
      name: item.name,
      priority: item.priority,
      status: item.status,
      payloadJson: JSON.stringify(item),
      updatedAt: Date.now(),
    }));
    await databaseApi.userCasesReplace(projectId, records);
  },
  async listUserCases(projectId) {
    const records = await databaseApi.userCasesList(projectId);
    return records.map((record) => JSON.parse(record.payloadJson) as UserCase);
  },
  async saveRun(run) {
    await databaseApi.testRunSave(toBundle(run));
  },
  async query(query) {
    const bundle = await databaseApi.testMonitoringQuery({
      projectId: query.projectId,
      branch: query.branch ?? null,
      commitSha: query.commitSha ?? null,
      taskId: query.taskId ?? null,
      status: query.status ?? null,
      fromMs: query.from ?? null,
      toMs: query.to ?? null,
      testType: query.type ?? null,
      runner: query.runner ?? null,
      userCaseId: query.userCaseId ?? null,
    });
    const runs = bundle.runs.map((record) => JSON.parse(record.payloadJson) as TestRun);
    const strategy = bundle.strategy ? JSON.parse(bundle.strategy.payloadJson) as TestStrategyDecision : null;
    const userCases = bundle.userCases.map((record) => JSON.parse(record.payloadJson) as UserCase);
    return assemble(query, runs, userCases, strategy);
  },
};

function assemble(
  query: MonitoringQuery,
  runs: TestRun[],
  userCases: UserCase[],
  strategy: TestStrategyDecision | null,
): MonitoringData {
  const filteredRuns = runs
    .filter((run) => matchesRun(run, query))
    .map((run) => ({ ...run, results: run.results.filter((result) => matchesResult(result, query)) }))
    .filter((run) => !hasResultFilter(query) || run.results.length > 0)
    .sort((a, b) => b.timestamp - a.timestamp);
  const results = filteredRuns.flatMap((run) => run.results);
  const totals = {
    total: results.length,
    passed: results.filter((result) => result.case.status === "PASSED").length,
    failed: results.filter((result) => result.case.status === "FAILED" || result.case.status === "ERROR").length,
    skipped: results.filter((result) => result.case.status === "SKIPPED").length,
    durationMs: filteredRuns.reduce((sum, run) => sum + run.durationMs, 0),
    coverage: filteredRuns.find((run) => run.coverage)?.coverage,
  };
  const byLevel = emptyLevelCounts();
  for (const result of results) {
    const level: TestLevel = result.case.type === "INTEGRATION" ? "integration" : result.case.type === "E2E" ? "e2e" : "unit";
    if (result.case.status === "PASSED") byLevel[level].passed += 1;
    else if (result.case.status === "FAILED" || result.case.status === "ERROR") byLevel[level].failed += 1;
    else byLevel[level].skipped += 1;
  }
  return {
    totals,
    byLevel,
    coverageHistory: filteredRuns
      .filter((run) => run.coverage)
      .map((run) => ({ runId: run.id, timestamp: run.timestamp, coverage: run.coverage as CoverageSnapshot }))
      .sort((a, b) => a.timestamp - b.timestamp),
    userCases,
    runs: filteredRuns,
    failures: results.filter((result) => result.case.status === "FAILED" || result.case.status === "ERROR"),
    strategy,
    plan: strategy ? buildPlan("Project", strategy, userCases) : null,
  };
}

function matchesRun(run: TestRun, query: MonitoringQuery): boolean {
  if (run.projectId !== query.projectId) return false;
  if (query.branch && run.branch !== query.branch) return false;
  if (query.commitSha && run.commitSha !== query.commitSha) return false;
  if (query.taskId && run.taskId !== query.taskId) return false;
  if (query.status && run.status !== query.status) return false;
  if (typeof query.from === "number" && run.timestamp < query.from) return false;
  if (typeof query.to === "number" && run.timestamp > query.to) return false;
  return true;
}

function matchesResult(result: TestResult, query: MonitoringQuery): boolean {
  if (query.type && result.case.type !== query.type) return false;
  if (query.runner && result.case.runner !== query.runner) return false;
  if (query.userCaseId && result.case.userCaseId !== query.userCaseId) return false;
  return true;
}

function hasResultFilter(query: MonitoringQuery): boolean {
  return Boolean(query.type || query.runner || query.userCaseId);
}

function toBundle(run: TestRun) {
  const runRecord: TestRunRecord = {
    id: run.id,
    projectId: run.projectId,
    taskId: run.taskId ?? null,
    agentRunId: run.agentRunId ?? null,
    commitSha: run.commitSha ?? null,
    branch: run.branch ?? null,
    status: run.status,
    startedAt: run.timestamp,
    durationMs: run.durationMs,
    payloadJson: JSON.stringify(run),
  };
  const results: TestResultRecord[] = run.results.map((result) => ({
    id: result.id,
    runId: run.id,
    projectId: run.projectId,
    taskId: result.taskId ?? null,
    userCaseId: result.case.userCaseId ?? null,
    name: result.case.name,
    testType: result.case.type,
    runner: result.case.runner,
    status: result.case.status,
    durationMs: result.case.durationMs ?? null,
    error: result.case.error ?? null,
    file: result.case.file ?? null,
  }));
  const coverage: CoverageSnapshotRecord | null = run.coverage
    ? {
      id: `${run.id}:coverage`,
      runId: run.id,
      projectId: run.projectId,
      lines: run.coverage.lines ?? null,
      branches: run.coverage.branches ?? null,
      functions: run.coverage.functions ?? null,
      statements: run.coverage.statements ?? null,
      createdAt: run.timestamp,
    }
    : null;
  const artifacts: TestArtifactRecord[] = run.artifacts.map((artifact: TestArtifact) => ({
    id: artifact.id,
    runId: run.id,
    kind: artifact.kind,
    path: artifact.path,
    label: artifact.label,
  }));
  return { run: runRecord, results, coverage, artifacts };
}
