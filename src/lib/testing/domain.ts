export type TestLevel = "unit" | "integration" | "e2e";
export type TestCaseType = "UNIT" | "INTEGRATION" | "E2E" | "REGRESSION";
export type ApplicationType = "web" | "mobile" | "desktop" | "cli" | "library" | "backend" | "unknown";
export type StrategyAction = "use_existing" | "install" | "not_applicable";
export type RunnerId =
  | "vitest"
  | "jest"
  | "playwright"
  | "cypress"
  | "pytest"
  | "junit"
  | "dotnet"
  | "appium"
  | "go"
  | "cargo"
  | "custom";

export type RunStatus = "PENDING" | "RUNNING" | "PASSED" | "FAILED" | "PARTIAL" | "CANCELLED" | "ERROR";
export type CaseStatus = "QUEUED" | "RUNNING" | "PASSED" | "FAILED" | "SKIPPED" | "ERROR";
export type UserCasePriority = "critical" | "normal";

export type TestErrorCode =
  | "TEST_EXECUTION_ERROR"
  | "TEST_CONFIGURATION_ERROR"
  | "TEST_INSTALLATION_ERROR"
  | "TEST_TIMEOUT"
  | "TEST_ENVIRONMENT_ERROR"
  | "TEST_PARSE_ERROR";

export class TestingError extends Error {
  readonly code: TestErrorCode;

  constructor(code: TestErrorCode, message: string) {
    super(message);
    this.name = "TestingError";
    this.code = code;
  }
}

export interface DetectedRunner {
  id: RunnerId;
  level: TestLevel;
  present: boolean;
  command?: string;
  configFiles: string[];
}

export interface ProjectDiscovery {
  language: string;
  ecosystem: string;
  packageManager: "pnpm" | "npm" | "yarn" | "none";
  frontend: boolean;
  backend: boolean;
  database: boolean;
  api: boolean;
  cli: boolean;
  workers: boolean;
  queues: boolean;
  browserApplication: boolean;
  mobileApplication: boolean;
  desktopApplication: boolean;
  docker: boolean;
  ci: boolean;
  scripts: Record<string, string>;
  runners: DetectedRunner[];
  markers: string[];
}

export interface LevelDecision {
  testLevel: TestLevel;
  applicationType: ApplicationType;
  runner: RunnerId | null;
  action: StrategyAction;
  reasons: string[];
}

export interface TestStrategyDecision {
  applicationType: ApplicationType;
  unit: LevelDecision;
  integration: LevelDecision;
  e2e: LevelDecision;
  reasons: string[];
}

export interface UserCase {
  id: string;
  projectId: string;
  name: string;
  description: string;
  actor: string;
  preconditions: string[];
  steps: string[];
  expectedResults: string[];
  priority: UserCasePriority;
  status: "open" | "covered" | "failing";
  linkedTests: string[];
}

export interface TestCase {
  id: string;
  name: string;
  description: string;
  type: TestCaseType;
  framework: string;
  runner: string;
  file?: string;
  status: CaseStatus;
  durationMs?: number;
  error?: string;
  stack?: string;
  taskId?: string | null;
  userCaseId?: string | null;
}

export interface CoverageSnapshot {
  lines?: number;
  branches?: number;
  functions?: number;
  statements?: number;
}

export interface BehaviorCoverage {
  userCasesCovered: number;
  userCasesTotal: number;
  criticalPathsCovered: number;
  criticalPathsTotal: number;
}

export type ArtifactKind = "screenshot" | "trace" | "video" | "log" | "stdout" | "stderr" | "report";

export interface TestArtifact {
  id: string;
  runId: string;
  kind: ArtifactKind;
  path: string;
  label: string;
  body?: string;
}

export interface TestResult {
  id: string;
  runId: string;
  projectId: string;
  taskId?: string | null;
  case: TestCase;
}

export interface CommandLog {
  command: string;
  cwd: string;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  timestamp: number;
  commitSha?: string | null;
}

export interface TestRun {
  id: string;
  projectId: string;
  taskId?: string | null;
  agentRunId?: string | null;
  commitSha?: string | null;
  branch?: string | null;
  timestamp: number;
  finishedAt?: number;
  environment: string;
  status: RunStatus;
  durationMs: number;
  levels: TestLevel[];
  results: TestResult[];
  coverage?: CoverageSnapshot;
  behavior?: BehaviorCoverage;
  artifacts: TestArtifact[];
  commandLog: CommandLog[];
  error?: string;
}

export interface TestPlan {
  projectName: string;
  applicationType: ApplicationType;
  unitPlanned: number;
  integrationPlanned: number;
  e2ePlanned: number;
  userCases: Array<{ id: string; name: string; priority: UserCasePriority }>;
  runners: string[];
  installation: string[];
  reasons: string[];
  text: string;
}

export interface MonitoringQuery {
  projectId: string;
  branch?: string;
  commitSha?: string;
  taskId?: string;
  from?: number;
  to?: number;
  status?: RunStatus;
  type?: TestCaseType;
  runner?: string;
  userCaseId?: string;
}

export interface CoveragePoint {
  runId: string;
  timestamp: number;
  coverage: CoverageSnapshot;
}

export interface MonitoringData {
  totals: {
    total: number;
    passed: number;
    failed: number;
    skipped: number;
    durationMs: number;
    coverage?: CoverageSnapshot;
  };
  byLevel: Record<TestLevel, { passed: number; failed: number; skipped: number }>;
  coverageHistory: CoveragePoint[];
  userCases: UserCase[];
  runs: TestRun[];
  failures: TestResult[];
  strategy: TestStrategyDecision | null;
  plan: TestPlan | null;
}

export interface RawRun {
  command: string;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  denied?: boolean;
  startedAt: number;
}

export function caseTypeFor(level: TestLevel): TestCaseType {
  if (level === "integration") return "INTEGRATION";
  if (level === "e2e") return "E2E";
  return "UNIT";
}

export function emptyLevelCounts(): Record<TestLevel, { passed: number; failed: number; skipped: number }> {
  return {
    unit: { passed: 0, failed: 0, skipped: 0 },
    integration: { passed: 0, failed: 0, skipped: 0 },
    e2e: { passed: 0, failed: 0, skipped: 0 },
  };
}
