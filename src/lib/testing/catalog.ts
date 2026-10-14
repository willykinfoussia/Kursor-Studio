import type { ContextFileStore } from "../agent/context/types";
import {
  caseTypeFor,
  type CaseStatus,
  type CatalogEntry,
  type CommandLog,
  type TestArtifact,
  type TestCase,
  type TestCaseType,
  type TestLevel,
  type TestResult,
  type TestRun,
  type TestStrategyDecision,
  type UserCase,
} from "./domain";

export interface DiscoveredTest {
  file: string;
  level: TestLevel;
  titles: string[];
}

const SKIP_DIRS = new Set([
  "node_modules",
  "dist",
  "test-results",
  "playwright-report",
  "coverage",
  ".git",
  ".kursor",
  "build",
  "out",
  "target",
]);

const TEST_CALL = /(?:^|\n)\s*(?:test|it)(?:\.(?:only|skip|fixme))?\(\s*(['"`])([^'"`\n]+)\1/g;
const DESCRIBE_CALL = /(?:^|\n)\s*(?:test\.)?describe(?:\.(?:only|skip))?\(\s*(['"`])([^'"`\n]+)\1/g;
const MAX_TEST_FILES = 400;
const MAX_DEPTH = 12;

export async function discoverTestFiles(files: ContextFileStore): Promise<DiscoveredTest[]> {
  const found: DiscoveredTest[] = [];
  await walkTests(files, "", 0, found);
  return found;
}

export function buildCatalog(input: {
  runs: TestRun[];
  userCases: UserCase[];
  discovered?: DiscoveredTest[];
  strategy?: TestStrategyDecision | null;
}): CatalogEntry[] {
  const runs = [...input.runs].sort((a, b) => b.timestamp - a.timestamp);
  const latest = new Map<string, { result: TestResult; run: TestRun }>();
  for (const run of runs) {
    for (const result of run.results) {
      if (!latest.has(result.case.id)) latest.set(result.case.id, { result, run });
    }
  }

  const entries: CatalogEntry[] = [];
  const seen: Array<{ file: string; name: string }> = [];
  for (const hit of latest.values()) {
    const entry = entryFromResult(hit.result, hit.run, input.userCases);
    entries.push(entry);
    seen.push({ file: normalizePath(entry.file ?? ""), name: entry.name.trim().toLowerCase() });
  }

  for (const file of input.discovered ?? []) {
    const titles = file.titles.length > 0 ? file.titles : [fileLabel(file.file)];
    for (const title of titles) {
      if (seen.some((item) => item.name === title.trim().toLowerCase() && sameFile(item.file, file.file))) continue;
      seen.push({ file: normalizePath(file.file), name: title.trim().toLowerCase() });
      entries.push(entryFromFile(file, title, input.userCases, input.strategy));
    }
  }

  return entries.sort((a, b) => statusRank(a.status) - statusRank(b.status) || a.name.localeCompare(b.name));
}

function entryFromResult(result: TestResult, run: TestRun, userCases: UserCase[]): CatalogEntry {
  const linked = describeCase(result.case.name, result.case.description, result.case.file, result.case.userCaseId, userCases);
  const level = levelForType(result.case.type);
  return {
    id: result.case.id,
    level,
    type: result.case.type,
    name: result.case.name,
    description: linked.description,
    file: result.case.file,
    runner: result.case.runner,
    framework: result.case.framework,
    status: result.case.status,
    durationMs: result.case.durationMs,
    error: result.case.error,
    stack: result.case.stack,
    userCase: linked.userCase,
    steps: linked.steps,
    expectedResults: linked.expectedResults,
    preconditions: linked.preconditions,
    artifacts: artifactsFor(run, result.case),
    command: commandFor(run, level),
    runId: run.id,
  };
}

function entryFromFile(
  file: DiscoveredTest,
  title: string,
  userCases: UserCase[],
  strategy?: TestStrategyDecision | null,
): CatalogEntry {
  const linked = describeCase(title, title, file.file, null, userCases);
  const runner = strategy?.[file.level].runner ?? (file.level === "e2e" ? "playwright" : "vitest");
  return {
    id: `queued:${file.level}:${file.file}:${title}`,
    level: file.level,
    type: caseTypeFor(file.level),
    name: title,
    description: linked.description,
    file: file.file,
    runner: runner ?? (file.level === "e2e" ? "playwright" : "vitest"),
    framework: runner ?? (file.level === "e2e" ? "playwright" : "vitest"),
    status: "QUEUED",
    userCase: linked.userCase,
    steps: linked.steps,
    expectedResults: linked.expectedResults,
    preconditions: linked.preconditions,
    artifacts: [],
    command: null,
  };
}

function describeCase(
  name: string,
  fallback: string,
  file: string | undefined,
  userCaseId: string | null | undefined,
  userCases: UserCase[],
) {
  const userCase = userCases.find((item) =>
    (userCaseId && item.id === userCaseId)
    || name.includes(item.id)
    || item.linkedTests.includes(name)
    || (file ? item.linkedTests.some((link) => sameFile(link, file)) : false)
  ) ?? null;
  return {
    userCase,
    description: userCase?.description.trim() || fallback.trim() || name,
    steps: userCase?.steps ?? [],
    expectedResults: userCase?.expectedResults ?? [],
    preconditions: userCase?.preconditions ?? [],
  };
}

function artifactsFor(run: TestRun, testCase: TestCase): TestArtifact[] {
  const media = run.artifacts.filter((artifact) => artifact.kind === "video" || artifact.kind === "screenshot" || artifact.kind === "trace");
  const linked = media.filter((artifact) => artifact.caseId === testCase.id);
  if (linked.length > 0) return linked;
  const matched = media.filter((artifact) => !artifact.caseId && pathMatchesCase(artifact.path, testCase));
  if (matched.length > 0) return matched;
  const e2eCases = run.results.filter((result) => result.case.type === "E2E");
  if (testCase.type === "E2E" && e2eCases.length === 1 && e2eCases[0]?.case.id === testCase.id) {
    return media.filter((artifact) => !artifact.caseId);
  }
  return [];
}

function pathMatchesCase(path: string, testCase: TestCase): boolean {
  const title = slug(testCase.name);
  if (title.length >= 3 && includesSlug(path, title)) return true;
  const stem = fileStem(testCase.file);
  return Boolean(stem && stem.length >= 3 && includesSlug(path, stem));
}

function commandFor(run: TestRun, level: TestLevel): CommandLog | null {
  return run.commandLog.find((entry) => entry.level === level) ?? run.commandLog[0] ?? null;
}

function levelForType(type: TestCaseType): TestLevel {
  if (type === "INTEGRATION") return "integration";
  if (type === "E2E") return "e2e";
  return "unit";
}

function statusRank(status: CaseStatus): number {
  if (status === "FAILED" || status === "ERROR") return 0;
  if (status === "RUNNING") return 1;
  if (status === "QUEUED") return 2;
  if (status === "SKIPPED") return 3;
  return 4;
}

function sameFile(left: string, right: string): boolean {
  const a = normalizePath(left);
  const b = normalizePath(right);
  if (!a || !b) return false;
  return a === b || a.endsWith(`/${b}`) || b.endsWith(`/${a}`);
}

function normalizePath(path: string): string {
  return path.replace(/\\/g, "/").replace(/^\.\//, "").toLowerCase();
}

function fileLabel(file: string): string {
  return file.split("/").pop() ?? file;
}

async function walkTests(files: ContextFileStore, dir: string, depth: number, found: DiscoveredTest[]) {
  if (depth > MAX_DEPTH || found.length >= MAX_TEST_FILES) return;
  const entries = await files.listDirectory(dir).catch(() => []);
  for (const entry of entries) {
    if (found.length >= MAX_TEST_FILES) return;
    if (SKIP_DIRS.has(entry.name)) continue;
    if (entry.kind === "directory") {
      await walkTests(files, entry.path, depth + 1, found);
      continue;
    }
    const level = levelForTestFile(entry.path);
    if (!level) continue;
    const source = await files.readFile(entry.path).catch(() => "");
    found.push({ file: entry.path.replace(/\\/g, "/"), level, titles: titlesIn(source) });
  }
}

export function levelForTestFile(path: string): TestLevel | null {
  const norm = path.replace(/\\/g, "/");
  if (!/\.(js|jsx|ts|tsx|mjs|cjs)$/i.test(norm)) return null;
  if (/\.integration\.test\.[^.]+$/i.test(norm) || /(?:^|\/)tests\/integration\//i.test(norm)) return "integration";
  if (/\.e2e\.test\.[^.]+$/i.test(norm) || /(?:^|\/)e2e\//i.test(norm)) return "e2e";
  const inSrc = /(?:^|\/)src\//.test(norm);
  if (/\.spec\.[^.]+$/i.test(norm) && !inSrc) return "e2e";
  if (/\.(test|spec)\.[^.]+$/i.test(norm)) return "unit";
  return null;
}

function titlesIn(source: string): string[] {
  const tests = uniqueTitles(source, TEST_CALL);
  if (tests.length > 0) return tests;
  return uniqueTitles(source, DESCRIBE_CALL);
}

function uniqueTitles(source: string, pattern: RegExp): string[] {
  const titles: string[] = [];
  const seen = new Set<string>();
  for (const match of source.matchAll(pattern)) {
    const title = (match[2] ?? "").trim();
    if (!title || seen.has(title)) continue;
    seen.add(title);
    titles.push(title);
  }
  return titles;
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function fileStem(file: string | undefined): string {
  if (!file) return "";
  const base = file.replace(/\\/g, "/").split("/").pop() ?? "";
  return slug(base.replace(/\.[^.]+$/, "").replace(/\.(spec|test|e2e|integration)$/i, ""));
}

function includesSlug(path: string, slugValue: string): boolean {
  return path.replace(/\\/g, "/").toLowerCase().includes(slugValue);
}
